import {
  deliverSourceTransition,
  listSourceTransitionDeliveries,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'

/** Safe to resume after any tenant commit; completed recipients and earlier transitions stay authoritative. */
export async function deliverSourceTransitions(): Promise<void> {
  const pending = await withSystem('evaluator-source-delivery', listSourceTransitionDeliveries)
  for (const target of pending)
    await withTenant({ orgId: target.orgId, principal: systemPrincipal('evaluator-source-delivery') }, (tx) =>
      deliverSourceTransition(tx, target)
    )
}

import {
  completeEvaluatorDeadlineCleanup,
  listEvaluatorDeadlineCleanup,
  loadEvaluatorDeadline,
  markEvaluatorDeadlineCreated,
  replaceEvaluatorDeadline,
  type SourceTarget
} from '@skyclause/db'
import { TaskNameUnavailable, TASK_HORIZON_MS, type EvaluatorTaskTransport } from './cloud-tasks'

export async function repairEvaluatorDeadline(
  target: SourceTarget,
  tasks: EvaluatorTaskTransport,
  now: Date
): Promise<void> {
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId: target.orgId, principal: systemPrincipal('evaluator-deadlines') }, fn)
  const current = await run((tx) => loadEvaluatorDeadline(tx, target.projectId))
  if (current && !current.createdAt) {
    if (Date.parse(current.dueAt) - now.getTime() > TASK_HORIZON_MS) return
    try {
      await tasks.create(current)
    } catch (error) {
      if (error instanceof TaskNameUnavailable) {
        await run((tx) =>
          replaceEvaluatorDeadline(tx, {
            projectId: current.project,
            dueAt: current.dueAt,
            expectedGeneration: current.generation
          })
        )
      }
      throw error
    }
    await run((tx) => markEvaluatorDeadlineCreated(tx, current))
  }
  const obsolete = await run((tx) => listEvaluatorDeadlineCleanup(tx, target.projectId))
  for (const old of obsolete) {
    await tasks.remove(old.taskName)
    await run((tx) => completeEvaluatorDeadlineCleanup(tx, old))
  }
}
