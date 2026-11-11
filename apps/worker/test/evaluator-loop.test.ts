import { expect, test, vi, afterEach } from 'vitest'
import type { Verdict } from '@skyclause/clauses'
import { semanticVerdictKey } from '@skyclause/api'
import { createEvaluatorProviders } from '@skyclause/api'
import type { SourceAdapter } from '@skyclause/sources'
import { TEST_REGISTRY } from '../../../packages/clauses/test/test-helpers'
import {
  withTenant,
  systemPrincipal,
  createProjectRecord,
  projectPack,
  featureFlag,
  shadowState,
  crossing,
  indicatorSnapshot,
  evaluatorReevaluation
} from '@skyclause/db'
import {
  makeOrganization,
  makeWindow,
  makeNight,
  makeListing,
  makeSource,
  makeReading,
  makeProjectSource
} from '../../../packages/db/test/factories'
import { eq, sql } from 'drizzle-orm'
import { asLogin } from '../../../packages/db/test/harness'
import { project, loadEvaluatorSnapshot, domainEvent, setEventPublisher, withSystem } from '@skyclause/db'
import * as database from '@skyclause/db'
import { recordSourceTransitions } from '../src/evaluator/source-state'
import { deliverSourceTransitions } from '../src/evaluator/delivery'
import { evaluateProject } from '../src/evaluator/evaluate'

const at = '2026-11-10T04:00:00.000Z'
const normal: Verdict = {
  scope: { kind: 'site', id: null },
  pack: 'sky',
  mode: 'normal',
  watch: false,
  noCall: null,
  recommendations: [],
  clauses: [],
  openFrom: null
}
test('semantic key ignores evidence and clause firing but retains mode, watch, null versus names and recommendation sets', () => {
  const changed = {
    ...normal,
    openFrom: at,
    clauses: [{ key: 'changed', result: 'fired' as const, blockedBy: [], inputs: [] }]
  }
  expect(semanticVerdictKey(normal)).toBe(semanticVerdictKey(changed))
  for (const v of [
    { ...normal, mode: null },
    { ...normal, watch: true },
    { ...normal, noCall: { inputs: [] } },
    { ...normal, recommendations: ['shift_start' as const] }
  ])
    expect(semanticVerdictKey(v)).not.toBe(semanticVerdictKey(normal))
  const input = { name: 'rain', state: 'stale' as const, sourceId: null, since: at }
  const a = {
    ...normal,
    noCall: { inputs: [input, { ...input, name: 'api' }, input] },
    recommendations: ['shift_start', 'shift_end', 'shift_start'] as Verdict['recommendations']
  }
  const b = {
    ...a,
    noCall: { inputs: [{ ...input, name: 'api', since: 'later', sourceId: 'other' }, input] },
    recommendations: ['shift_end', 'shift_start'] as Verdict['recommendations']
  }
  expect(semanticVerdictKey(a)).toBe(semanticVerdictKey(b))
  expect(semanticVerdictKey(a)).not.toBe(semanticVerdictKey({ ...a, noCall: { inputs: [input] } }))
})
async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('test-evaluator') }, fn)
  const created = await run((tx) =>
    createProjectRecord(tx, {
      name: 'Evaluator',
      slug: 'evaluator',
      siteName: 'APU',
      siteLat: 3,
      siteLon: 101,
      packs: ['sky', 'crowd']
    })
  )
  await run((tx) => tx.insert(featureFlag).values({ key: 'pack_crowd', orgId, enabled: true }))
  await run((tx) => tx.update(projectPack).set({ enabled: true }).where(eq(projectPack.projectId, created.project.id)))
  const providers = createEvaluatorProviders({
    adapters: [{ kind: 'jps_rain', indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: null
  })
  return { orgId, run, created, providers, q: { projectId: created.project.id, tEval: at } }
}
test('first No call writes site with zero windows; concurrent repeats produce one crossing and Crowd remains pending', async () => {
  const { run, q, providers } = await scene()
  const results = await Promise.all([
    run((tx) => evaluateProject(tx, q, providers)),
    run((tx) => evaluateProject(tx, q, providers))
  ])
  expect(results.flatMap((r) => r.crossingIds)).toHaveLength(1)
  for (const r of results) expect(r.deferredPacks).toEqual(['crowd'])
  await run(async (tx) => {
    expect(await tx.select().from(shadowState)).toHaveLength(1)
    expect(await tx.select().from(crossing)).toHaveLength(1)
    expect(await tx.select().from(indicatorSnapshot)).toHaveLength(1)
    expect(await tx.select().from(evaluatorReevaluation)).toMatchObject([
      { projectId: q.projectId, pack: 'crowd', completedAt: null }
    ])
  })
  const newer = '2026-11-10T04:10:00.000Z'
  await run((tx) => evaluateProject(tx, { ...q, tEval: newer }, providers))
  await run((tx) => evaluateProject(tx, q, providers))
  expect(
    (await run((tx) => tx.select().from(shadowState).where(eq(shadowState.projectId, q.projectId))))[0]?.evaluatedAt
  ).toEqual(new Date(newer))
})
test('disabled packs produce no snapshots or state', async () => {
  const { run, q, providers } = await scene()
  await run((tx) => tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.projectId, q.projectId)))
  expect((await run((tx) => evaluateProject(tx, q, providers))).crossingIds).toEqual([])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
})

