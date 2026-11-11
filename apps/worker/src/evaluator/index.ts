import { productionEvaluatorProviders, type EvaluatorProviders } from '@skyclause/api/evaluator'
import { PollRecordedEventSchema, type EventType } from '@skyclause/contracts'
import {
  lockEvaluatorProject,
  completeEvaluatorReevaluation,
  evaluatorNeedsEvaluation,
  findSourceTargets,
  listEvaluatorProjects,
  loadEvaluatorDeadline,
  matchEvaluatorDeadline,
  replaceEvaluatorDeadline,
  requestEvaluatorPoll,
  requestEvaluatorProject,
  systemPrincipal,
  validateEvaluatorPoll,
  withSystem,
  withTenant,
  type SourceTarget,
  type Tx
} from '@skyclause/db'
import { ReadingsUpdated } from '@skyclause/sources'
import { z } from 'zod'
import { onEvent } from '../events'
import { type EventConsumer, type WorkerPart } from '../server'
import { cloudEvaluatorTasks, EVALUATOR_DEADLINES, type EvaluatorTaskTransport } from './cloud-tasks'
import { deliverSourceTransitions, repairEvaluatorDeadline } from './delivery'
import { evaluateProject } from './evaluate'
import { recordSourceTransitions } from './source-state'

const Body = z.strictObject({ org: z.uuid(), project: z.uuid(), generation: z.uuid(), dueAt: z.iso.datetime() })
export function createEvaluatorPart(q: {
  providers: EvaluatorProviders
  clock: () => Date
  tasks: EvaluatorTaskTransport
}): WorkerPart {
  const run = <T>(target: SourceTarget, fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId: target.orgId, principal: systemPrincipal('evaluator') }, fn)
  async function evaluate(target: SourceTarget, body?: z.infer<typeof Body>, measurementPollId?: string) {
    const result = await run(target, async (tx) => {
      await lockEvaluatorProject(tx, target.projectId)
      const now = q.clock()
      if (body) {
        const status = await matchEvaluatorDeadline(tx, body, now)
        if (status === 'obsolete') return null
        if (status === 'early') throw new Error('Evaluator deadline is not due yet')
      }
      await requestEvaluatorProject(tx, {
        projectId: target.projectId,
        tEval: now.toISOString(),
        reason: body ? 'deadline' : 'delivery'
      })
      const result = await evaluateProject(
        tx,
        { projectId: target.projectId, tEval: now.toISOString(), measurementPollId, deferCompletion: true },
        q.providers
      )
      await replaceEvaluatorDeadline(tx, { projectId: target.projectId, dueAt: result.deadline })
      return result
    })
    if (!result) return
    const now = new Date(result.tEval)
    try {
      for (const history of result.histories) await recordSourceTransitions({ tEval: now.toISOString(), history })
      await deliverSourceTransitions()
    } catch (error) {
      await run(target, (tx) =>
        requestEvaluatorProject(tx, {
          projectId: target.projectId,
          tEval: now.toISOString(),
          reason: 'source-state:' + String(error)
        })
      )
      throw error
    }
    // A crash before this acknowledgement leaves the original tenant request pending.
    // Conditional completion cannot erase a newer event while global fanout was running.
    await run(target, async (tx) => {
      for (const pack of ['sky', 'crowd'] as const)
        if (!result.deferredPacks.includes(pack))
          await completeEvaluatorReevaluation(tx, { projectId: target.projectId, pack, tEval: result.tEval })
    })
    await repairEvaluatorDeadline(target, q.tasks, now)
  }
  function consumer<T extends EventType>(
    types: T[],
    name: string,
    request: (event: Parameters<Parameters<typeof onEvent<T>>[2]>[0], tx: Tx) => Promise<boolean>
  ): EventConsumer {
    return {
      consumer: name,
      types,
      handler: async (raw) => {
        let target: SourceTarget | null = null
        let measurementPollId: string | undefined
        await onEvent(types, name, async (event, tx) => {
          if (await request(event, tx)) {
            target = { orgId: event.org_id, projectId: event.project_id }
            if (event.type === 'poll.recorded')
              measurementPollId = PollRecordedEventSchema.shape.data.parse(event.data).poll_id
          }
        }).handler(raw)
        // onEvent has committed and released its transaction before any source-global/transport work.
        if (target) await evaluate(target, undefined, measurementPollId)
      }
    }
  }
  return {
    owner: 'b-evaluator',
    topics: {
      'readings-updated': async ({ data }) => {
        const message = ReadingsUpdated.parse(data)
        if (message.new_rows <= 0) throw new Error('readings-updated requires positive rows')
        await withSystem('evaluator-poll-validate', (tx) =>
          validateEvaluatorPoll(tx, {
            sourceId: message.source_id,
            pollId: message.poll_id,
            kind: message.kind,
            newRows: message.new_rows
          })
        )
        const projects = await withSystem('evaluator-projects', listEvaluatorProjects)
        for (const orgId of [...new Set(projects.map((p) => p.orgId))]) {
          const targets = await withTenant({ orgId, principal: systemPrincipal('evaluator-targets') }, (tx) =>
            findSourceTargets(tx, { sourceId: message.source_id, tEval: q.clock().toISOString() })
          )
          for (const target of targets) {
            const claimed = await run(target, (tx) =>
              requestEvaluatorPoll(tx, {
                projectId: target.projectId,
                sourceId: message.source_id,
                pollId: message.poll_id,
                kind: message.kind,
                newRows: message.new_rows,
                tEval: q.clock().toISOString()
              })
            )
            if (claimed) await evaluate(target, undefined, message.poll_id)
          }
        }
      }
    },
    queues: {
      [EVALUATOR_DEADLINES]: async (task) => {
        const body = Body.parse(task.body)
        // OIDC is enforced by server.ts; the DB additionally associates the immutable payload with current intent.
        await evaluate({ orgId: body.org, projectId: body.project }, body)
      }
    },
    events: [
      consumer(['poll.recorded'], 'evaluator-poll-recorded', async (event, tx) => {
        const data = PollRecordedEventSchema.shape.data.parse(event.data)
        return requestEvaluatorPoll(tx, {
          projectId: event.project_id,
          sourceId: data.source_id,
          pollId: data.poll_id,
          outcome: data.outcome,
          httpStatus: data.http_status,
          newRows: data.new_rows,
          tEval: q.clock().toISOString()
        })
      }),
      consumer(
        [
          'window.created',
          'window.updated',
          'window.cancelled',
          'clause_sheet.published',
          'source.bound',
          'source.unbound',
          'source.error',
          'source.stale',
          'source.recovered'
        ],
        'evaluator-domain-change',
        (event, tx) =>
          requestEvaluatorProject(tx, {
            projectId: event.project_id,
            tEval: q.clock().toISOString(),
            reason: event.type
          })
      )
    ],
    batch: {
      'evaluator-repair': async () => {
        const targets = await withSystem('evaluator-projects', listEvaluatorProjects)
        const failures: unknown[] = []
        for (const target of targets)
          try {
            const state = await run(target, async (tx) => ({
              pending: await evaluatorNeedsEvaluation(tx, {
                projectId: target.projectId,
                tEval: q.clock().toISOString()
              }),
              deadline: await loadEvaluatorDeadline(tx, target.projectId)
            }))
            if (state.pending || (state.deadline && Date.parse(state.deadline.dueAt) <= q.clock().getTime()))
              await evaluate(target)
            else await repairEvaluatorDeadline(target, q.tasks, q.clock())
          } catch (error) {
            failures.push(error)
          }
        await deliverSourceTransitions()
        if (failures.length) throw new AggregateError(failures, 'evaluator repair deferred')
      }
    }
  }
}
// No environment, database or network access at import or readiness time. Real providers compose on first delivery.
let production: WorkerPart | undefined
function part(): WorkerPart {
  return (production ??= createEvaluatorPart({
    providers: productionEvaluatorProviders(),
    clock: () => new Date(),
    tasks: cloudEvaluatorTasks()
  }))
}
export const evaluator: WorkerPart = {
  owner: 'b-evaluator',
  topics: { 'readings-updated': (message) => part().topics!['readings-updated']!(message) },
  queues: { [EVALUATOR_DEADLINES]: (task) => part().queues![EVALUATOR_DEADLINES]!(task) },
  batch: { 'evaluator-repair': (now) => part().batch!['evaluator-repair']!(now) },
  events: [
    {
      consumer: 'evaluator-poll-recorded',
      types: ['poll.recorded'],
      handler: (event) => part().events![0]!.handler(event)
    },
    {
      consumer: 'evaluator-domain-change',
      types: [
        'window.created',
        'window.updated',
        'window.cancelled',
        'clause_sheet.published',
        'source.bound',
        'source.unbound',
        'source.error',
        'source.stale',
        'source.recovered'
      ],
      handler: (event) => part().events![1]!.handler(event)
    }
  ]
}
