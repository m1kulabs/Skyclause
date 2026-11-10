import { bundle, call, OPEN_CALL_STATES, REVIEW_STATES, shadowState, type Tx } from '@skyclause/db'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'

// #151, D14: TRD "Evaluation and precedence": a crossing starts a run when the new verdict is above Normal, when it is
// No call inside an open span, when a site-level verdict changes, or when it falls back to Normal while an unapproved
// bundle covers the window (so the stale draft is superseded). Other crossings are recorded only.

export interface CrossingFacts {
  projectId: string
  pack: 'sky' | 'crowd'
  scope: { kind: 'site' | 'window' | 'night'; id: string | null }
  /** The new verdict's mode; null for No call. */
  to: string | null
  verdictHash: string
}

/** A shadow verdict as `b-evaluator` stores it; the keys read here are the same on the engine's and the wire's form. */
interface StoredVerdict {
  clauses?: Array<{ result?: string; span?: { complete?: boolean } }>
}

/** No call from a blocked clause whose span is open: one with no span, or one not yet complete. */
async function noCallInOpenSpan(tx: Tx, c: CrossingFacts) {
  const [state] = await tx
    .select({ verdict: shadowState.verdict })
    .from(shadowState)
    .where(
      and(
        eq(shadowState.projectId, c.projectId),
        eq(shadowState.pack, c.pack),
        eq(shadowState.scopeKind, c.scope.kind),
        c.scope.id === null ? isNull(shadowState.scopeId) : eq(shadowState.scopeId, c.scope.id),
        eq(shadowState.verdictHash, c.verdictHash)
      )
    )
  const clauses = (state?.verdict as StoredVerdict | undefined)?.clauses ?? []
  return clauses.some((clause) => clause.result === 'blocked' && clause.span?.complete !== true)
}

/** A bundle in Needs review or Reconfirm with an open call for the scope's window or night. */
async function unapprovedCover(tx: Tx, c: CrossingFacts) {
  if (c.scope.id === null) return false
  const [covered] = await tx
    .select({ id: call.id })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .where(
      and(
        eq(bundle.projectId, c.projectId),
        eq(bundle.pack, c.pack),
        inArray(bundle.state, [...REVIEW_STATES]),
        inArray(call.state, [...OPEN_CALL_STATES]),
        or(eq(call.windowId, c.scope.id), eq(call.nightId, c.scope.id))
      )
    )
    .limit(1)
  return covered !== undefined
}

/** Whether the crossing meets the start rule, read in the crossing's organisation. */
export async function startsRun(tx: Tx, c: CrossingFacts): Promise<boolean> {
  if (c.to !== null && c.to !== 'normal') return true
  if (c.scope.kind === 'site') return true
  if (c.to === null) return noCallInOpenSpan(tx, c)
  return unapprovedCover(tx, c)
}
