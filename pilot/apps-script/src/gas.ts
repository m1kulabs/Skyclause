// Apps Script adapters for the ports the pure modules take. Tests use doubles instead of these.
import { toMytIso } from '../../shared/time.ts'
import type { CrowdTickStore } from './crowd-tick.ts'
import type { HistoryBuildRow } from './crowd-history.ts'
import type { ClausesPort } from './setup.ts'
import type { SourceStateUpdate } from './indicators.ts'
import type { CameraDrive, CameraFrameStore, RetentionStore } from './camera.ts'
import {
  OPTIN_TITLES,
  REJECT_COLUMN,
  type OptinFieldSpec,
  type OptinStores,
  type WindowFormPort
} from './optin-form.ts'
import type { LabelSlot, ProbationLabel, ProbationRow } from '../../shared/probation.ts'
import type { JpsHttpResponse } from './jps.ts'
import type { LabelStore } from './label.ts'
import type { PiRowsStore } from './pi-rows.ts'
import type { RawFile, SentMessage, SweepPorts } from './sweep.ts'
import type { GetProperty } from './properties.ts'
import { validateReading } from './readings.ts'
import { columnsOf, toRow, type Cell, type Column, type Row, type Tab } from './schema.ts'
import type { DrivePort, PropertyPort, WorkbookPort } from './setup.ts'
import { normalizeDateCell, normalizeWindowRow, type SkyEvaluationStore, type SkyEvaluationTab } from './tick.ts'
import type { InstalledTrigger, TriggerPort } from './triggers.ts'

const LOCK_WAIT_MS = 30_000

// Windows columns A–I only; column J (`title`) is private and never read by evaluation.
export const WINDOWS_PUBLIC_COLUMNS = [
  'window_id',
  'subscriber_id',
  'kind',
  'date',
  'start_myt',
  'end_myt',
  'language',
  'status',
  'declared_at'
] as const satisfies readonly Column<'windows'>[]

export const properties: PropertyPort = {
  get: (name) => PropertiesService.getScriptProperties().getProperty(name),
  set: (name, value) => void PropertiesService.getScriptProperties().setProperty(name, value)
}

export const getProperty: GetProperty = (name) => properties.get(name)

export function withLock<T>(fn: () => T): T {
  const lock = LockService.getScriptLock()
  lock.waitLock(LOCK_WAIT_MS)
  try {
    return fn()
  } finally {
    lock.releaseLock()
  }
}

export function fetchUrl(url: string): JpsHttpResponse {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true })
  return {
    status: response.getResponseCode(),
    body: response.getContentText()
  }
}

// The first item that isn't in the trash and passes `keep`.
function firstLive<T extends { isTrashed(): boolean }>(
  items: { hasNext(): boolean; next(): T },
  keep: (item: T) => boolean = () => true
): T | null {
  while (items.hasNext()) {
    const item = items.next()
    if (!item.isTrashed() && keep(item)) return item
  }
  return null
}

export const drive: DrivePort = {
  findRootFolder: (name) => firstLive(DriveApp.getRootFolder().getFoldersByName(name))?.getId() ?? null,
  createRootFolder: (name) => DriveApp.getRootFolder().createFolder(name).getId(),
  findFolder: (parentId, name) => firstLive(DriveApp.getFolderById(parentId).getFoldersByName(name))?.getId() ?? null,
  createFolder: (parentId, name) => DriveApp.getFolderById(parentId).createFolder(name).getId(),
  findSpreadsheet: (folderId, name) =>
    firstLive(
      DriveApp.getFolderById(folderId).getFilesByName(name),
      (file) =>
        // The camera page needs the DOM lib, whose global MimeType hides the GAS enum; reach it by type.
        file.getMimeType() === (MimeType as unknown as GoogleAppsScript.Base.MimeType).GOOGLE_SHEETS
    )?.getId() ?? null,
  createSpreadsheet: (folderId, name, firstTab) => {
    const spreadsheet = SpreadsheetApp.create(name)
    spreadsheet.getSheets()[0]?.setName(firstTab)
    DriveApp.getFileById(spreadsheet.getId()).moveTo(DriveApp.getFolderById(folderId))
    return spreadsheet.getId()
  }
}

function sheet(spreadsheetId: string, tab: string): GoogleAppsScript.Spreadsheet.Sheet {
  const found = SpreadsheetApp.openById(spreadsheetId).getSheetByName(tab)
  if (!found) throw new Error(`the ${tab} tab is missing; run setup()`)
  return found
}

