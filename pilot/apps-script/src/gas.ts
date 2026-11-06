// Apps Script adapters for the ports the pure modules take. Tests use doubles instead of these.
import { toMytIso } from '../../shared/time.ts'
import type { SourceStateUpdate } from './indicators.ts'
import type { JpsHttpResponse } from './jps.ts'
import type { CameraDrive, CameraFrameStore, RetentionStore } from './camera.ts'
import type { PiRowsStore } from './pi-rows.ts'
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
      (file) => file.getMimeType() === MimeType.GOOGLE_SHEETS
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

function replaceNowRows(spreadsheetId: string, records: readonly Row<'now'>[]): void {
  const target = sheet(spreadsheetId, 'now')
  const width = columnsOf('now').length
  const previousDataRows = Math.max(0, target.getLastRow() - 1)
  const rows = records.map((record) => toRow('now', record))
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
