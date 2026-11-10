import type { ReadingHistory } from '@skyclause/clauses'
import {
  findSourceTargets,
  listEvaluatorProjects,
  recordSourceTransition,
  systemPrincipal,
  withSystem,
  withTenant,
  type SourceTransition,
  type SourceTarget
} from '@skyclause/db'

/** Collect tenant-visible bindings before taking source locks, and never nest with* transactions. */
export async function recordSourceTransitions(q: {
  tEval: string
  history: ReadingHistory
}): Promise<SourceTransition[]> {
  const projects = await withSystem('evaluator-source-targets', listEvaluatorProjects)
  const orgIds = [...new Set(projects.map((p) => p.orgId))].sort()
  const transitions: SourceTransition[] = []
  for (const sourceId of [...new Set(q.history.sources.map((s) => s.id.toLowerCase()))].sort()) {
    const targets: SourceTarget[] = []
    for (const orgId of orgIds)
      targets.push(
        ...(await withTenant({ orgId, principal: systemPrincipal('evaluator-source-targets') }, (tx) =>
          findSourceTargets(tx, { sourceId, tEval: q.tEval })
        ))
      )
    const changed = await withSystem('evaluator-source-state', (tx) =>
      recordSourceTransition(tx, { ...q, sourceId, targets })
    )
    if (changed) transitions.push(changed)
  }
  return transitions
}