afterEach(() => {
  vi.restoreAllMocks()
  setEventPublisher(null)
})
test.each(['archived', 'suspended', 'flag-off'] as const)('%s scopes make no writes', async (kind) => {
  const { orgId, run, q, providers } = await scene()
  if (kind === 'archived')
    await run((tx) =>
      tx
        .update(project)
        .set({ archivedAt: new Date(at) })
        .where(eq(project.id, q.projectId))
    )
  if (kind === 'suspended')
    await asLogin('auth_app', (c) =>
      c.query('UPDATE auth.organization SET deletion_requested_at=now() WHERE id=$1', [orgId])
    )
  if (kind === 'flag-off')
    await run(async (tx) => {
      await tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.pack, 'sky'))
      await tx.update(featureFlag).set({ enabled: false })
    })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.crossingIds).toEqual([])
  expect(result.deferredPacks).toEqual([])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
})
test('same-key persisted archive keeps original windows and definitions even after current context changes', async () => {
  const { run, q, providers } = await scene()
  const w = await run((tx) =>
    makeWindow(tx, {
      projectId: q.projectId,
      startsAt: new Date('2026-11-10T05:00:00Z'),
      endsAt: new Date('2026-11-10T06:00:00Z')
    })
  )
  const frozen = [
    { id: w.id, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), tz: w.tz, kind: w.kind }
  ]
  await run((tx) => providers.snapshots.take(tx, { ...q, pack: 'sky', persist: true, windows: frozen }))
  await run((tx) =>
    makeWindow(tx, {
      projectId: q.projectId,
      startsAt: new Date('2026-11-10T07:00:00Z'),
      endsAt: new Date('2026-11-10T08:00:00Z')
    })
  )
  const empty = createEvaluatorProviders({ adapters: [], forecast: null }),
    evaluate = vi.spyOn(empty.shadow, 'evaluate')
  const result = await run((tx) => evaluateProject(tx, q, empty))
  expect(result.deferredPacks).toEqual(['crowd'])
  expect(evaluate.mock.calls[0]?.[2]).toEqual(frozen)
  const archived = await run((tx) => loadEvaluatorSnapshot(tx, { ...q, pack: 'sky' }))
  expect(evaluate.mock.calls[0]?.[0].registryHash).toBe(archived.snapshot.registryHash)
  expect(evaluate.mock.calls[0]?.[1]).toEqual(archived.snapshot)
})
test('cancelled and expired windows are excluded while zero eligible windows retain the Sky site', async () => {
  const { run, q, providers } = await scene()
  await run(async (tx) => {
    for (const extra of [
      { cancelledAt: new Date(at) },
      { expiresAt: new Date(at) },
      { endsAt: new Date('2026-11-10T02:00:00Z') }
    ])
      await makeWindow(tx, {
        projectId: q.projectId,
        startsAt: new Date('2026-11-10T03:00:00Z'),
        endsAt: new Date('2026-11-10T05:00:00Z'),
        ...extra
      })
  })
  await run((tx) => evaluateProject(tx, q, providers))
  expect((await run((tx) => loadEvaluatorSnapshot(tx, { ...q, pack: 'sky' }))).windows).toEqual([])
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ scopeKind: 'site' }])
})
test('incompatible archive leaves explicit reevaluation intent without fake Normal state', async () => {
  const { run, q, providers } = await scene()
  const narrow = createEvaluatorProviders({
    adapters: [
      {
        kind: 'apims',
        indicators: [{ name: 'site.api_max', celType: 'int', unit: '', scope: 'site', sourceKind: 'apims' }]
      } as SourceAdapter<unknown>
    ],
    forecast: null
  })
  await run((tx) => narrow.snapshots.take(tx, { ...q, pack: 'sky', persist: true, windows: [] }))
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['sky', 'crowd'])
  expect(await run((tx) => tx.select().from(shadowState))).toEqual([])
  expect(await run((tx) => tx.select().from(domainEvent))).toEqual([])
  expect(await run((tx) => tx.select().from(evaluatorReevaluation))).toHaveLength(2)
})
test('snapshot write then engine failure rolls back the whole pack and leaves durable pending work', async () => {
  const { run, q, providers } = await scene()
  vi.spyOn(providers.shadow, 'evaluate').mockImplementation(() => {
    throw new Error('injected engine failure')
  })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['sky', 'crowd'])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
  expect(await run((tx) => tx.select().from(shadowState))).toEqual([])
  expect(await run((tx) => tx.select().from(crossing))).toEqual([])
})

