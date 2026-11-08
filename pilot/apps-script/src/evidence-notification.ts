import { toMytIso } from '../../shared/time.ts'
import type { Row } from './schema.ts'
import {
  deliverControlledDraft,
  type ControlledMail,
  type ControlledDraft,
  type ControlledSent,
  type DraftAttemptState
} from './draft-delivery.ts'

// Private recovery state: never put this object, addresses or draft content in a pack.
export interface EvidenceNoticeIntent extends DraftAttemptState {
  requestId: string
  routingAt: string
  marker: string
  lastAttemptAt?: string
}

export type EvidenceNoticeMail = ControlledMail
export type EvidenceDraft = ControlledDraft
export type EvidenceSentMessage = ControlledSent
export interface EvidenceDraftAcknowledgement {
  id: string
}
export interface EvidenceSendAcknowledgement {
  id: string
  threadId?: string
}
export interface EvidenceNotificationPorts {
  now(): Date
  intent(requestId: string): EvidenceNoticeIntent | null
  saveIntent(intent: EvidenceNoticeIntent): void
  removeIntent(requestId: string): void
  intents(): EvidenceNoticeIntent[]
  evidence(requestId: string): Row<'evidence'> | null
  notification(requestId: string): Row<'notifications'> | null
  requesterAddress(requestId: string): string | null
  dutyAt(at: string): string | null
  hashId(id: string): string
  workbookReference(): string
  createDraft(mail: EvidenceNoticeMail): EvidenceDraftAcknowledgement
  draft(id: string): EvidenceDraft | null
  sendDraft(id: string): EvidenceSendAcknowledgement
  // Must scan the complete provider result set, or throw. Never return a partial search as complete.
  findSent(marker: string): EvidenceSentMessage[]
  appendNotification(row: Row<'notifications'>): void
}
export type EvidenceNoticeResult =
  | { status: 'sent' | 'reconciled' | 'already_logged'; gmailMessageId: string }
  | { status: 'pending'; code: string }
  | { status: 'skipped' }

function address(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)
}
export function deliverEvidenceNotice(
  requestId: string,
  ports: EvidenceNotificationPorts,
  // Latest durable snapshot from intents(), under the same orchestration lock.
  recoveryIntent?: EvidenceNoticeIntent
): EvidenceNoticeResult {
  let stage = 'intent_read_failed'
  const pending = (code: string): EvidenceNoticeResult => ({ status: 'pending', code })
  try {
    // Recovery already loaded this durable snapshot. Stamp it before another store read can fail slowly.
    let intent = recoveryIntent ?? ports.intent(requestId)
    if (intent && intent.requestId !== requestId) return pending('intent_missing')
    if (intent) {
      const attempt = ports.now()
      const attemptBase = toMytIso(attempt)
      const milliseconds = attempt.getUTCMilliseconds()
      intent = {
        ...intent,
        lastAttemptAt: milliseconds
          ? `${attemptBase.slice(0, 19)}.${String(milliseconds).padStart(3, '0')}+08:00`
          : attemptBase
      }
      stage = 'intent_save_failed'
      ports.saveIntent(intent)
    }
    stage = 'notice_read_failed'
    const logged = ports.notification(requestId)
    if (
      logged?.kind === 'evidence_request' &&
      logged.ref === requestId &&
      typeof logged.gmail_message_id === 'string' &&
      logged.gmail_message_id.trim()
    ) {
      stage = 'intent_cleanup_failed'
      ports.removeIntent(requestId)
      return { status: 'already_logged', gmailMessageId: logged.gmail_message_id }
    }
    const row = ports.evidence(requestId)
    if (!row) return pending('evidence_not_durable')
    if (row.kind === 'unparseable' || row.kind === 'unsubscribe') {
      stage = 'intent_cleanup_failed'
      ports.removeIntent(requestId)
      return { status: 'skipped' }
    }
    if (row.kind !== 'evidence' && row.kind !== 'call') return pending('invalid_evidence_kind')
    if (!intent) return pending('intent_missing')
    let recipient = intent.recipient
    let outcome: 'sent' | 'reconciled' = 'reconciled'
    if (!intent.gmailMessageId) {
      stage = 'routing_read_failed'
      const requester = ports.requesterAddress(requestId)
      if (!address(requester)) return pending('requester_unavailable')
      recipient = intent.recipient ?? ports.dutyAt(intent.routingAt) ?? undefined
      if (!address(recipient)) return pending('duty_unavailable')
      if (recipient.toLowerCase() === requester.toLowerCase()) return pending('requester_is_duty')
      const mail: EvidenceNoticeMail = {
        to: recipient,
        subject: `Evidence request [${intent.marker}]`,
        body: `Request: ${requestId}\nKind: ${row.kind}\nSpan: ${String(row.span_start)} – ${String(row.span_end)}\nWorkbook: ${ports.workbookReference()}\n[${intent.marker}]`
      }
      const delivery = deliverControlledDraft(intent, intent.marker, mail, {
        saveAttempt: (next) => {
          const saved = { ...intent!, ...next }
          ports.saveIntent(saved)
          intent = saved
        },
        createDraft: (value) => ports.createDraft(value),
        draft: (id) => ports.draft(id),
        sendDraft: (id) => ports.sendDraft(id),
        findSent: (marker) => ports.findSent(marker)
      })
      if (delivery.status === 'pending') return delivery
      intent = { ...intent, ...delivery.attempt }
      outcome = delivery.status
    }
    if (!intent.gmailMessageId) return pending('provider_id_missing')
    if (!address(recipient)) return pending('frozen_recipient_missing')
    stage = 'notification_append_failed'
    ports.appendNotification({
      at: toMytIso(ports.now()),
      kind: 'evidence_request',
      to: recipient,
      ref: requestId,
      gmail_message_id: intent.gmailMessageId
    })
    stage = 'intent_cleanup_failed'
    ports.removeIntent(requestId)
    return { status: outcome, gmailMessageId: intent.gmailMessageId }
  } catch {
    return pending(stage)
  }
}
