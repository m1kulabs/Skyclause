import type { CallView, Pack } from '@skyclause/contracts'
import { and, asc, eq, gt, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm'
import { track } from '../analytics'
import { markSending, transition } from '../bundles'
import type { SystemPrincipal, Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../ledger'
import { bundle, call, member, night, notice, project, source, subscriber, suppression, window } from '../schema'

// #158 c-sender-email: the outbox side of sending `call` notices (TRD "Channels and sends"). A send runs between two
// transactions: the claim (`FOR UPDATE OF notice SKIP LOCKED`) takes a lease and commits, the provider call runs
// outside any transaction, and the record commits its answer; a send that crashed in between is retried once its
// lease lapses, so at most one email repeats, under the same idempotency key.

/**
 * How long a claimed send holds its notice: longer than the worker's 600 s request timeout, so a send still in flight
 * never loses it; a crashed send is retried by the first sweep after it lapses.
 */
export const NOTICE_LEASE_MS = 15 * 60_000
/** Transport errors retried after the first try before a notice is `failed`. */
export const NOTICE_RETRIES = 5

type CallRow = typeof call.$inferSelect
const iso = (date: Date | null) => (date ? date.toISOString() : null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A stored call as its wire `CallView`, which `renderNotice` takes (the API's reads map it the same way). */
function callViewOf(row: CallRow): CallView {
  return {
    id: row.id,
    bundle_id: row.bundleId,
    window_id: row.windowId,
    night_id: row.nightId,
    mode: row.mode,
    watch: row.watch,
    no_call: row.noCall as string[] | null,
    fired: row.fired as CallView['fired'],
    recommendations: row.recommendations as CallView['recommendations'],
    recipients: row.recipients,
    notices: row.notices as CallView['notices'],
    reason: row.reason ?? '',
    state: row.state,
    shadow: row.shadow as CallView['shadow'],
    chosen: row.chosen,
    agrees: row.agrees,
    decision: row.decision,
    expires_at: row.expiresAt.toISOString(),
    triggered_at: row.triggeredAt.toISOString(),
    drafted_at: row.draftedAt.toISOString(),
    approved_at: iso(row.approvedAt),
    sent_at: iso(row.sentAt),
    superseded_by_call_id: row.supersededByCallId,
    ics_uid: row.icsUid,
    ics_sequence: row.icsSequence
  }
}

/** The source IDs a call's shadow verdict cites, from its clauses' inputs. */
function citedSourceIds(shadow: unknown): string[] {
  const clauses = (shadow as { clauses?: Array<{ inputs?: Array<{ source_ids?: string[] }> }> } | null)?.clauses ?? []
  const ids = clauses.flatMap((c) => c.inputs ?? []).flatMap((i) => i.source_ids ?? [])
  return [...new Set(ids)].filter((id) => UUID.test(id))
}

/** A claimed `call` notice with what its checks and its rendering need. */
export interface ClaimedNotice {
  notice: { id: string; projectId: string; language: string; idempotencyKey: string; attempts: number }
  call: CallView
  callExpiresAt: Date
  pack: Pack
  projectName: string
  /** The window's span, or the night's arrival start to exit end. */
  span: { startsAt: Date; endsAt: Date } | null
  /** Null when the row names no subscriber or it was erased. */
  subscriber: { id: string; email: string; confirmed: boolean; unsubscribed: boolean } | null
  /** The approving member's current role in the organisation; null if no longer a member. */
  approverRole: string | null
  sources: Array<{ name: string; licence: string }>
}

/**
 * Locks the next queued `call` notice after `after` (ID order) whose call is `sending` and whose lease, if any, has
 * lapsed by `now`, skipping rows another sender holds; `callIds` narrows it to those calls. Null when none is left.
 */
export async function claimCallNotice(
  tx: Tx,
  q: { now: Date; after?: string; callIds?: string[] }
): Promise<ClaimedNotice | null> {
  if (q.callIds?.length === 0) return null
  const [row] = await tx
    .select({
      notice,
      call,
      pack: bundle.pack,
      approvedBy: bundle.approvedBy,
      projectName: project.name,
      subscriber: {
        id: subscriber.id,
        email: subscriber.email,
        confirmedAt: subscriber.confirmedAt,
        unsubscribedAt: subscriber.unsubscribedAt
      },
      window: { startsAt: window.startsAt, endsAt: window.endsAt },
      night: { startsAt: night.arrivalStart, endsAt: night.exitEnd }
    })
    .from(notice)
    .innerJoin(call, eq(call.id, notice.callId))
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .innerJoin(project, eq(project.id, notice.projectId))
    .leftJoin(subscriber, eq(subscriber.id, notice.subscriberId))
    .leftJoin(window, eq(window.id, call.windowId))
    .leftJoin(night, eq(night.id, call.nightId))
    .where(
      and(
        eq(notice.kind, 'call'),
        eq(notice.status, 'queued'),
        or(isNull(notice.claimedUntil), lte(notice.claimedUntil, q.now)),
        eq(call.state, 'sending'),
        q.after ? gt(notice.id, q.after) : undefined,
        q.callIds ? inArray(notice.callId, q.callIds) : undefined
      )
    )
    .orderBy(asc(notice.id))
    .limit(1)
    .for('update', { of: notice, skipLocked: true })
  if (!row) return null

  const [approver] = row.approvedBy
    ? await tx
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.organizationId, tx.orgId!), eq(member.userId, row.approvedBy)))
    : []
  const ids = citedSourceIds(row.call.shadow)
  const sources = ids.length
    ? await tx
        .select({ name: source.name, licence: source.licenceLabel })
        .from(source)
        .where(inArray(source.id, ids))
        .orderBy(source.name)
    : []
  const span = row.window?.startsAt ? row.window : row.night?.startsAt && row.night.endsAt ? row.night : null
  return {
    notice: {
      id: row.notice.id,
      projectId: row.notice.projectId,
      language: row.notice.language,
      idempotencyKey: row.notice.idempotencyKey,
      attempts: row.notice.attempts
    },
    call: callViewOf(row.call),
    callExpiresAt: row.call.expiresAt,
    pack: row.pack,
    projectName: row.projectName,
    span: span ? { startsAt: span.startsAt!, endsAt: span.endsAt! } : null,
    subscriber: row.subscriber?.id
      ? {
          id: row.subscriber.id,
          email: row.subscriber.email,
          confirmed: row.subscriber.confirmedAt !== null,
          unsubscribed: row.subscriber.unsubscribedAt !== null
        }
      : null,
    approverRole: approver?.role ?? null,
    sources
  }
}

/** True when the organisation suppresses `hash` (`emailHash` of the address) for any reason: unsubscribe, bounce or complaint. */
export async function isSuppressed(tx: Tx, hash: string): Promise<boolean> {
  const [row] = await tx.select({ id: suppression.id }).from(suppression).where(eq(suppression.emailHash, hash))
  return row !== undefined
}

/** Takes a claimed notice's lease for its send, counting the attempt. Call it in the claim's transaction. */
export async function leaseCallNotice(tx: Tx, noticeId: string, now: Date) {
  await tx
    .update(notice)
    .set({
      attempts: sql`${notice.attempts} + 1`,
      claimedUntil: new Date(now.getTime() + NOTICE_LEASE_MS),
      updatedAt: now
    })
    .where(eq(notice.id, noticeId))
}

export type CallNoticeOutcome =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'suppressed' | 'expired' }
  /** A transport error: queued again for the sweep, or `failed` once the retries are spent. */
  | { status: 'retry' }