export const workbooks: WorkbookPort = {
  tabNames: (spreadsheetId) =>
    SpreadsheetApp.openById(spreadsheetId)
      .getSheets()
      .map((tab) => tab.getName()),
  addTab: (spreadsheetId, name) => {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId)
    spreadsheet.insertSheet(name, spreadsheet.getNumSheets())
  },
  header: (spreadsheetId, tab) => {
    const target = sheet(spreadsheetId, tab)
    const width = target.getLastColumn()
    if (width === 0) return []
    const row = target.getRange(1, 1, 1, width).getValues()[0] ?? []
    const header = row.map(String)
    while (header.length > 0 && header[header.length - 1] === '') header.pop()
    return header
  },
  writeHeader: (spreadsheetId, tab, columns) => {
    sheet(spreadsheetId, tab)
      .getRange(1, 1, 1, columns.length)
      .setValues([[...columns]])
  }
}

// The data rows of a tab, read only for the named columns, by their schema position.
export function readColumns<T extends Tab, C extends Column<T>>(
  spreadsheetId: string,
  tab: T,
  wanted: readonly C[]
): Record<C, Cell>[] {
  const target = sheet(spreadsheetId, tab)
  const rows = target.getLastRow() - 1
  if (rows < 1) return []
  const all: readonly string[] = columnsOf(tab)
  const values = wanted.map((column) => target.getRange(2, all.indexOf(column) + 1, rows, 1).getValues())
  return Array.from(
    { length: rows },
    (_, row) =>
      Object.fromEntries(
        wanted.map((column, n) => {
          const cell = values[n]?.[row]?.[0] ?? ''
          return [column, cell instanceof Date ? toMytIso(cell) : cell]
        })
      ) as Record<C, Cell>
  )
}

export function appendRows<T extends Tab>(spreadsheetId: string, tab: T, records: readonly Row<T>[]): void {
  if (records.length === 0) return
  const rows = records.map((record) => toRow(tab, record))
  const target = sheet(spreadsheetId, tab)
  const startRow = target.getLastRow() + 1
  target.getRange(startRow, 1, rows.length, columnsOf(tab).length).setValues(rows)
}

export function appendReadings(spreadsheetId: string, records: readonly Row<'readings'>[]): void {
  for (const record of records) {
    const problems = validateReading(record)
    if (problems.length > 0) {
      throw new Error(`Invalid reading row: ${problems.join('; ')}`)
    }
  }
  appendRows(spreadsheetId, 'readings', records)
}

function replaceTabRows<T extends Tab>(spreadsheetId: string, tab: T, records: readonly Row<T>[]): void {
  const target = sheet(spreadsheetId, tab)
  const width = columnsOf(tab).length
  const previousDataRows = Math.max(0, target.getLastRow() - 1)
  const rows = records.map((record) => toRow(tab, record))
  if (rows.length > 0) {
    target.getRange(2, 1, rows.length, width).setValues(rows)
  }
  if (previousDataRows > rows.length) {
    const staleStartRow = 2 + rows.length
    const staleRowCount = previousDataRows - rows.length
    const staleRange = target.getRange(staleStartRow, 1, staleRowCount, width)
    if (typeof staleRange.clearContent === 'function') {
      staleRange.clearContent()
    } else {
      const blankRow = Array.from({ length: width }, () => '')
      staleRange.setValues(Array.from({ length: staleRowCount }, () => [...blankRow]))
    }
  }
}

function replaceNowRows(spreadsheetId: string, records: readonly Row<'now'>[]): void {
  replaceTabRows(spreadsheetId, 'now', records)
}

function updateStoredSourceStates(spreadsheetId: string, updates: readonly SourceStateUpdate[]): void {
  if (updates.length === 0) return
  const target = sheet(spreadsheetId, 'sources')
  const rows = target.getLastRow() - 1
  if (rows < 1) return
  const all: readonly string[] = columnsOf('sources')
  const sourceIdCol = all.indexOf('source_id') + 1
  const stateCol = all.indexOf('state') + 1
  const stateSinceCol = all.indexOf('state_since') + 1
  const ids = target.getRange(2, sourceIdCol, rows, 1).getValues()

  const rowBySourceId = new Map<string, number>()
  for (let i = 0; i < rows; i++) {
    const id = String(ids[i]?.[0] ?? '')
    if (id && !rowBySourceId.has(id)) {
      rowBySourceId.set(id, i + 2)
    }
  }

  for (const update of updates) {
    if (typeof update.source_id !== 'string' || !update.source_id) continue
    const sheetRow = rowBySourceId.get(update.source_id)
    if (sheetRow === undefined) continue
    const stateVal = update.state ?? ''
    const stateSinceVal = update.state_since ?? ''
    if (stateSinceCol === stateCol + 1) {
      target.getRange(sheetRow, stateCol, 1, 2).setValues([[stateVal, stateSinceVal]])
    } else {
      target.getRange(sheetRow, stateCol, 1, 1).setValues([[stateVal]])
      target.getRange(sheetRow, stateSinceCol, 1, 1).setValues([[stateSinceVal]])
    }
  }
}

