import { toMytIso } from '../../shared/time.ts'
import {
  deliverEvidenceNotice,
  type EvidenceNoticeIntent,
  type EvidenceNotificationPorts
} from './evidence-notification.ts'
import { buildEvidencePack, serializeEvidencePack } from './evidence-pack.ts'
import { projectEvidenceRows, type EvidencePackData, type EvidenceStoredRows } from './evidence-projections.ts'
import { parseEvidenceRequest, type ParsedEvidenceRequest } from './evidence-request.ts'
import type { Row } from './schema.ts'

export interface EvidenceInboxMessage {
  id: string
  receivedAt: string
  fromAddress: string
  subject: string
  body: string
  inInbox: boolean
  sentByOwner: boolean
  mailerDaemon: boolean
  decodeError?: string
}
export interface EvidenceInboxCursor {
  activatedAt: string
  lowerBound: string
  upperBound?: string
  pageToken?: string
  // Exact remaining IDs, rather than an offset into a mutable provider page.
  page?: { remainingIds: string[]; nextPageToken?: string }
}
export interface EvidenceMessagePage {
  messageIds: string[]
  nextPageToken?: string
}
export interface EvidenceInboxPorts {
  now(): Date
  ownerEmail(): string
  projectSlug(): string
  cursor(): EvidenceInboxCursor | null
  saveCursor(cursor: EvidenceInboxCursor): void
  // List at most 25 individual INBOX IDs in the frozen interval; no message bodies.
  listMessages(cursor: EvidenceInboxCursor): EvidenceMessagePage
  message(id: string): EvidenceInboxMessage | null
  evidenceRows(): Row<'evidence'>[]
  packRows(): EvidenceStoredRows
  appendEvidence(row: Row<'evidence'>): void
  // Stamp only matching sender rows with blank unsubscribed_at, preserving all other cells.
  unsubscribe(address: string, at: string): void
  notices: EvidenceNotificationPorts
}
export interface EvidenceInboxReport {
  initialized: boolean
  processed: string[]
  skipped: string[]
  pendingNoticeIds: string[]
  pageComplete: boolean
  errors: { requestId?: string; code: string }[]
}

// Keep source millisecond precision for activation, pagination and receipt eligibility.
export function toEvidenceInstant(date: Date): string {
  const base = toMytIso(date)
  const milliseconds = date.getUTCMilliseconds()
  return milliseconds ? `${base.slice(0, 19)}.${String(milliseconds).padStart(3, '0')}+08:00` : base
}

