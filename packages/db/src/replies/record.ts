import { and, eq, gt, isNull, or, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { appendLedger } from '../ledger'
import { crowdReply, planFeedback, project, subscriber, subscriberToken, window } from '../schema'
import { consumeSubscriberToken } from '../subscribers'

// #163 (c-recipient-replies): the two answers a subscriber gives without an account, each spending its token.

export type CrowdReplyKind = (typeof crowdReply.$inferInsert)['kind']

/** The address a `reply` token's subscriber must send from, or null once the subscriber is gone. */
export async function replySender(tx: Tx, subscriberId: string): Promise<string | null> {
  const [row] = await tx.select({ email: subscriber.email }).from(subscriber).where(eq(subscriber.id, subscriberId))
  return row?.email ?? null
}

/**
 * Logs a Crowd recipient's reply (CAL-17) and spends its `reply` token, or refuses with nothing written when it was
 * made (`at`) once the window had ended, or the token is spent (one reply per token). `shiftTo` is `HH:MM`,
 * project-local, on the window's date. The ledger entry carries IDs, the kind and times only.
 */
export async function recordCrowdReply(
  tx: Tx,
  r: {
    tokenId: string
    projectId: string
    windowId: string
    callId: string
    kind: CrowdReplyKind
    shiftTo: string | null
    at: Date
  }
): Promise<{ id: string } | 'window-ended' | 'spent'> {
  const localDate = sql`(${window.startsAt} AT TIME ZONE ${project.timeZone})::date`
  const [target] = await tx
    .select({
      endsAt: window.endsAt,
      shiftTo: (r.shiftTo === null
        ? sql`NULL::timestamptz`
        : sql`(${localDate} + ${r.shiftTo}::time) AT TIME ZONE ${project.timeZone}`
      ).mapWith(window.startsAt)
    })
    .from(window)
    .innerJoin(project, eq(project.id, window.projectId))
    .where(eq(window.id, r.windowId))
  if (!target || target.endsAt <= r.at) return 'window-ended'
  if (!(await consumeSubscriberToken(tx, r.tokenId))) return 'spent'

  const [row] = await tx
    .insert(crowdReply)
    .values({
      orgId: tx.orgId!,
      projectId: r.projectId,
      windowId: r.windowId,
      callId: r.callId,
      kind: r.kind,
      shiftTo: target.shiftTo,
      at: r.at
    })
    .returning({ id: crowdReply.id })
  await appendLedger(tx, {
    projectId: r.projectId,
    kind: 'crowd_reply',
    refs: { window_id: r.windowId, call_id: r.callId, crowd_reply_id: row!.id },
    body: { kind: r.kind, shift_to: target.shiftTo?.toISOString() ?? null, at: r.at.toISOString() }
  })
  return { id: row!.id }
}

/**
 * Counts one plan-feedback answer (ANL-7) and spends its `feedback` token, or null once it is spent or expired. Returns
 * the window's count for that answer. The token's `used_at` is the start of its UTC day, so neither the row's time nor
 * its UUIDv7 ID can join an answer to the subscriber who gave it.
 */
export async function recordPlanFeedback(
  tx: Tx,
  f: { tokenId: string; projectId: string; windowId: string; answer: boolean }
): Promise<{ count: number } | null> {
  const spent = await tx
    .update(subscriberToken)
    .set({ usedAt: sql`date_trunc('day', now(), 'UTC')` })
    .where(
      and(
        eq(subscriberToken.id, f.tokenId),
        isNull(subscriberToken.usedAt),
        or(isNull(subscriberToken.expiresAt), gt(subscriberToken.expiresAt, sql`now()`))
      )
    )
    .returning({ id: subscriberToken.id })
  if (!spent.length) return null
  await tx.insert(planFeedback).values({
    orgId: tx.orgId!,
    projectId: f.projectId,
    windowId: f.windowId,
    answer: f.answer
  })
  const [total] = await tx
    .select({ count: sql<number>`sum(${planFeedback.count})::int` })
    .from(planFeedback)
    .where(and(eq(planFeedback.windowId, f.windowId), eq(planFeedback.answer, f.answer)))
  return { count: total!.count }
}