export function skyEvaluationStore(spreadsheetId: string): SkyEvaluationStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    readRows<T extends SkyEvaluationTab>(tab: T): Row<T>[] {
      switch (tab) {
        case 'windows':
          return readColumns(spreadsheetId, 'windows', WINDOWS_PUBLIC_COLUMNS).map(normalizeWindowRow) as Row<T>[]
        case 'forecast':
          return readColumns(spreadsheetId, 'forecast', columnsOf('forecast')).map((row) => ({
            ...row,
            date: normalizeDateCell(row.date) ?? ''
          })) as Row<T>[]
        case 'sources':
        case 'readings':
        case 'polls':
        case 'warnings':
        case 'indicators':
          return readColumns(spreadsheetId, tab, columnsOf(tab)) as Row<T>[]
        default: {
          const exhaustive: never = tab
          throw new Error(`Unsupported Sky evaluation tab: ${String(exhaustive)}`)
        }
      }
    },
    appendIndicators: (rows) => appendRows(spreadsheetId, 'indicators', rows),
    replaceNow: (rows) => replaceNowRows(spreadsheetId, rows),
    updateSourceStates: (updates) => updateStoredSourceStates(spreadsheetId, updates)
  }
}

function kindOf(trigger: GoogleAppsScript.Script.Trigger): InstalledTrigger['kind'] {
  switch (trigger.getEventType()) {
    case ScriptApp.EventType.CLOCK:
      return 'time'
    case ScriptApp.EventType.ON_FORM_SUBMIT:
      return 'on_form_submit'
    case ScriptApp.EventType.ON_EDIT:
      return 'on_edit'
    default:
      return 'other'
  }
}

export const triggers: TriggerPort = {
  list: () =>
    ScriptApp.getProjectTriggers().map((trigger) => ({
      id: trigger.getUniqueId(),
      handler: trigger.getHandlerFunction(),
      kind: kindOf(trigger),
      sourceId: trigger.getTriggerSourceId() || null
    })),
  createTime: (handler, every) => {
    const builder = ScriptApp.newTrigger(handler).timeBased()
    if ('minutes' in every) builder.everyMinutes(every.minutes)
    else if ('hours' in every) builder.everyHours(every.hours)
    else builder.atHour(every.atHour).nearMinute(every.nearMinute).everyDays(1).inTimezone('Asia/Kuala_Lumpur')
    builder.create()
  },
  createSpreadsheet: (handler, kind, spreadsheetId) => {
    const builder = ScriptApp.newTrigger(handler).forSpreadsheet(spreadsheetId)
    if (kind === 'on_form_submit') builder.onFormSubmit().create()
    else builder.onEdit().create()
  },
  remove: (id) => {
    const trigger = ScriptApp.getProjectTriggers().find((candidate) => candidate.getUniqueId() === id)
    if (trigger) ScriptApp.deleteTrigger(trigger)
  }
}

// The sheet rows the `pi_rows` handler reads and writes, through `SHEET_ID`.
export function piRowsStore(spreadsheetId: string): PiRowsStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    sourceRow: (sourceId) =>
      readColumns(spreadsheetId, 'sources', columnsOf('sources')).find((row) => row.source_id === sourceId) ?? null,
    appendSource: (row) => appendTabRow(spreadsheetId, 'sources', row),
    storedReadings: () => readColumns(spreadsheetId, 'readings', ['reading_id', 'observed_at', 'value', 'revision']),
    appendPoll: (row) => appendTabRow(spreadsheetId, 'polls', row),
    appendReadings: (rows) => appendTabRows(spreadsheetId, 'readings', rows)
  }
}

function appendTabRow<T extends Tab>(spreadsheetId: string, tab: T, row: Row<T>): void {
  appendTabRows(spreadsheetId, tab, [row])
}
function appendTabRows<T extends Tab>(spreadsheetId: string, tab: T, rows: Row<T>[]): void {
  const target = sheet(spreadsheetId, tab)
  target
    .getRange(target.getLastRow() + 1, 1, rows.length, columnsOf(tab).length)
    .setValues(rows.map((row) => toRow(tab, row)))
}

