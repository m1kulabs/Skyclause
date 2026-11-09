import { and, eq, sql } from 'drizzle-orm'
import { recordAudit } from '../audit'
import type { Tx } from '../client'
import { auditEvent } from '../schema'

// #163: an emailed reply that isn't logged leaves one audit row (no address, no text), under the SES message ID.

export type ReplyDropReason = 'unparsed' | 'verdict' | 'sender'

/**
 * Audits a dropped reply once per SES message ID, so a redelivery of the same mail (#113: possible across worker
 * instances) adds nothing. `AUDIT_ACTIONS` has no reply action, so it is `staff.action` on target `crowd_reply`, as
 * #146 audits its archive job.
 */
export async function recordReplyDrop(
  tx: Tx,
  d: { projectId: string; messageId: string; reason: ReplyDropReason }
): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`skyclause.reply-drop:${d.messageId}`}, 0))`)
  const [earlier] = await tx
    .select({ id: auditEvent.id })
    .from(auditEvent)
    .where(and(eq(auditEvent.targetType, 'crowd_reply'), eq(auditEvent.targetId, d.messageId)))
  if (earlier) return
  await recordAudit(tx, {
    action: 'staff.action',
    target: { type: 'crowd_reply', id: d.messageId },
    projectId: d.projectId,
    after: { dropped: d.reason }
  })
}