export function runEvidenceInbox(ports: EvidenceInboxPorts): EvidenceInboxReport {
  const report: EvidenceInboxReport = {
    initialized: false,
    processed: [],
    skipped: [],
    pendingNoticeIds: [],
    pageComplete: false,
    errors: []
  }
  let stage = 'cursor_read_failed'
  let requestId: string | undefined
  const pending = new Set<string>()
  const notice = (id: string, recoveryIntent?: EvidenceNoticeIntent) => {
    const result = deliverEvidenceNotice(id, ports.notices, recoveryIntent)
    if (result.status === 'pending') {
      pending.add(id)
      report.errors.push({ requestId: id, code: result.code })
    } else pending.delete(id)
  }
  try {
    const startedAt = ports.now().getTime()
    let cursor = ports.cursor()
    if (!cursor) {
      const at = toEvidenceInstant(new Date(startedAt))
      stage = 'cursor_save_failed'
      ports.saveCursor({ activatedAt: at, lowerBound: at })
      report.initialized = true
      report.pageComplete = true
      return report
    }
    stage = 'evidence_read_failed'
    const recorded = new Set(ports.evidenceRows().map((row) => String(row.request_id)))
    stage = 'intent_read_failed'
    const intents = ports.notices.intents()
    for (const intent of intents) pending.add(intent.requestId)
    // Recover durable rows independently of whether their original message is still in INBOX.
    let drained = 0
    const recovery = [...intents].sort((left, right) => {
      const age = Date.parse(left.lastAttemptAt ?? left.routingAt) - Date.parse(right.lastAttemptAt ?? right.routingAt)
      return age || (left.requestId < right.requestId ? -1 : left.requestId > right.requestId ? 1 : 0)
    })
    for (const intent of recovery) {
      if (drained > 0 && ports.now().getTime() - startedAt >= 20_000) break
      if (recorded.has(intent.requestId)) {
        notice(intent.requestId, intent)
        drained++
      }
    }
    if (!cursor.upperBound) {
      cursor = { ...cursor, upperBound: toEvidenceInstant(ports.now()) }
      stage = 'cursor_save_failed'
      ports.saveCursor(cursor)
    }
    stage = 'message_list_failed'
    const page =
      cursor.page ??
      (() => {
        const listed = ports.listMessages(cursor)
        return { remainingIds: listed.messageIds, nextPageToken: listed.nextPageToken }
      })()
    if (page.remainingIds.length > 25) {
      report.errors.push({ code: 'message_page_too_large' })
      return { ...report, pendingNoticeIds: [...pending] }
    }
    let data: EvidencePackData | undefined
    let newMessages = 0
    let progressed = 0
    let remaining = [...page.remainingIds]
    while (remaining.length > 0) {
      if (newMessages >= 5 || (progressed > 0 && ports.now().getTime() - startedAt >= 20_000)) break
      requestId = remaining[0]!
      if (recorded.has(requestId)) {
        report.skipped.push(requestId)
      } else {
        newMessages++
        stage = 'message_read_failed'
        const message = ports.message(requestId)
        const received = message ? Date.parse(message.receivedAt) : NaN
        if (
          !message ||
          message.id !== requestId ||
          !message.inInbox ||
          message.sentByOwner ||
          message.mailerDaemon ||
          message.fromAddress.trim().toLowerCase() === ports.ownerEmail().trim().toLowerCase() ||
          !Number.isFinite(received) ||
          received <= Date.parse(cursor.activatedAt) ||
          received < Date.parse(cursor.lowerBound) ||
          received > Date.parse(cursor.upperBound!)
        ) {
          report.skipped.push(requestId)
        } else {
          const routingAt = toEvidenceInstant(ports.now())
          const receivedAt = toEvidenceInstant(new Date(received))
          stage = 'request_parse_failed'
          const parsed: ParsedEvidenceRequest = message.decodeError
            ? { kind: 'unparseable', spanStart: null, spanEnd: null }
            : parseEvidenceRequest({ subject: message.subject, body: message.body, receivedAt })
          if (parsed.kind === 'evidence' || parsed.kind === 'call') {
            // Freeze the first processing time before fallible public reads or pack assembly.
            stage = 'intent_save_failed'
            if (!ports.notices.intent(requestId))
              ports.notices.saveIntent({ requestId, routingAt, marker: `evidence:${ports.notices.hashId(requestId)}` })
            pending.add(requestId)
          }
          stage = 'pack_build_failed'
          // Header-only kinds never read public storage and cannot leak private request fields.
          const packData =
            parsed.kind === 'evidence' || parsed.kind === 'call'
              ? (data ??= projectEvidenceRows(ports.packRows()))
              : {
                  readings: [],
                  warnings: [],
                  forecast: [],
                  glossary: [],
                  ledger: [],
                  grades: [],
                  windows: [],
                  now: [],
                  frames: []
                }
          const serialized = serializeEvidencePack(
            parsed.kind,
            buildEvidencePack(
              parsed,
              { projectSlug: ports.projectSlug(), receivedAt, assembledAt: routingAt },
              packData
            )
          )
          const notifiable = serialized.kind === 'evidence' || serialized.kind === 'call'
          if (serialized.kind === 'unsubscribe') {
            stage = 'unsubscribe_failed'
            ports.unsubscribe(message.fromAddress, receivedAt)
          }
          stage = 'evidence_append_failed'
          ports.appendEvidence({
            request_id: requestId,
            received_at: receivedAt,
            kind: serialized.kind,
            span_start: notifiable ? (parsed.spanStart ?? '') : '',
            span_end: notifiable ? (parsed.spanEnd ?? '') : '',
            pack_json: serialized.packJson,
            status: 'parsed',
            drafted_at: '',
            approved_at: '',
            replied_at: ''
          })
          recorded.add(requestId)
          report.processed.push(requestId)
          if (notifiable || pending.has(requestId)) notice(requestId)
        }
      }
      remaining = remaining.slice(1)
      progressed++
      // The provider token stays put while any exact ID in this snapshot remains.
      cursor = { ...cursor, page: { remainingIds: remaining, nextPageToken: page.nextPageToken } }
      stage = 'cursor_save_failed'
      requestId = undefined
      ports.saveCursor(cursor)
    }
    if (remaining.length === 0) {
      cursor = page.nextPageToken
        ? {
            activatedAt: cursor.activatedAt,
            lowerBound: cursor.lowerBound,
            upperBound: cursor.upperBound,
            pageToken: page.nextPageToken
          }
        : {
            activatedAt: cursor.activatedAt,
            lowerBound: toEvidenceInstant(
              new Date(Math.max(Date.parse(cursor.activatedAt), Date.parse(cursor.upperBound!) - 1000))
            )
          }
      stage = 'cursor_save_failed'
      ports.saveCursor(cursor)
      report.pageComplete = true
    }
  } catch {
    report.errors.push(requestId ? { requestId, code: stage } : { code: stage })
  }
  report.pendingNoticeIds = [...pending]
  return report
}