test('failed Crowd after actual emitEvent publishes no ghost event or metric while Sky commits', async () => {
  const { run, q } = await scene()
  const n = await run(async (tx) => {
    const n = await makeNight(tx, { projectId: q.projectId, date: '2026-11-10', state: 'in_progress' })
    await makeListing(tx, { projectId: q.projectId, nightId: n.id, state: 'listed' })
    return n
  })
  const providers = createEvaluatorProviders({
    adapters: [{ kind: 'jps_rain', indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: {
      nights: async () => [
        {
          id: n.id,
          date: n.date,
          baseline: null,
          uplift: null,
          forecast: null,
          band: null,
          doors: '2026-11-10T10:00:00Z',
          show: '2026-11-10T11:00:00Z',
          arrivalStart: '2026-11-10T08:00:00Z',
          arrivalEnd: null,
          exitStart: null,
          exitEnd: null,
          singleSource: true,
          forecastId: null,
          state: 'insufficient_baseline'
        }
      ],
      exits: async () => {
        throw new Error('unused')
      },
      baseline: async () => {
        throw new Error('unused')
      }
    }
  })
  const actual = database.commitEvaluatorVerdict,
    metrics: string[] = [],
    published: string[] = []
  vi.spyOn(database, 'commitEvaluatorVerdict').mockImplementation(async (tx, args) => {
    const result = await actual(tx, args)
    database.afterCommit(tx as database.Tx, async () => {
      metrics.push(args.pack)
    })
    if (args.pack === 'crowd') throw new Error('injected after actual shared event and metric hook')
    return result
  })
  setEventPublisher(async ({ event_id }) => {
    published.push(event_id)
  })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['crowd'])
  expect(result.crossingIds).toHaveLength(1)
  const events = await run((tx) => tx.select().from(domainEvent))
  expect(events).toHaveLength(1)
  expect(published).toEqual(events.map((e) => e.id))
  expect(metrics).toEqual(['sky'])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toMatchObject([{ pack: 'sky' }])
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ pack: 'sky' }])
  expect(await run((tx) => tx.select().from(crossing))).toMatchObject([{ pack: 'sky' }])
})
test('separate simultaneous connections serialize on the project lock and duplicate evaluations use no readings twice', async () => {
  const { run, q, providers } = await scene()
  const source = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  const reading = await withSystem('test', (tx) =>
    makeReading(tx, {
      sourceId: source.id,
      metric: 'api',
      unit: '',
      value: 180,
      observedAt: new Date(at),
      receivedAt: new Date(at)
    })
  )
  await run((tx) => makeProjectSource(tx, { projectId: q.projectId, sourceId: source.id, role: 'rain_gauge' }))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    pids: number[] = []
  const work = () =>
    run(async (tx) => {
      const pid = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
      pids.push(pid.rows[0]!.pid)
      if (pids.length === 2) release()
      await gate
      return evaluateProject(tx, q, providers)
    })
  const results = await Promise.all([work(), work()])
  expect(new Set(pids).size).toBe(2)
  expect(results.flatMap((r) => r.crossingIds)).toHaveLength(1)
  expect(results.flatMap((r) => r.usedReadingIds)).toEqual([reading.id])
})