// The first data row whose match column holds the value, as a 1-based sheet row.
function findSheetRow(spreadsheetId: string, tab: Tab, matchColumn: string, value: Cell): number | null {
  const columns: readonly string[] = columnsOf(tab)
  const target = sheet(spreadsheetId, tab)
  const rows = target.getLastRow() - 1
  if (rows < 1) return null
  const cells = target.getRange(2, columns.indexOf(matchColumn) + 1, rows, 1).getValues()
  for (let index = 0; index < rows; index++) {
    if (String(cells[index]?.[0] ?? '') === String(value)) return index + 2
  }
  return null
}

function setSheetCell(
  spreadsheetId: string,
  tab: Tab,
  matchColumn: string,
  matchValue: Cell,
  setColumn: string,
  setValue: Cell
): void {
  const found = findSheetRow(spreadsheetId, tab, matchColumn, matchValue)
  if (found === null) return
  sheet(spreadsheetId, tab)
    .getRange(found, (columnsOf(tab) as readonly string[]).indexOf(setColumn) + 1)
    .setValue(setValue)
}

// The sheet rows the `camera_frame` handler reads and writes, through `SHEET_ID`.
export function cameraFrameStore(spreadsheetId: string): CameraFrameStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    sourceRow: (sourceId) =>
      readColumns(spreadsheetId, 'sources', columnsOf('sources')).find((row) => row.source_id === sourceId) ?? null,
    appendSource: (row) => appendTabRow(spreadsheetId, 'sources', row),
    updateSourceDistance: (sourceId, distanceKm) =>
      setSheetCell(spreadsheetId, 'sources', 'source_id', sourceId, 'distance_km', distanceKm),
    deviceRow: (deviceId) =>
      readColumns(spreadsheetId, 'devices', columnsOf('devices')).find((row) => row.device_id === deviceId) ?? null,
    appendDevice: (row) => appendTabRow(spreadsheetId, 'devices', row),
    touchDevice: (deviceId, receivedAt) =>
      setSheetCell(spreadsheetId, 'devices', 'device_id', deviceId, 'last_row_at', receivedAt),
    knownCapture: (captureId) =>
      readColumns(spreadsheetId, 'probation', ['capture_id']).some((row) => row.capture_id === captureId),
    appendPoll: (row) => appendTabRow(spreadsheetId, 'polls', row),
    appendReadings: (rows) => appendTabRows(spreadsheetId, 'readings', rows),
    appendProbation: (row) => appendTabRow(spreadsheetId, 'probation', row)
  }
}

// The Drive folders and files the camera handler and the retention job need.
export const cameraDrive: CameraDrive = {
  saveFrame: (framesRootId, day, captureId, jpegB64) => {
    if (!framesRootId) throw new Error('FRAMES_FOLDER_ID is not set; run setup()')
    const root = DriveApp.getFolderById(framesRootId)
    const dayFolder = firstLive(root.getFoldersByName(day)) ?? root.createFolder(day)
    return dayFolder
      .createFile(Utilities.newBlob(Utilities.base64Decode(jpegB64), 'image/jpeg', `${captureId}.jpg`))
      .getId()
  },
  dayFolders: (framesRootId) => {
    if (!framesRootId) throw new Error('FRAMES_FOLDER_ID is not set; run setup()')
    const folders = DriveApp.getFolderById(framesRootId).getFolders()
    const out: { id: string; name: string }[] = []
    while (folders.hasNext()) {
      const folder = folders.next()
      if (!folder.isTrashed()) out.push({ id: folder.getId(), name: folder.getName() })
    }
    return out
  },
  folderFiles: (folderId) => {
    const files = DriveApp.getFolderById(folderId).getFiles()
    const out: { id: string }[] = []
    while (files.hasNext()) {
      const file = files.next()
      if (!file.isTrashed()) out.push({ id: file.getId() })
    }
    return out
  },
  trashFile: (fileId) => void DriveApp.getFileById(fileId).setTrashed(true),
  trashFolder: (folderId) => void DriveApp.getFolderById(folderId).setTrashed(true)
}