/**
 * Records a claimed notice's outcome while it is still `queued` (a late answer never overwrites another sender's);
 * a `sent` one stores the provider's message ID and `accepted_at` and tracks `notice_sent`. Returns the status written,
 * or null when the row had already left `queued`.
 */
export async function recordCallNotice(
  tx: Tx,
  claimed: Pick<ClaimedNotice, 'notice' | 'pack'>,
  outcome: CallNoticeOutcome,
  now: Date
): Promise<string | null> {
  const { notice: n, pack } = claimed
  let values: Partial<typeof notice.$inferInsert> | { status: SQL }
  if (outcome.status === 'sent') {
    values = { status: 'sent', providerMessageId: outcome.providerMessageId, acceptedAt: now }
  } else if (outcome.status === 'retry') {
    values = {
      status: sql`CASE WHEN ${notice.attempts} > ${NOTICE_RETRIES} THEN 'failed' ELSE 'queued' END::notice_status`
    }
  } else {
    values = { status: outcome.status }
  }
  const [row] = await tx
    .update(notice)
    .set({ ...values, claimedUntil: null, updatedAt: now })
    .where(and(eq(notice.id, n.id), eq(notice.status, 'queued')))
    .returning({ status: notice.status })
  if (!row) return null
  if (row.status === 'sent') {
    const language = n.language === 'ms' ? 'ms' : 'en'
    await track(tx, 'notice_sent', { channel: 'email', language, pack }, { projectId: n.projectId })
  }
  return row.status
}

