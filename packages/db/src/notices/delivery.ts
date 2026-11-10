import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { notice, noticeKind, noticeStatus, suppression } from '../schema'
import { emailHash } from '../subscribers'

// #158 c-sender-email: delivery status from SES's events, for every notice kind (NTC-10). A status only moves forward,
// and a suppression is written only with the move that caused it, so an SNS redelivery or a replayed message changes
// nothing.

type NoticeStatus = (typeof noticeStatus.enumValues)[number]

/** The notice kinds, as the transport's `category` tag names them for an outbox send. */
export const NOTICE_KINDS: readonly string[] = noticeKind.enumValues

/** The notice SES's message ID belongs to, across organisations and account scope; null if none (yet). Needs `withSystem`. */
export async function noticeForProviderMessage(tx: Tx<SystemPrincipal>, providerMessageId: string) {
  const [row] = await tx
    .select({ id: notice.id, orgId: notice.orgId, kind: notice.kind })
    .from(notice)
    .where(eq(notice.providerMessageId, providerMessageId))
  return row ?? null
}

const MOVES: Record<'delivery' | 'bounce' | 'complaint', { to: NoticeStatus; from: NoticeStatus[] }> = {
  delivery: { to: 'delivered', from: ['sent'] },
  bounce: { to: 'bounced', from: ['sent', 'delivered'] },
  complaint: { to: 'complained', from: ['sent', 'delivered'] }
}

/**
 * Applies an SES event to its notice: a delivery makes a sent notice `delivered`; a hard bounce or a complaint makes a
 * sent or delivered one `bounced` or `complained` and suppresses each named recipient's `emailHash` in the
 * organisation (replacing an `unsubscribe` suppression, which a later confirmation could lift). An account-scope
 * `export_ready` notice has no organisation, so its status moves without an organisation suppression. Returns whether
 * the notice moved; one that has already moved past the event is left alone.
 */
export async function recordDeliveryEvent(
  tx: Tx,
  noticeId: string,
  event: { type: 'delivery' | 'bounce' | 'complaint'; recipients: string[] },
  now: Date = new Date()
): Promise<boolean> {
  const move = MOVES[event.type]
  const moved = await tx
    .update(notice)
    .set({ status: move.to, updatedAt: now })
    .where(and(eq(notice.id, noticeId), inArray(notice.status, move.from)))
    .returning({ id: notice.id })
  if (!moved.length) return false
  if (event.type !== 'delivery' && tx.orgId !== null) {
    const reason = event.type
    for (const address of new Set(event.recipients)) {
      await tx
        .insert(suppression)
        .values({ orgId: tx.orgId, emailHash: emailHash(address), reason, at: now })
        .onConflictDoUpdate({
          target: [suppression.orgId, suppression.emailHash],
          set: { reason, at: now },
          setWhere: sql`${suppression.reason} = 'unsubscribe'`
        })
    }
  }
  return true
}