// The probation rows and frame folders the retention job reads, through `SHEET_ID`.
export function cameraRetentionStore(spreadsheetId: string): RetentionStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  const framesRootId = getProperty('FRAMES_FOLDER_ID') ?? ''
  return {
    probationFrames: () => readColumns(spreadsheetId, 'probation', ['frame_file_id', 'device_time']),
    dayFolders: () => cameraDrive.dayFolders(framesRootId),
    folderFiles: (folderId) => cameraDrive.folderFiles(folderId),
    trashFile: (fileId) => cameraDrive.trashFile(fileId),
    trashFolder: (folderId) => cameraDrive.trashFolder(folderId)
  }
}
// The rows the WIN-1 submit handler reads and writes: `windows` and `subscribers` through `SHEET_ID`, and the
// reject reason through the response sheet's first tab.
export function optinStores(sheetId: string, responsesSheetId: string): OptinStores {
  if (!sheetId) throw new Error('SHEET_ID is not set; run setup()')
  if (!responsesSheetId) throw new Error('RESPONSES_SHEET_ID is not set; run createWindowForm()')
  return {
    windowIds: () => readColumns(sheetId, 'windows', ['window_id']).map((row) => String(row.window_id)),
    subscriberIds: () => readColumns(sheetId, 'subscribers', ['subscriber_id']).map((row) => String(row.subscriber_id)),
    subscriberByEmail: (email) =>
      readColumns(sheetId, 'subscribers', columnsOf('subscribers')).find(
        (row) => String(row.email).toLowerCase() === email
      ) ?? null,
    appendWindow: (row) => appendRows(sheetId, 'windows', [row]),
    appendSubscriber: (row) => appendRows(sheetId, 'subscribers', [row]),
    updateSubscriber: (email, patch) => {
      const target = sheet(sheetId, 'subscribers')
      const emails = target.getRange(2, columnsOf('subscribers').indexOf('email') + 1, target.getLastRow() - 1, 1)
      const values = emails.getValues()
      const index = values.findIndex((cell) => String(cell[0]).toLowerCase() === email)
      if (index === -1) throw new Error(`subscriber ${email} is missing from subscribers`)
      const columns = columnsOf('subscribers')
      const updates: Partial<Record<Column<'subscribers'>, Cell>> = { ...patch }
      for (const [column, value] of Object.entries(updates)) {
        target.getRange(index + 2, columns.indexOf(column as Column<'subscribers'>) + 1).setValue(value ?? '')
      }
    },
    writeReject: (rowNumber, reason) => {
      const target = SpreadsheetApp.openById(responsesSheetId).getSheets()[0]
      if (!target) throw new Error('the response spreadsheet has no tabs; run createWindowForm()')
      const width = target.getLastColumn()
      const header = target.getRange(1, 1, 1, width).getValues()[0]?.map(String) ?? []
      let column = header.indexOf(REJECT_COLUMN) + 1
      if (column === 0) {
        column = width + 1
        target.getRange(1, column).setValue(REJECT_COLUMN)
      }
      target.getRange(rowNumber, column).setValue(reason)
    }
  }
}

function addOptinField(form: GoogleAppsScript.Forms.Form, field: OptinFieldSpec): void {
  switch (field.item) {
    case 'text': {
      const item = form.addTextItem().setTitle(field.title).setRequired(field.required)
      if (field.help) item.setHelpText(field.help)
      if (field.email) item.setValidation(FormApp.createTextValidation().requireTextIsEmail().build())
      break
    }
    case 'choice': {
      const item = form.addMultipleChoiceItem().setTitle(field.title).setRequired(field.required)
      item.setChoices(field.choices.map((label) => item.createChoice(label)))
      if (field.help) item.setHelpText(field.help)
      break
    }
    case 'date': {
      const item = form.addDateItem().setTitle(field.title).setRequired(field.required)
      if (field.help) item.setHelpText(field.help)
      break
    }
    case 'time': {
      const item = form.addTimeItem().setTitle(field.title).setRequired(field.required)
      if (field.help) item.setHelpText(field.help)
      break
    }
    case 'section':
      form.addSectionHeaderItem().setTitle(field.title).setHelpText(field.description)
      break
    case 'checkbox': {
      const item = form.addCheckboxItem().setTitle(field.title).setRequired(field.required)
      item.setChoices(field.choices.map((label) => item.createChoice(label)))
      if (field.help) item.setHelpText(field.help)
      break
    }
  }
}