test('an archive without committed shadow is evidence, not a newer evaluation watermark', async () => {
  const { run, q, providers } = await scene()
  await run((tx) =>
    providers.snapshots.take(tx, { ...q, tEval: '2026-11-10T05:00:00.000Z', pack: 'sky', windows: [], persist: true })
  )
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.crossingIds).toHaveLength(1)
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ evaluatedAt: new Date(at) }])
})

test('global source wrapper reads bindings in each tenant and delivers once with two enabled packs', async () => {
  const a = await scene(),
    b = await scene(),
    s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  for (const x of [a, b]) await x.run((tx) => makeProjectSource(tx, { projectId: x.q.projectId, sourceId: s.id }))
  await database.shareSystemConnection(async () => {
    const transitions = await recordSourceTransitions({
      tEval: at,
      history: {
        sources: [
          {
            id: s.id,
            kind: s.kind,
            cadenceS: s.cadenceS,
            staleAfterS: s.staleAfterS,
            freshness: s.freshness,
            probation: false,
            meta: {}
          }
        ],
        polls: [],
        readings: []
      }
    })
    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.targets).toEqual(
      expect.arrayContaining([
        { orgId: a.orgId, projectId: a.q.projectId },
        { orgId: b.orgId, projectId: b.q.projectId }
      ])
    )
    expect(transitions[0]!.targets).toHaveLength(2)
    await deliverSourceTransitions()
    await deliverSourceTransitions()
  })
  for (const x of [a, b])
    expect(await x.run((tx) => tx.select().from(domainEvent))).toMatchObject([
      { type: 'source.stale', data: { http_status: null } }
    ])
})

test('window remains active through its rain span terminal, then retires without a past deadline', async () => {
  const { run, q, providers } = await scene()
  const w = await run((tx) =>
    makeWindow(tx, {
      projectId: q.projectId,
      startsAt: new Date('2026-11-10T03:00:00Z'),
      endsAt: new Date('2026-11-10T04:30:00Z')
    })
  )
  for (const tEval of [
    '2026-11-10T04:29:59Z',
    '2026-11-10T04:30:00Z',
    '2026-11-10T04:30:01Z',
    '2026-11-10T05:30:00Z'
  ]) {
    const result = await run((tx) => evaluateProject(tx, { ...q, tEval }, providers))
    const archive = await run((tx) => loadEvaluatorSnapshot(tx, { ...q, tEval, pack: 'sky' }))
    expect(archive.windows.map((x) => x.id)).toContain(w.id)
    if (tEval === '2026-11-10T05:30:00Z') expect(result.deadline).toBeNull()
  }
})