/** The organisation's calls in `sending`, for the sweep to settle. */
export async function sendingCallIds(tx: Tx): Promise<string[]> {
  const rows = await tx.select({ id: call.id }).from(call).where(eq(call.state, 'sending')).orderBy(asc(call.id))
  return rows.map((r) => r.id)
}

/**
 * The organisations the sweep visits: each with a queued `call` notice, or one that changed since `since`, so a call
 * whose settle failed after its last send is settled later. Needs `withSystem` (migration `c-sender-email-lookup`).
 */
export async function noticeOrgsToSweep(tx: Tx<SystemPrincipal>, since: Date): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ orgId: notice.orgId })
    .from(notice)
    .where(and(eq(notice.kind, 'call'), or(eq(notice.status, 'queued'), gte(notice.updatedAt, since))))
    .orderBy(asc(notice.orgId))
  return rows.map((r) => r.orgId)
}

export type SettleOutcome = 'sent' | 'failed'

/**
 * Settles a `sending` call once none of its `call` notices is queued: `failed` when it has notices and none reached
 * the provider (every one `failed` or `expired`), else `sent`, through #150's `transition` under the bundle's lock; the
 * bundle goes to `sent` with its last sending call. Appends `call_sent` with the notices counted by status and
 * language (never an address) and emits `call.sent` (`mode` null for a No call). Null, writing nothing, when the call isn't `sending` or still has
 * a queued notice.
 */
export async function settleCall(tx: Tx, callId: string, now: Date): Promise<SettleOutcome | null> {
  const [found] = await tx.select({ bundleId: call.bundleId }).from(call).where(eq(call.id, callId))
  if (!found) return null
  const [parent] = await tx.select().from(bundle).where(eq(bundle.id, found.bundleId)).for('update')
  const calls = await tx.select({ id: call.id, state: call.state }).from(call).where(eq(call.bundleId, found.bundleId))
  if (calls.find((c) => c.id === callId)?.state !== 'sending') return null
  const notices = await tx
    .select({ status: notice.status, language: notice.language })
    .from(notice)
    .where(and(eq(notice.callId, callId), eq(notice.kind, 'call')))
  if (notices.some((n) => n.status === 'queued')) return null

  const outcome: SettleOutcome =
    notices.length > 0 && notices.every((n) => n.status === 'failed' || n.status === 'expired') ? 'failed' : 'sent'
  const othersSending = calls.some((c) => c.id !== callId && c.state === 'sending')
  await transition(tx, parent!.id, { calls: { [callId]: outcome }, bundle: othersSending ? undefined : 'sent' }, now)

  const [settled] = await tx.select().from(call).where(eq(call.id, callId))
  const counts: Record<string, Record<string, number>> = {}
  for (const n of notices) {
    const byLanguage = (counts[n.status] ??= {})
    byLanguage[n.language] = (byLanguage[n.language] ?? 0) + 1
  }
  await appendLedger(tx, {
    projectId: settled!.projectId,
    kind: 'call_sent',
    refs: {
      call_id: settled!.id,
      bundle_id: parent!.id,
      ...(settled!.windowId ? { window_id: settled!.windowId } : {}),
      ...(settled!.nightId ? { night_id: settled!.nightId } : {})
    },
    body: { pack: parent!.pack, mode: settled!.mode, outcome, notices: counts }
  })
  await emitEvent(tx, {
    projectId: settled!.projectId,
    type: 'call.sent',
    data: { call_id: settled!.id, mode: settled!.mode, outcome }
  })
  return outcome
}

/**
 * Moves an `approved` or `sending` bundle with nothing left to send (no call `approved`, `edited` or `sending`) to
 * `sent`, through `markSending` and `transition`. #153 leaves a bundle whose every call it rejected `approved`, with
 * no sending call; a bundle with sent calls already moved with its last one. Returns whether it moved.
 */
export async function settleBundle(tx: Tx, bundleId: string, now: Date): Promise<boolean> {
  const [row] = await tx.select({ state: bundle.state }).from(bundle).where(eq(bundle.id, bundleId)).for('update')
  if (row?.state !== 'approved' && row?.state !== 'sending') return false
  const calls = await tx.select({ state: call.state }).from(call).where(eq(call.bundleId, bundleId))
  if (calls.some((c) => c.state === 'approved' || c.state === 'edited' || c.state === 'sending')) return false
  if (row.state === 'approved') await markSending(tx, bundleId, [], now)
  await transition(tx, bundleId, { bundle: 'sent' }, now)
  return true
}
