import { toEvidenceInstant, type EvidenceInboxCursor, type EvidenceInboxPorts } from './evidence.ts'
import type { EvidenceNoticeIntent } from './evidence-notification.ts'
import type { EvidenceGmailPorts } from './evidence-gmail.ts'
import { projectEvidenceRows, type EvidenceStoredRows } from './evidence-projections.ts'
import { columnsOf, type Cell, type Column, type Row, type Tab } from './schema.ts'
import { approverForMoment } from './sweep.ts'

const CURSOR = 'SKY_EVIDENCE_INBOX_CURSOR'
const NOTICE = 'SKY_EVIDENCE_NOTICE_'
interface Helpers {
  appendRows<T extends Tab>(sheetId: string, tab: T, records: readonly Row<T>[]): void
  hash(value: string): string
  normalizeWindow(row: Row<'windows'>): Row<'windows'>
  normalizeDate(cell: Cell | undefined): Cell | undefined
  normalizeTime(cell: Cell | undefined): Cell | undefined
}
function target(sheetId: string, tab: Tab): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(tab)
  if (!sheet) throw new Error(`the ${tab} tab is missing; run setup()`)
  return sheet
}
// Group only adjacent allow-listed columns; raw native Date/time cells survive until normalization.
function read<T extends Tab>(sheetId: string, tab: T, wanted: readonly Column<T>[]): Row<T>[] {
  const sheet = target(sheetId, tab),
    count = sheet.getLastRow() - 1
  if (count < 1) return []
  const all: readonly string[] = columnsOf(tab)
  const positions = wanted.map((column) => all.indexOf(column)).sort((a, b) => a - b)
  const records: Row<T>[] = Array.from({ length: count }, () => ({}))
  for (let i = 0; i < positions.length;) {
    const first = positions[i]!
    let end = i + 1
    while (end < positions.length && positions[end] === positions[end - 1]! + 1) end++
    const width = end - i
    const values = sheet.getRange(2, first + 1, count, width).getValues() as Cell[][]
    for (let row = 0; row < count; row++)
      for (let c = 0; c < width; c++) {
        const value = values[row]?.[c] ?? ''
        records[row]![all[first + c] as Column<T>] = value
      }
    i = end
  }
  return records
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function cursorValue(value: string): EvidenceInboxCursor {
  const parsed: unknown = JSON.parse(value)
  if (
    !record(parsed) ||
    !instant(parsed.activatedAt) ||
    !instant(parsed.lowerBound) ||
    (parsed.upperBound !== undefined && !instant(parsed.upperBound)) ||
    (parsed.pageToken !== undefined && typeof parsed.pageToken !== 'string') ||
    (parsed.page !== undefined &&
      (!record(parsed.page) ||
        !Array.isArray(parsed.page.remainingIds) ||
        !parsed.page.remainingIds.every((id) => typeof id === 'string' && id.length > 0) ||
        (parsed.page.nextPageToken !== undefined && typeof parsed.page.nextPageToken !== 'string')))
  )
    throw new Error('evidence_cursor_invalid')
  return parsed as unknown as EvidenceInboxCursor
}
function intentValue(value: string, expectedId?: string): EvidenceNoticeIntent {
  const parsed: unknown = JSON.parse(value)
  if (
    !record(parsed) ||
    typeof parsed.requestId !== 'string' ||
    !parsed.requestId ||
    (expectedId !== undefined && parsed.requestId !== expectedId) ||
    !instant(parsed.routingAt) ||
    typeof parsed.marker !== 'string' ||
    !/^evidence:[a-f0-9]+$/.test(parsed.marker) ||
    (parsed.lastAttemptAt !== undefined && !instant(parsed.lastAttemptAt)) ||
    ['recipient', 'draftId', 'threadId', 'gmailMessageId'].some(
      (key) => parsed[key] !== undefined && (typeof parsed[key] !== 'string' || !parsed[key])
    ) ||
    (parsed.draftCreationAttempted !== undefined && typeof parsed.draftCreationAttempted !== 'boolean')
  )
    throw new Error('evidence_intent_invalid')
  return parsed as unknown as EvidenceNoticeIntent
}
const noticeKey = (id: string) => NOTICE + encodeURIComponent(id)
const props = () => PropertiesService.getScriptProperties()

export function evidenceStoragePorts(
  sheetId: string,
  projectSlug: string,
  helpers: Helpers,
  gmail: EvidenceGmailPorts
): EvidenceInboxPorts {
  let evidenceCache: Row<'evidence'>[] | undefined, notificationCache: Row<'notifications'>[] | undefined
  const evidenceRows = () =>
    (evidenceCache ??= read(sheetId, 'evidence', [
      'request_id',
      'received_at',
      'kind',
      'span_start',
      'span_end',
      'status'
    ]).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, value instanceof Date ? toEvidenceInstant(value) : value])
      )
    ))
  const notifications = () =>
    (notificationCache ??= read(sheetId, 'notifications', ['kind', 'ref', 'gmail_message_id']))
  return {
    ...gmail,
    now: () => new Date(),
    projectSlug: () => projectSlug,
    cursor: () => {
      const value = props().getProperty(CURSOR)
      return value === null ? null : cursorValue(value)
    },
    saveCursor: (cursor) => {
      props().setProperty(CURSOR, JSON.stringify(cursorValue(JSON.stringify(cursor))))
    },
    evidenceRows,
    packRows: () => {
      const ledger = read(sheetId, 'ledger', [
        'entry_id',
        'kind',
        'pack',
        'bundle_id',
        'call_id',
        'window_id or night_id',
        'trigger',
        'source_ref',
        'mode',
        'fired',
        'agrees',
        'snapshot_id',
        'crossing_at',
        'drafted_at',
        'approved_at',
        'sent_at',
        'corrects',
        'recorded_at',
        'hash'
      ])
      const empty: EvidenceStoredRows = {
        readings: [],
        warnings: [],
        forecast: [],
        glossary: [],
        ledger: [],
        grades: [],
        windows: [],
        now: [],
        probation: []
      }
      let ledgerSheet: GoogleAppsScript.Spreadsheet.Sheet | undefined
      for (let n = 0; n < ledger.length; n++) {
        const row = ledger[n]!
        if (row.kind !== 'clause_version') continue
        ledgerSheet ??= target(sheetId, 'ledger')
        const value = ledgerSheet.getRange(n + 2, 21, 1, 1).getValues()[0]?.[0] as Cell | undefined
        const body = projectEvidenceRows({ ...empty, ledger: [{ kind: 'clause_version', body: value }] }).ledger[0]
          ?.body
        if (body) row.body = JSON.stringify(body)
      }
      return {
        readings: read(sheetId, 'readings', [
          'source_kind',
          'source_id',
          'metric',
          'observed_at',
          'received_at',
          'value',
          'unit',
          'revision'
        ]),
        warnings: read(sheetId, 'warnings', [
          'warning_key',
          'issued',
          'title_en',
          'title_bm',
          'valid_from',
          'valid_to',
          'heading_en',
          'text_en',
          'instruction_en',
          'heading_bm',
          'text_bm',
          'instruction_bm',
          'first_seen_at',
          'names_kl'
        ]),
        forecast: read(sheetId, 'forecast', [
          'date',
          'location_id',
          'morning_forecast',
          'afternoon_forecast',
          'night_forecast',
          'summary_forecast',
          'summary_when',
          'min_temp',
          'max_temp',
          'first_seen_at',
          'afternoon_thunderstorm'
        ]).map((row) => ({ ...row, date: helpers.normalizeDate(row.date) })),
        glossary: read(sheetId, 'glossary', columnsOf('glossary')),
        ledger,
        grades: read(sheetId, 'grades', [
          'grade_id',
          'window_id',
          'call_id',
          'proposed_mode',
          'decision',
          'observed_mode',
          'outcome',
          'mode_diff',
          'shadow_fired_no_call',
          'graded_at',
          'clause_version_hash'
        ]),
        windows: read(sheetId, 'windows', [
          'window_id',
          'subscriber_id',
          'kind',
          'date',
          'start_myt',
          'end_myt',
          'language',
          'status',
          'declared_at'
        ]).map(helpers.normalizeWindow),
        now: read(sheetId, 'now', columnsOf('now')),
        probation: read(sheetId, 'probation', ['frame_file_id', 'device_time'])
      }
    },
    appendEvidence: (row) => {
      evidenceCache = undefined
      helpers.appendRows(sheetId, 'evidence', [row])
      SpreadsheetApp.flush()
    },
    unsubscribe: (address, at) => {
      const subscribers = read(sheetId, 'subscribers', ['email', 'unsubscribed_at'])
      let wrote = false
      for (let n = 0; n < subscribers.length; n++) {
        const row = subscribers[n]!
        if (
          typeof row.email === 'string' &&
          row.email.trim().toLowerCase() === address.trim().toLowerCase() &&
          row.unsubscribed_at === ''
        ) {
          target(sheetId, 'subscribers')
            .getRange(n + 2, 6, 1, 1)
            .setValues([[at]])
          wrote = true
        }
      }
      if (wrote) SpreadsheetApp.flush()
    },
    notices: {
      ...gmail,
      now: () => new Date(),
      intent: (requestId) => {
        const value = props().getProperty(noticeKey(requestId))
        return value === null ? null : intentValue(value, requestId)
      },
      saveIntent: (intent) => {
        props().setProperty(
          noticeKey(intent.requestId),
          JSON.stringify(intentValue(JSON.stringify(intent), intent.requestId))
        )
      },
      removeIntent: (requestId) => {
        props().deleteProperty(noticeKey(requestId))
      },
      intents: () => {
        const properties = props()
        return properties
          .getKeys()
          .filter((key) => key.startsWith(NOTICE))
          .map((key) => {
            const value = properties.getProperty(key)
            if (value === null) throw new Error('evidence_intent_missing')
            return intentValue(value, decodeURIComponent(key.slice(NOTICE.length)))
          })
      },
      evidence: (requestId) => evidenceRows().find((row) => row.request_id === requestId) ?? null,
      notification: (requestId) =>
        notifications().find(
          (row) => row.kind === 'evidence_request' && row.ref === requestId && row.gmail_message_id
        ) ?? null,
      dutyAt: (at) => {
        const rota = read(sheetId, 'rota', ['date', 'start', 'end', 'email']).map((row) => ({
          ...row,
          date: helpers.normalizeDate(row.date),
          start: helpers.normalizeTime(row.start),
          end: helpers.normalizeTime(row.end)
        }))
        const duty = approverForMoment(rota, at)
        return typeof duty?.email === 'string' && duty.email.trim() ? duty.email.trim() : null
      },
      hashId: helpers.hash,
      workbookReference: () => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}`,
      appendNotification: (row) => {
        notificationCache = undefined
        helpers.appendRows(sheetId, 'notifications', [row])
        SpreadsheetApp.flush()
      }
    }
  }
}
