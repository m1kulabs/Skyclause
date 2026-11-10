import { and, eq, ne, sql } from 'drizzle-orm'
import { track } from '../analytics'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../ledger'
import { grade, night, reviewItem, type ReviewReason } from '../schema'

export type NewGrade = Omit<typeof grade.$inferInsert, 'id' | 'orgId' | 'createdAt'> & {
  /** Why a person should look; a review item opens iff there is one (empty for a guest window, GST-5). */
  reasons: ReviewReason[]
  /** Whether the grade enters the ledger: not for a Closed bundle's call (CAL-5, D21) or a guest window (GST-5). */
  ledger: boolean
}

/**
 * #161: one grade, in the caller's `withTenant` transaction. A repeat (the call, night or callless window already has
 * its grade) writes nothing and returns null, so re-runs are no-ops. A new grade marks its listed night `graded`,
 * opens one review item when it has reasons, enters the ledger when asked, and emits its events and analytics.
 */
export async function recordGrade(tx: Tx, { reasons, ledger, ...values }: NewGrade) {
  const [row] = await tx
    .insert(grade)
    .values({ ...values, orgId: tx.orgId! })
    .onConflictDoNothing()
    .returning({ id: grade.id })
  if (!row) return null
  const { projectId, pack, outcome } = values
  if (values.nightId) {
    await tx
      .update(night)
      .set({ state: 'graded', updatedAt: sql`now()` })
      .where(and(eq(night.id, values.nightId), ne(night.state, 'unlisted')))
  }
  let reviewItemId: string | null = null
  if (reasons.length) {
    const [item] = await tx
      .insert(reviewItem)
      .values({ orgId: tx.orgId!, gradeId: row.id, reasons })
      .returning({ id: reviewItem.id })
    reviewItemId = item!.id
  }
  if (ledger) {
    const subject: Record<string, string> = values.nightId ? { night_id: values.nightId } : {}
    if (values.callId) subject.call_id = values.callId
    if (values.windowId) subject.window_id = values.windowId
    await appendLedger(tx, {
      projectId,
      kind: pack === 'sky' ? 'grade' : 'night_graded',
      refs: { grade_id: row.id, ...subject },
      body: {
        pack,
        mode: values.proposedMode ?? null,
        observed_mode: values.observedMode ?? null,
        outcome,
        no_call: values.noCall,
        mode_diff: values.modeDiff,
        ...(pack === 'crowd'
          ? { actual: values.actual ?? null, band_low: values.bandLow ?? null, band_high: values.bandHigh ?? null }
          : {})
      }
    })
  }
  // #79 §5: a grade without a call (a night, or a callless window) has no call.graded.
  if (values.callId) await emitEvent(tx, { projectId, type: 'call.graded', data: { call_id: values.callId, outcome } })
  if (values.nightId) {
    await emitEvent(tx, { projectId, type: 'night.graded', data: { night_id: values.nightId, outcome } })
  }
  if (reviewItemId) {
    await emitEvent(tx, { projectId, type: 'review_item.opened', data: { review_item_id: reviewItemId, outcome } })
  }
  await track(tx, 'call_graded', { pack, grade: outcome }, { projectId })
  return { gradeId: row.id, reviewItemId }
}

/** A Crowd night for an unlisted surge (D27), which its grade then names. */
export async function insertUnlistedNight(tx: Tx, q: { projectId: string; date: string }) {
  const [row] = await tx
    .insert(night)
    .values({ orgId: tx.orgId!, projectId: q.projectId, date: q.date, state: 'unlisted' })
    .returning({ id: night.id })
  return row!.id
}

/** Holds the project's Crowd grading to this transaction, so a double-fired run can't record a surge twice. */
export async function lockCrowdGrading(tx: Tx, projectId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`skyclause.grade-crowd:${projectId}`}, 0))`)
}