import { createEvaluatorPart } from '../src/evaluator'
import { repairEvaluatorDeadline } from '../src/evaluator/delivery'
import { TaskNameUnavailable } from '../src/evaluator/cloud-tasks'
import { makePoll } from '../../../packages/db/test/factories'
import { dispatchEvent } from '../src/events'

async function deliveryScene() {
  const x = await scene()
  let now = new Date(at)
  const creates: database.DeadlineIntent[] = [],
    deletes: string[] = []
  const tasks = {
    create: vi.fn(async (intent: database.DeadlineIntent) => {
      creates.push(intent)
    }),
    remove: vi.fn(async (name: string) => {
      deletes.push(name)
    })
  }
  const part = createEvaluatorPart({ providers: x.providers, clock: () => now, tasks })
  return {
    ...x,
    part,
    tasks,
    creates,
    deletes,
    clock: (next: string) => {
      now = new Date(next)
    },
    target: { orgId: x.orgId, projectId: x.q.projectId }
  }
}
async function pollScene(outcome: 'ok' | 'unchanged' | 'error') {
  const x = await deliveryScene()
  const s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims', freshness: 'polled', staleAfterS: 600 }))
  const p = await withSystem('test', (tx) =>
    makePoll(tx, {
      sourceId: s.id,
      startedAt: new Date(at),
      receivedAt: new Date(at),
      outcome,
      httpStatus: outcome === 'error' ? null : 200
    })
  )
  if (outcome === 'ok')
    await withSystem('test', (tx) =>
      makeReading(tx, {
        sourceId: s.id,
        pollId: p.id,
        metric: 'api',
        value: 50,
        observedAt: new Date(at),
        receivedAt: new Date(at)
      })
    )
  await x.run((tx) => makeProjectSource(tx, { projectId: x.q.projectId, sourceId: s.id }))
  const stored = {
    id: p.id,
    sourceId: s.id,
    kind: s.kind,
    outcome,
    httpStatus: p.httpStatus,
    newRows: outcome === 'ok' ? 1 : 0,
    purpose: 'poll' as const,
    startedAt: p.startedAt,
    receivedAt: p.receivedAt
  }
  return { ...x, s, p, stored }
}
test.each(['error', 'unchanged'] as const)(
  'actual tenant poll.recorded %s with zero rows evaluates and deduplicates',
  async (outcome) => {
    const x = await pollScene(outcome)
    await x.run((tx) => database.emitSourcePoll(tx, x.q.projectId, x.stored))
    const [event] = await x.run((tx) => tx.select().from(domainEvent).where(eq(domainEvent.type, 'poll.recorded')))
    await database.shareSystemConnection(() => dispatchEvent(x.part.events!, event!.id))
    expect(await x.run((tx) => tx.select().from(shadowState))).toHaveLength(1)
    const snapshots = await x.run((tx) => tx.select().from(indicatorSnapshot))
    expect(snapshots).toHaveLength(1)
    x.clock('2026-11-10T04:01:00Z')
    await dispatchEvent(x.part.events!, event!.id)
    expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(1)
    expect(await x.run((tx) => tx.select().from(evaluatorReevaluation))).toEqual(
      expect.arrayContaining([expect.objectContaining({ pack: 'crowd', completedAt: null })])
    )
  }
)
test('positive source message evaluates only bindings and shares project/poll dedupe with actual domain delivery', async () => {
  const x = await pollScene('ok'),
    unbound = await scene()
  const message = {
    data: { source_id: x.s.id, poll_id: x.p.id, kind: x.s.kind, new_rows: 1 },
    messageId: 'positive',
    publishTime: at,
    attributes: {}
  }
  await x.part.topics!['readings-updated']!(message)
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(1)
  expect(await unbound.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(0)
  await x.run((tx) => database.emitSourcePoll(tx, x.q.projectId, x.stored))
  const [event] = await x.run((tx) => tx.select().from(domainEvent).where(eq(domainEvent.type, 'poll.recorded')))
  x.clock('2026-11-10T04:01:00Z')
  await dispatchEvent(x.part.events!, event!.id)
  await x.part.topics!['readings-updated']!(message)
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(1)
  await expect(
    x.part.topics!['readings-updated']!({ ...message, data: { ...message.data, kind: 'jps_rain' } })
  ).rejects.toThrow('identity mismatch')
  await expect(
    unbound.run((tx) =>
      database.requestEvaluatorPoll(tx, { projectId: unbound.q.projectId, sourceId: x.s.id, pollId: x.p.id, tEval: at })
    )
  ).rejects.toThrow('not bound')
})
test('domain changes persist requests through handleOnce before evaluation and batch repairs failed creation', async () => {
  const x = await deliveryScene()
  await x.run((tx) =>
    makeWindow(tx, {
      projectId: x.q.projectId,
      startsAt: new Date('2026-11-10T05:00:00Z'),
      endsAt: new Date('2026-11-10T06:00:00Z')
    })
  )
  const event = await x.run((tx) =>
    database.emitEvent(tx, {
      projectId: x.q.projectId,
      type: 'window.updated',
      data: { window_id: x.q.projectId, via: 'form', times_changed: true, series_id: null }
    })
  )
  x.tasks.create.mockRejectedValueOnce(new Error('create unavailable'))
  await expect(database.shareSystemConnection(() => dispatchEvent(x.part.events!, event.id))).rejects.toThrow(
    'create unavailable'
  )
  const intent = await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId))
  expect(intent).toMatchObject({ createdAt: null })
  await database.shareSystemConnection(() => x.part.batch!['evaluator-repair']!(new Date(at)))
  expect(await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId))).toMatchObject({
    generation: intent!.generation,
    createdAt: expect.any(String)
  })
})
test('409 rotates durable name without deleting prior tasks before replacement succeeds; far future waits for batch horizon', async () => {
  const x = await deliveryScene()
  const first = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T05:00:00Z' })
  ))!
  x.tasks.create.mockRejectedValueOnce(new TaskNameUnavailable('tombstone'))
  await expect(repairEvaluatorDeadline(x.target, x.tasks, new Date(at))).rejects.toThrow('tombstone')
  const second = (await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId)))!
  expect(second.generation).not.toBe(first.generation)
  expect(x.deletes).toEqual([])
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  expect(x.creates.at(-1)!.generation).toBe(second.generation)
  expect(x.deletes).toContain(first.taskName)
  const far = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2027-01-01T00:00:00Z' })
  ))!
  const count = x.creates.length
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  expect(x.creates).toHaveLength(count)
  expect(await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId))).toMatchObject(far)
  await repairEvaluatorDeadline(x.target, x.tasks, new Date('2026-12-20T00:00:00Z'))
  expect(x.creates.at(-1)!.generation).toBe(far.generation)
})
test('timer evaluates actual clock, early current generation retries and obsolete/retried deliveries do no writes', async () => {
  const x = await pollScene('ok')
  const first = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T04:10:01Z' })
  ))!
  const task = {
    name: first.taskName,
    retryCount: 0,
    body: { org: first.org, project: first.project, generation: first.generation, dueAt: first.dueAt }
  }
  await expect(x.part.queues!['evaluator-deadlines']!(task)).rejects.toThrow('not due')
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
  x.clock('2026-11-10T04:12:00Z')
  await x.part.queues!['evaluator-deadlines']!(task)
  const rows = await x.run((tx) => tx.select().from(indicatorSnapshot))
  expect(rows).toHaveLength(1)
  expect(rows[0]!.tEval).toEqual(new Date('2026-11-10T04:12:00Z'))
  x.clock('2026-11-10T04:13:00Z')
  await x.part.queues!['evaluator-deadlines']!(task)
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(1)
})
test.each(['archived', 'off'] as const)('current timer for %s project commits no evaluation', async (kind) => {
  const x = await deliveryScene()
  const first = (await x.run((tx) => database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: at })))!
  if (kind === 'archived')
    await x.run((tx) =>
      tx
        .update(project)
        .set({ archivedAt: new Date(at) })
        .where(eq(project.id, x.q.projectId))
    )
  else
    await x.run((tx) => tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.projectId, x.q.projectId)))
  await x.part.queues!['evaluator-deadlines']!({
    name: first.taskName,
    retryCount: 0,
    body: { org: first.org, project: first.project, generation: first.generation, dueAt: first.dueAt }
  })
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
  expect(await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId))).toBeNull()
})