// The WIN-1 form through FormApp: anyone with the link answers with no sign-in, into the responses workbook.
export function windowFormPort(responsesSheetId: string): WindowFormPort {
  if (!responsesSheetId) throw new Error('RESPONSES_SHEET_ID is not set; run createWindowForm()')
  return {
    linkedForm: () => {
      const url = SpreadsheetApp.openById(responsesSheetId).getFormUrl()
      if (!url) return null
      const form = FormApp.openByUrl(url)
      return { id: form.getId(), publishedUrl: form.getPublishedUrl() }
    },
    createForm: (title, description, fields) => {
      const form = FormApp.create(title)
      form.setDescription(description)
      for (const field of fields) addOptinField(form, field)
      // Email is a text question with validation, not Forms' collect-email setting, so nobody signs in.
      form.setCollectEmail(false)
      form.setRequireLogin(false)
      form.setLimitOneResponsePerUser(false)
      form.setDestination(FormApp.DestinationType.SPREADSHEET, responsesSheetId)
      return { id: form.getId(), publishedUrl: form.getPublishedUrl() }
    },
    ensureRejectColumn: () => {
      const target = SpreadsheetApp.openById(responsesSheetId).getSheets()[0]
      if (!target) throw new Error('the response spreadsheet has no tabs; run createWindowForm()')
      const width = target.getLastColumn()
      if (width === 0) {
        target.getRange(1, 1).setValue(REJECT_COLUMN)
        return
      }
      const header = target.getRange(1, 1, 1, width).getValues()[0]?.map(String) ?? []
      if (!header.includes(REJECT_COLUMN)) target.getRange(1, width + 1).setValue(REJECT_COLUMN)
    }
  }
}

// One answer per question title for a submitted response row. It reads the cells, not `namedValues`, because
// `namedValues` formats dates and times by the response sheet's locale ("11/7/2026", "1:30:00 PM"); the cells hold
// Dates, formatted here in the sheet's time zone as `yyyy-MM-dd` and `HH:mm`.
export function formAnswers(range: GoogleAppsScript.Spreadsheet.Range): Record<string, string> {
  const target = range.getSheet()
  const zone = target.getParent().getSpreadsheetTimeZone()
  const width = target.getLastColumn()
  const header = target.getRange(1, 1, 1, width).getValues()[0] ?? []
  const cells = target.getRange(range.getRow(), 1, 1, width).getValues()[0] ?? []
  const values: Record<string, string> = {}
  header.forEach((title, index) => {
    const cell: unknown = cells[index]
    const name = String(title)
    if (cell instanceof Date) {
      const pattern = name === OPTIN_TITLES.date ? 'yyyy-MM-dd' : 'HH:mm'
      values[name] = Utilities.formatDate(cell, zone, pattern)
    } else values[name] = String(cell ?? '')
  })
  return values
}
// The sheet number (1-based) of the first data row whose column holds the value, or -1.
function findRowNumber(spreadsheetId: string, tab: Tab, column: string, value: string): number {
  const target = sheet(spreadsheetId, tab)
  const rows = target.getLastRow() - 1
  if (rows < 1) return -1
  const index = columnsOf(tab).indexOf(column as never) + 1
  const values = target.getRange(2, index, rows, 1).getValues()
  for (let n = 0; n < values.length; n++) {
    if (String(values[n]?.[0] ?? '') === value) return n + 2
  }
  return -1
}

function setCell(spreadsheetId: string, tab: Tab, rowNumber: number, column: string, value: Cell): void {
  const index = columnsOf(tab).indexOf(column as never) + 1
  sheet(spreadsheetId, tab).getRange(rowNumber, index).setValue(value)
}

// The `label` page's sheet reads and writes, through `SHEET_ID`. Labels go into the
// existing `probation` rows, since that tab isn't append-only.
export function labelStore(spreadsheetId: string): LabelStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  const probationNumber = (captureId: string): number => {
    const found = findRowNumber(spreadsheetId, 'probation', 'capture_id', captureId)
    if (found < 0) throw new Error(`no probation row for capture ${captureId}`)
    return found
  }
  // The camera's `sources` row, by the #59 ingest kind; null until ingest creates it.
  const cameraNumber = (): number | null => {
    const target = sheet(spreadsheetId, 'sources')
    const rows = target.getLastRow() - 1
    if (rows < 1) return null
    const kind = columnsOf('sources').indexOf('kind') + 1
    const kinds = target.getRange(2, kind, rows, 1).getValues()
    for (let n = 0; n < kinds.length; n++) {
      if (String(kinds[n]?.[0] ?? '') === 'camera') return n + 2
    }
    return null
  }
  return {
    probationRows: () =>
      readColumns(spreadsheetId, 'probation', [...columnsOf('probation')]).map((row) => ({
        capture_id: String(row.capture_id),
        frame_file_id: String(row.frame_file_id),
        device_time: String(row.device_time),
        phone_flag: String(row.phone_flag),
        label_a: String(row.label_a),
        label_b: String(row.label_b),
        settled: String(row.settled),
        agrees: row.agrees
      })) satisfies ProbationRow[],
    writeLabel: (captureId: string, slot: LabelSlot, label: ProbationLabel): void => {
      setCell(spreadsheetId, 'probation', probationNumber(captureId), slot === 'a' ? 'label_a' : 'label_b', label)
    },
    writeSettlement: (captureId: string, settled: ProbationLabel, agrees: boolean): void => {
      const rowNumber = probationNumber(captureId)
      setCell(spreadsheetId, 'probation', rowNumber, 'settled', settled)
      setCell(spreadsheetId, 'probation', rowNumber, 'agrees', agrees)
    },
    frameDataUrl: (fileId: string): string | null => {
      try {
        const blob = DriveApp.getFileById(fileId).getBlob()
        const mime = blob.getContentType() ?? ''
        if (!mime.startsWith('image/')) return null
        return `data:${mime};base64,${Utilities.base64Encode(blob.getBytes())}`
      } catch {
        return null
      }
    },
    writeFigures: (n: number, agreement: number | null): void => {
      const rowNumber = cameraNumber()
      if (rowNumber === null) return
      setCell(spreadsheetId, 'sources', rowNumber, 'probation_n', n)
      setCell(spreadsheetId, 'sources', rowNumber, 'probation_agreement', agreement ?? '')
    },
    recordVerdict: (note: string, passed: boolean, n: number, agreement: number | null): void => {
      const rowNumber = cameraNumber()
      if (rowNumber === null) return
      setCell(spreadsheetId, 'sources', rowNumber, 'probation', !passed)
      setCell(spreadsheetId, 'sources', rowNumber, 'probation_n', n)
      setCell(spreadsheetId, 'sources', rowNumber, 'probation_agreement', agreement ?? '')
      const index = columnsOf('sources').indexOf('probation') + 1
      sheet(spreadsheetId, 'sources').getRange(rowNumber, index).setNote(note)
    }
  }
}

