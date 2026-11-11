import { recordAudit } from '../audit'
import type { Tx } from '../client'

// #163: an emailed reply that isn't logged leaves one audit row (no address, no text), under the received email's ID.

export type ReplyDropReason = 'unparsed' | 'verdict' | 'sender'

/**
 * Audits a dropped reply as `crowd_reply.dropped`. The caller runs it inside `handleOnce` for the email's ID, so a
 * redelivery of the same mail (#113: possible across worker instances) adds nothing.
 */
export async function recordReplyDrop(
  tx: Tx,
  d: { projectId: string; messageId: string; reason: ReplyDropReason }
): Promise<void> {
  await recordAudit(tx, {
    action: 'crowd_reply.dropped',
    target: { type: 'crowd_reply', id: d.messageId },
    projectId: d.projectId,
    after: { dropped: d.reason }
  })
}
