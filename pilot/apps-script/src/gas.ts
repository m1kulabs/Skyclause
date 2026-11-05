// Apps Script adapters for the ports the pure modules take. Tests use doubles instead of these.
import type { GetProperty } from './properties.ts'
import { columnsOf, type Cell, type Column, type Tab } from './schema.ts'
import type { DrivePort, PropertyPort, WorkbookPort } from './setup.ts'
import type { InstalledTrigger, TriggerPort } from './triggers.ts'

const LOCK_WAIT_MS = 30_000

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

function first<T extends { isTrashed(): boolean }>(items: { hasNext(): boolean; next(): T }): T | null {
  while (items.hasNext()) {
    const item = items.next()
    if (!item.isTrashed()) return item
  }
  return null
}

export const drive: DrivePort = {
  findRootFolder: (name) => first(DriveApp.getRootFolder().getFoldersByName(name))?.getId() ?? null,
  createRootFolder: (name) => DriveApp.getRootFolder().createFolder(name).getId(),
  findFolder: (parentId, name) => first(DriveApp.getFolderById(parentId).getFoldersByName(name))?.getId() ?? null,
  createFolder: (parentId, name) => DriveApp.getFolderById(parentId).createFolder(name).getId(),
  findSpreadsheet: (folderId, name) => {
    const files = DriveApp.getFolderById(folderId).getFilesByName(name)
    while (files.hasNext()) {
      const file = files.next()
      if (!file.isTrashed() && file.getMimeType() === MimeType.GOOGLE_SHEETS) return file.getId()
    }
    return null
  },
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
    (_, row) => Object.fromEntries(wanted.map((column, n) => [column, values[n]?.[row]?.[0] ?? ''])) as Record<C, Cell>
  )
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