// --- Crowd (#69) adapters: the forecast tick, the one-off history build and setup's clause defaults. ---

// The response body of a MediaWiki API call; a non-2xx is an error, never a silent empty history.
export function fetchWikiText(url: string): string {
  const response = fetchUrl(url)
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`MediaWiki request failed with HTTP ${response.status}`)
  }
  return response.body
}

export function crowdForecastStore(spreadsheetId: string): CrowdTickStore {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  const folderId = getProperty('CROSSINGS_CROWD_FOLDER_ID')
  return {
    readReadings: () =>
      readColumns(spreadsheetId, 'readings', [
        'reading_id',
        'source_kind',
        'source_id',
        'metric',
        'observed_at',
        'received_at',
        'value',
        'revision'
      ]),
    readPolls: () => readColumns(spreadsheetId, 'polls', ['source_id', 'outcome', 'received_at']),
    readHistory: () => readColumns(spreadsheetId, 'history', columnsOf('history')),
    readListings: () => readColumns(spreadsheetId, 'listings', columnsOf('listings')),
    readForecasts: () => readColumns(spreadsheetId, 'forecasts', columnsOf('forecasts')),
    readClauses: () => readColumns(spreadsheetId, 'clauses', ['pack', 'key', 'threshold', 'op', 'enabled', 'Proposes']),
    appendForecast: (row) => appendRows(spreadsheetId, 'forecasts', [row]),
    replaceCrowdShadow: (rows) => replaceTabRows(spreadsheetId, 'crowd_shadow', rows),
    crowdFiles: () => listFiles(folderId),
    writeCrowdFile: (name, text) => {
      if (!folderId) throw new Error('CROSSINGS_CROWD_FOLDER_ID is not set; run setup()')
      DriveApp.getFolderById(folderId).createFile(name, text, 'application/json')
    }
  }
}

// The `history` rows the one-off build reads and writes, through `SHEET_ID`.
export function crowdHistoryStore(spreadsheetId: string): {
  readHistory(): { night_date: Cell; venue: Cell; show: Cell }[]
  appendHistory(rows: HistoryBuildRow[]): void
} {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    readHistory: () => readColumns(spreadsheetId, 'history', ['night_date', 'venue', 'show']),
    appendHistory: (rows) => appendRows(spreadsheetId, 'history', rows)
  }
}

// The `clauses` tab for setup's Crowd defaults: existing packs, then the six rows.
export function setupClausesStore(spreadsheetId: string): ClausesPort {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    packs: () => readColumns(spreadsheetId, 'clauses', ['pack']).map((row) => String(row.pack ?? '')),
    append: (rows) => appendRows(spreadsheetId, 'clauses', rows)
  }
}

// --- Sweep (#62) adapters: the pure runSweep ports, built from SHEET_ID and the Script Properties. ---

const SWEEP_SENT_QUERY = 'in:sent newer_than:2d'
const SWEEP_SENT_MAX = 100

export function sha256HexDigest(text: string): string {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
  return bytes.map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, '0')).join('')
}

