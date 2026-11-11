import { createHash } from 'node:crypto'
import { and, eq, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { projectGate } from '../gate'
import { bundle, call, notice, project, subscriber, suppression, window } from '../schema'

// #163 (ANL-7): who gets the "Did the weather change your plan?" email after a graded call, and its `notice` rows.

export interface FeedbackWindow {
  id: string
  title: string
  startsAt: Date
  projectId: string
  projectName: string
}

/**
 * A graded call's window and the subscribers to ask, or null unless it is a sent-able Sky window call in an open
 * project: not draft-only, not a guest window. A subscriber qualifies once a `call` notice for any call of that window
 * reached them (`sent` or `delivered`) and they are confirmed, not unsubscribed, still on email and not suppressed.
 */
export async function feedbackRecipients(
  tx: Tx,
  callId: string
): Promise<{ window: FeedbackWindow; recipients: Array<{ id: string; email: string; language: string }> } | null> {
  const [graded] = await tx
    .select({
      pack: bundle.pack,
      draftOnly: bundle.draftOnly,
      guest: window.guest,
      id: window.id,
      title: window.title,
      startsAt: window.startsAt,
      projectId: window.projectId,
      projectName: project.name
    })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .innerJoin(window, eq(window.id, call.windowId))
    .innerJoin(project, eq(project.id, window.projectId))
    .where(eq(call.id, callId))
  if (!graded || graded.pack !== 'sky' || graded.draftOnly || graded.guest) return null
  if ((await projectGate(tx, graded.projectId)) !== 'open') return null

  const windowCalls = tx.select({ id: call.id }).from(call).where(eq(call.windowId, graded.id))
  const recipients = await tx
    .selectDistinct({ id: subscriber.id, email: subscriber.email, language: subscriber.language })
    .from(notice)
    .innerJoin(subscriber, eq(subscriber.id, notice.subscriberId))
    .where(
      and(
        eq(notice.kind, 'call'),
        inArray(notice.status, ['sent', 'delivered']),
        inArray(notice.callId, windowCalls),
        isNotNull(subscriber.confirmedAt),
        isNull(subscriber.unsubscribedAt),
        sql`'email' = ANY(${subscriber.channels})`,
        notExists(
          tx
            .select({ one: sql`1` })
            .from(suppression)
            .where(eq(suppression.emailHash, subscriber.emailHash))
        )
      )
    )
    .orderBy(subscriber.id)
  const { pack: _pack, draftOnly: _draftOnly, guest: _guest, ...feedbackWindow } = graded
  return { window: feedbackWindow, recipients }
}

/**
 * Queues one subscriber's feedback notice for a window, or null when it already exists: the key hashes the kind,
 * subscriber and window, so each subscriber is asked once per window however many of its calls are graded.
 */
export async function queueFeedbackNotice(
  tx: Tx,
  n: { projectId: string; subscriberId: string; windowId: string; language: string }
): Promise<{ id: string; idempotencyKey: string } | null> {
  const idempotencyKey = createHash('sha256').update(`feedback\n${n.subscriberId}\n${n.windowId}`).digest('hex')
  const [row] = await tx
    .insert(notice)
    .values({
      orgId: tx.orgId!,
      projectId: n.projectId,
      kind: 'feedback',
      channel: 'email',
      idempotencyKey,
      subscriberId: n.subscriberId,
      language: n.language
    })
    .onConflictDoNothing({ target: notice.idempotencyKey })
    .returning({ id: notice.id })
  return row ? { id: row.id, idempotencyKey } : null
}

/** Records the provider's answer to a send: `sent` with its message ID, or `failed` (null). `/resend/webhook` takes over. */
export async function recordNoticeSend(tx: Tx, noticeId: string, providerMessageId: string | null): Promise<void> {
  const now = new Date()
  await tx
    .update(notice)
    .set(
      providerMessageId === null
        ? { status: 'failed', updatedAt: now }
        : { status: 'sent', providerMessageId, acceptedAt: now, updatedAt: now }
    )
    .where(eq(notice.id, noticeId))
}