test('two in-flight replacements preserve newest intent and retry cleanup after a late create response', async () => {
  const x = await deliveryScene()
  const one = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T05:00:00Z' })
  ))!
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  const two = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T06:00:00Z' })
  ))!
  let started!: () => void, release!: () => void
  const entered = new Promise<void>((resolve) => {
      started = resolve
    }),
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
  x.tasks.create.mockImplementationOnce(async () => {
    started()
    await gate
  })
  const slow = repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  await entered
  const three = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T07:00:00Z' })
  ))!
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  release()
  await slow
  expect((await x.run((tx) => database.loadEvaluatorDeadline(tx, x.q.projectId)))!.generation).toBe(three.generation)
  expect(x.deletes).toContain(one.taskName)
  expect(x.deletes.filter((n) => n === two.taskName)).toHaveLength(2)
  expect(x.deletes).not.toContain(three.taskName)
})
test('failed cleanup is retained after replacement creation and retried independently', async () => {
  const x = await deliveryScene()
  const old = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T05:00:00Z' })
  ))!
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  const current = (await x.run((tx) =>
    database.replaceEvaluatorDeadline(tx, { projectId: x.q.projectId, dueAt: '2026-11-10T06:00:00Z' })
  ))!
  x.tasks.remove.mockRejectedValueOnce(new Error('delete unavailable'))
  await expect(repairEvaluatorDeadline(x.target, x.tasks, new Date(at))).rejects.toThrow('delete unavailable')
  expect(
    (await x.run((tx) => database.listEvaluatorDeadlineCleanup(tx, x.q.projectId))).map((x) => x.generation)
  ).toContain(old.generation)
  await repairEvaluatorDeadline(x.target, x.tasks, new Date(at))
  expect(x.creates.filter((x) => x.generation === current.generation)).toHaveLength(1)
  expect(await x.run((tx) => database.listEvaluatorDeadlineCleanup(tx, x.q.projectId))).toEqual([])
})

// This batch visits every active project created by the integration suite, not only this scene.
test('batch bootstraps an existing shadow once even when no future deadline exists', async () => {
  const x = await deliveryScene()
  await x.run((tx) => tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.pack, 'crowd')))
  await x.run((tx) => evaluateProject(tx, x.q, x.providers))
  expect(await x.run((tx) => tx.select().from(evaluatorReevaluation))).toEqual([])
  x.clock('2026-11-10T04:01:00Z')
  await database.shareSystemConnection(() => x.part.batch!['evaluator-repair']!(new Date(at)))
  expect(await x.run((tx) => tx.select().from(evaluatorReevaluation))).toMatchObject([
    { pack: 'sky', completedAt: expect.any(Date) }
  ])
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(2)
  x.clock('2026-11-10T04:02:00Z')
  await database.shareSystemConnection(() => x.part.batch!['evaluator-repair']!(new Date(at)))
  expect(await x.run((tx) => tx.select().from(indicatorSnapshot))).toHaveLength(2)
}, 15_000)
