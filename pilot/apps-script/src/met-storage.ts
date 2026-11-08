import { decodeMetReceipt, type MetPollPorts, type MetRawBody } from './met.ts'
import { validateMetWarningRow, type MetKind } from './met-parser.ts'
import { columnsOf, type Row } from './schema.ts'

export interface MetNativeHelpers {
  read: typeof import('./gas.ts').readColumns
  append: typeof import('./gas.ts').appendRows
  newPollId(): string
  normalizeDate: typeof import('./tick.ts').normalizeDateCell
}
const KEYS = {
  warning: 'SKY_MET_RECEIPT_WARNING_V1',
  forecast: 'SKY_MET_RECEIPT_FORECAST_V1'
} as const
const signed = (bytes: number[]) => bytes.map((byte) => (byte > 127 ? byte - 256 : byte))
const unsigned = (bytes: number[]) => bytes.map((byte) => byte & 255)
// Google decoding may replace malformed UTF-8. Accept text only if re-encoding is byte-identical.
function rawBody(nativeBytes: number[]): MetRawBody {
  const bytes = unsigned(nativeBytes)
  let text: string
  try {
    text = Utilities.newBlob(signed(bytes)).getDataAsString('UTF-8')
  } catch {
    return { bytes, text: null }
  }
  const encoded = unsigned(Utilities.newBlob(text).getBytes())
  return { bytes, text: encoded.length === bytes.length && encoded.every((byte, i) => byte === bytes[i]) ? text : null }
}
function present(row: object): boolean {
  return Object.values(row).some((value) => value !== '')
}
export function metStoragePorts(
  sheetId: string,
  rawFolderId: string,
  helpers: MetNativeHelpers,
  evaluate: () => void
): MetPollPorts {
  if (!sheetId.trim()) throw new Error('SHEET_ID is not set; run setup()')
  if (!rawFolderId.trim()) throw new Error('RAW_FOLDER_ID is not set; run setup()')
  // Resolve only on an archive operation. Reads never create a missing folder.
  function archiveFolder(create: boolean): GoogleAppsScript.Drive.Folder {
    const root = DriveApp.getFolderById(rawFolderId)
    const children = root.getFoldersByName('met')
    let found: GoogleAppsScript.Drive.Folder | undefined
    while (children.hasNext()) {
      const child = children.next()
      if (child.isTrashed()) continue
      if (found) throw new Error('MET storage: ambiguous met archive folders')
      found = child
    }
    if (found) return found
    if (create) return root.createFolder('met')
    throw new Error('MET storage: missing met archive folder')
  }
  const props = () => PropertiesService.getScriptProperties()
  return {
    now: () => new Date(),
    newPollId: helpers.newPollId,
    fetch: (url) => {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: false,
        headers: { 'Accept-Encoding': 'identity' }
      })
      return { status: response.getResponseCode(), ...rawBody(response.getContent()) }
    },
    readSources: () =>
      helpers
        .read(sheetId, 'sources', [
          'source_id',
          'kind',
          'name',
          'cadence_min',
          'stale_after_min',
          'freshness',
          'licence',
          'url'
        ])
        .filter(present),
    appendSources: (rows) => {
      helpers.append(sheetId, 'sources', rows)
      SpreadsheetApp.flush()
    },
    readGlossary: () => helpers.read(sheetId, 'glossary', columnsOf('glossary')).filter(present),
    appendGlossary: (rows) => {
      helpers.append(sheetId, 'glossary', rows)
      SpreadsheetApp.flush()
    },
    readWarnings: () =>
      helpers
        .read(sheetId, 'warnings', columnsOf('warnings'))
        .map((row, i) => ({ rowNumber: i + 2, row }))
        .filter(({ row }) => present(row)),
    appendWarnings: (rows) => {
      for (const row of rows) {
        const problems = validateMetWarningRow(row)
        if (problems.length) throw new Error(`Invalid MET warning row: ${problems.join('; ')}`)
      }
      helpers.append(sheetId, 'warnings', rows)
    },
    updateLastSeen: (rowNumber, at) => {
      const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('warnings')
      if (!sheet) throw new Error('the warnings tab is missing; run setup()')
      sheet.getRange(rowNumber, columnsOf('warnings').indexOf('last_seen_at') + 1, 1, 1).setValues([[at]])
    },
    readForecast: () =>
      helpers
        .read(sheetId, 'forecast', columnsOf('forecast'))
        .filter(present)
        .map((row) => ({ ...row, date: helpers.normalizeDate(row.date) ?? '' })),
    appendForecast: (rows) => helpers.append(sheetId, 'forecast', rows),
    readPolls: () => helpers.read(sheetId, 'polls', columnsOf('polls')).filter(present),
    appendPoll: (row: Row<'polls'>) => {
      helpers.append(sheetId, 'polls', [row])
      // Receipt clear must follow persistence of both feed/touch writes and their poll.
      SpreadsheetApp.flush()
    },
    readRaw: (fileId) => {
      const files = archiveFolder(false).getFiles()
      while (files.hasNext()) {
        const file = files.next()
        if (file.getId() === fileId && !file.isTrashed()) return rawBody(file.getBlob().getBytes())
      }
      throw new Error('MET storage: missing raw archive')
    },
    createRaw: (name, bytes) =>
      archiveFolder(true)
        .createFile(Utilities.newBlob(signed(bytes), 'application/json', name))
        .getId(),
    hashBytes: (bytes) =>
      unsigned(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed(bytes)))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(''),
    readPending: (kind: MetKind) => decodeMetReceipt(props().getProperty(KEYS[kind]), kind),
    savePending: (kind, receipt) => {
      const decoded = decodeMetReceipt(JSON.stringify(receipt), kind)
      props().setProperty(KEYS[kind], JSON.stringify(decoded))
    },
    clearPending: (kind) => {
      props().deleteProperty(KEYS[kind])
    },
    evaluate
  }
}
