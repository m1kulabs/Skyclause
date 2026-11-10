import { createHash } from 'node:crypto'
import type { Json } from '@skyclause/contracts'
import { and, arrayContains, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Tx } from '../client'
import { approval, call, notice, projectChannel, subscriber } from '../schema'

// #153 c-approval-api: the approval's own writes. `approval` rows (#79 §3, append-only), the approved content on a
// call before `transition` moves it, and the outbox `notice` rows (TRD "Channels and sends"). #158 sends the rows.

export type ApprovalAction = (typeof approval.$inferInsert)['action']
export type NoticeLanguage = 'en' | 'ms'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One approver action on a bundle, or on one of its calls. */
export async function recordApproval(
  tx: Tx,
  a: {
    projectId: string
    bundleId: string
    callId?: string | null
    actorId: string
    action: ApprovalAction
    diff?: Json
    at: Date
  }
) {
  await tx.insert(approval).values({
    orgId: tx.orgId!,
    projectId: a.projectId,
    bundleId: a.bundleId,
    callId: a.callId ?? null,
    actorId: a.actorId,
    action: a.action,
    diff: a.diff ?? null,
    createdAt: a.at
  })
}

/** What an approval writes on a call: the wording and recipients approved, and on a shadow pick the engine's call. */
export interface CallContent {
  mode?: (typeof call.$inferInsert)['mode']
  watch?: boolean
  noCall?: string[] | null
  fired?: Array<{ clause: string; inputs: string[] }>
  recommendations?: string[]
  notices?: Array<{ language: NoticeLanguage; subject: string; body: string }>
  recipients?: string[]
  chosen?: 'agent' | 'shadow'
}

/**
 * Writes `content` on a call that is still drafted, under the bundle lock `approveGuard` took. `transition` then
 * recomputes the bundle's `review_hash`, so the hash always covers what was approved.
 */
export async function writeCallContent(tx: Tx, callId: string, content: CallContent, now: Date) {
  const [row] = await tx
    .update(call)
    .set({ ...content, updatedAt: now })
    .where(and(eq(call.id, callId), eq(call.state, 'drafted')))
    .returning({ id: call.id })
  if (!row) throw new Error(`call ${callId} is not drafted`)
}

/** TRD outbox key: `sha256(bundle_id, call_id, subscriber_id, channel)`, joined with `:`. */
export const noticeIdempotencyKey = (bundleId: string, callId: string, subscriberId: string, channel: string) =>
  createHash('sha256').update([bundleId, callId, subscriberId, channel].join(':')).digest('hex')

/**
 * The outbox rows of one approved call (TRD, NTC-8). When the project's email channel is on, one queued `call`
 * notice per ID in `recipients` that is a confirmed subscriber of the project on email. Each row is in the
 * subscriber's language when `languages` holds it, else English (LOC-5's fallback, or no wording in it). Suppression
 * is checked at send (#158), and the unique key makes a replay write nothing. Returns the queued rows by language.
 */
export async function queueCallNotices(
  tx: Tx,
  q: { projectId: string; bundleId: string; callId: string; recipients: string[]; languages: NoticeLanguage[] }
): Promise<Record<NoticeLanguage, number>> {
  const counts = { en: 0, ms: 0 }
  const ids = q.recipients.filter((id) => UUID.test(id))
  const [channel] = await tx
    .select({ enabled: projectChannel.enabled })
    .from(projectChannel)
    .where(and(eq(projectChannel.projectId, q.projectId), eq(projectChannel.channel, 'email')))
  if (!channel?.enabled || !ids.length) return counts
  const recipients = await tx
    .select({ id: subscriber.id, language: subscriber.language })
    .from(subscriber)
    .where(
      and(
        inArray(subscriber.id, ids),
        eq(subscriber.projectId, q.projectId),
        isNotNull(subscriber.confirmedAt),
        arrayContains(subscriber.channels, ['email'])
      )
    )
  if (!recipients.length) return counts
  const rows = recipients.map((r) => {
    const language: NoticeLanguage = q.languages.includes(r.language as NoticeLanguage)
      ? (r.language as NoticeLanguage)
      : 'en'
    counts[language] += 1
    return {
      orgId: tx.orgId!,
      projectId: q.projectId,
      kind: 'call' as const,
      channel: 'email' as const,
      idempotencyKey: noticeIdempotencyKey(q.bundleId, q.callId, r.id, 'email'),
      callId: q.callId,
      subscriberId: r.id,
      language
    }
  })
  await tx.insert(notice).values(rows).onConflictDoNothing({ target: notice.idempotencyKey })
  return counts
}
