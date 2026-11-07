import { toMytIso } from '../../shared/time.ts'
import type { Row } from './schema.ts'

// Private recovery state: never put this object, addresses or draft content in a pack.
export interface EvidenceNoticeIntent {
  requestId: string
  routingAt: string
  marker: string
  lastAttemptAt?: string
  recipient?: string
  draftCreationAttempted?: boolean
  draftId?: string
  threadId?: string
  gmailMessageId?: string
}

export interface EvidenceNoticeMail {
  to: string
  subject: string
  body: string
}
export interface EvidenceDraft extends EvidenceNoticeMail {
  id: string
  messageId: string
  threadId: string
}
export interface EvidenceSentMessage extends EvidenceNoticeMail {
  id: string
  threadId: string
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
  createDraft(mail: EvidenceNoticeMail): EvidenceDraft
  draft(id: string): EvidenceDraft | null
  sendDraft(id: string): EvidenceSentMessage
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
function matches(message: EvidenceNoticeMail, expected: EvidenceNoticeMail): boolean {
  return (
    message.to.toLowerCase() === expected.to.toLowerCase() &&
    message.subject === expected.subject &&
    message.body === expected.body
  )
}

export function deliverEvidenceNotice(requestId: string, ports: EvidenceNotificationPorts): EvidenceNoticeResult {
  let stage = 'notice_read_failed'
  const pending = (code: string): EvidenceNoticeResult => ({ status: 'pending', code })
  try {
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
    let intent = ports.intent(requestId)
    if (!intent || intent.requestId !== requestId) return pending('intent_missing')
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
    stage = 'routing_read_failed'
    const requester = ports.requesterAddress(requestId)
    if (!address(requester)) return pending('requester_unavailable')
    const recipient = intent.recipient ?? ports.dutyAt(intent.routingAt)
    if (!address(recipient)) return pending('duty_unavailable')
    if (recipient.toLowerCase() === requester.toLowerCase()) return pending('requester_is_duty')
    const mail: EvidenceNoticeMail = {
      to: recipient,
      subject: `Evidence request [${intent.marker}]`,
      body: `Request: ${requestId}\nKind: ${row.kind}\nSpan: ${String(row.span_start)} – ${String(row.span_end)}\nWorkbook: ${ports.workbookReference()}\n[${intent.marker}]`
    }
    let outcome: 'sent' | 'reconciled' = 'reconciled'
    if (!intent.gmailMessageId) {
      let draft: EvidenceDraft | null = null
      if (intent.draftCreationAttempted || intent.draftId) {
        stage = 'sent_search_failed'
        const candidates = ports.findSent(intent.marker)
        const verified = new Map(
          candidates
            .filter((candidate) => candidate.id && matches(candidate, mail))
            .map((candidate) => [candidate.id, candidate])
        )
        if (verified.size > 1) return pending('sent_ambiguous')
        const found = verified.values().next().value as EvidenceSentMessage | undefined
        if (found) {
          intent = { ...intent, gmailMessageId: found.id, threadId: found.threadId }
          stage = 'intent_save_failed'
          ports.saveIntent(intent)
        } else {
          stage = 'draft_read_failed'
          draft = intent.draftId ? ports.draft(intent.draftId) : null
          if (!draft) return pending('draft_missing_no_sent_match')
          if (draft.id !== intent.draftId || !matches(draft, mail)) return pending('draft_mismatch')
        }
      } else {
        // Persist the attempt before the provider operation: a lost create response is ambiguous too.
        intent = { ...intent, recipient, draftCreationAttempted: true }
        stage = 'intent_save_failed'
        ports.saveIntent(intent)
        stage = 'draft_create_failed'
        draft = ports.createDraft(mail)
        if (!draft.id || !draft.messageId || !matches(draft, mail)) return pending('draft_mismatch')
        intent = { ...intent, draftId: draft.id, threadId: draft.threadId }
        stage = 'intent_save_failed'
        ports.saveIntent(intent)
      }
      if (draft && !intent.gmailMessageId) {
        stage = 'send_ambiguous'
        const sent = ports.sendDraft(draft.id)
        if (!sent.id || !matches(sent, mail)) return pending('sent_response_invalid')
        intent = { ...intent, gmailMessageId: sent.id, threadId: sent.threadId }
        stage = 'intent_save_failed'
        ports.saveIntent(intent)
        outcome = 'sent'
      }
    }
    if (!intent.gmailMessageId) return pending('provider_id_missing')
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