function listFiles(folderId: string | null): RawFile[] {
  if (!folderId) return []
  const out: RawFile[] = []
  const files = DriveApp.getFolderById(folderId).getFiles()
  while (files.hasNext()) {
    const file = files.next()
    if (file.isTrashed()) continue
    out.push({ id: file.getId(), name: file.getName(), text: file.getBlob().getDataAsString() })
  }
  return out
}

function sweepSent(): SentMessage[] {
  const out: SentMessage[] = []
  const threads = GmailApp.search(SWEEP_SENT_QUERY, 0, SWEEP_SENT_MAX)
  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      out.push({
        subject: message.getSubject(),
        date: toMytIso(new Date(message.getDate().getTime())),
        threadId: thread.getId()
      })
    }
  }
  return out
}

// The calendar entry stands in for the call page; its URL carries the event in `eid`. Anything else
// (a pasted link, an event on another calendar) resolves to null and the sweep reports it as unresolved.
function sweepEvent(url: string): GoogleAppsScript.Calendar.CalendarEvent | null {
  const match = url.match(/[?&]eid=([^&]+)/)
  if (!match?.[1]) return null
  const calendarId = getProperty('CONDITIONS_CALENDAR_ID')
  if (!calendarId) return null
  try {
    const decoded = Utilities.newBlob(
      Utilities.base64Decode(match[1].replace(/-/g, '+').replace(/_/g, '/'))
    ).getDataAsString()
    const eventId = decoded.split(' ')[0]
    if (!eventId) return null
    return CalendarApp.getCalendarById(calendarId)?.getEventById(eventId) ?? null
  } catch {
    return null
  }
}

export function sweepStore(spreadsheetId: string): SweepPorts {
  if (!spreadsheetId) throw new Error('SHEET_ID is not set; run setup()')
  return {
    now: () => new Date(),
    sha256Hex: sha256HexDigest,
    skyFiles: () => listFiles(getProperty('CROSSINGS_SKY_FOLDER_ID')),
    crowdFiles: () => listFiles(getProperty('CROSSINGS_CROWD_FOLDER_ID')),
    replayFiles: () => listFiles(getProperty('CROSSINGS_REPLAY_FOLDER_ID')),
    rota: () => readColumns(spreadsheetId, 'rota', ['date', 'start', 'end', 'approver', 'email']),
    notifications: () => readColumns(spreadsheetId, 'notifications', ['at', 'kind', 'to', 'ref', 'gmail_message_id']),
    ledger: () => readColumns(spreadsheetId, 'ledger', columnsOf('ledger')),
    indicators: () =>
      readColumns(spreadsheetId, 'indicators', [
        'snapshot_id',
        'scope',
        'name',
        'value',
        'observed_at',
        'age_min',
        'state'
      ]),
    clauseVersions: () =>
      readColumns(spreadsheetId, 'clause_versions', [
        'version_n',
        'saved_at',
        'editor',
        'content_hash',
        'content_json'
      ]),
    windows: () =>
      readColumns(spreadsheetId, 'windows', [
        'window_id',
        'subscriber_id',
        'kind',
        'date',
        'start_myt',
        'end_myt',
        'language',
        'status'
      ]),
    shadow: () => readColumns(spreadsheetId, 'shadow', ['scope', 'verdict', 'snapshot_id']),
    sent: sweepSent,
    calendarDescription: (url) => sweepEvent(url)?.getDescription() ?? null,
    teamAlertEmails: () =>
      (getProperty('TEAM_ALERT_EMAILS') ?? '')
        .split(',')
        .map((address) => address.trim())
        .filter((address) => address !== ''),
    sendMail: (to, subject, body) => {
      GmailApp.sendEmail(to.join(','), subject, body)
      const threads = GmailApp.search('in:sent newer_than:1h', 0, SWEEP_SENT_MAX)
      for (const thread of threads) {
        for (const message of thread.getMessages()) {
          if (message.getSubject() === subject) return message.getId()
        }
      }
      return ''
    },
    appendNotification: (row) => appendRows(spreadsheetId, 'notifications', [row]),
    fillLedger: (rowIndex, cells) => {
      const target = sheet(spreadsheetId, 'ledger')
      const columns = columnsOf('ledger')
      const sheetRow = rowIndex + 2
      for (const [column, value] of Object.entries(cells)) {
        target.getRange(sheetRow, columns.indexOf(column as (typeof columns)[number]) + 1).setValue(value)
      }
    },
    appendCalendarDescription: (url, line) => {
      const event = sweepEvent(url)
      if (!event) return
      const current = event.getDescription()
      event.setDescription(current ? `${current}\n${line}` : line)
    }
  }
}
