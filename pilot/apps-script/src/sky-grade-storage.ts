import type { SkyGraderPorts, SkyGradeCrossing } from './sky-grades.ts'
import { columnsOf, type Cell } from './schema.ts'
import { normalizeWindowRow } from './tick.ts'
import {
  decodeSkyGradeBatch,
  encodeSkyGradeBatch,
  ownedSkyGradeCells,
  SKY_GRADE_BATCH_KEY,
  type SkyGradeBatch,
  type StoredSkyGrade
} from './sky-grade-state.ts'
import {
  CAMERA_PROBATION_HISTORY_KEY,
  decodeCameraProbationHistory,
  type CameraProbationHistory
} from './camera-probation-history.ts'

export interface SkyGradeNativeHelpers {
  read: typeof import('./gas.ts').readColumns
  newGradeId(): string
  hashId(text: string): string
}
// The installed GAS types predate the Sheets v4 filterSpecs field.
type NativeFilterView = GoogleAppsScript.Sheets.Schema.FilterView & {
  filterSpecs?: { columnIndex: number; filterCriteria: GoogleAppsScript.Sheets.Schema.FilterCriteria }[]
}
const TITLE = 'No call to explain'
const METADATA_FIELDS =
  'spreadsheetId,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),filterViews(filterViewId,title,range,filterSpecs))'
const props = () => PropertiesService.getScriptProperties()
// API object key order is not part of view identity.
function viewValue(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  )
}
function invalid(): never {
  throw Error('sky_grade_storage_binding')
}
function sheets() {
  if (typeof Sheets === 'undefined') throw Error('sky_grade_sheets_unavailable')
  return Sheets.Spreadsheets!
}

// No native service access at construction. The caller holds the single outer lock.
export function skyGradeStoragePorts(
  spreadsheetId: string,
  skyFolderId: string,
  helpers: SkyGradeNativeHelpers
): SkyGraderPorts {
  if (
    ![spreadsheetId, skyFolderId].every((id) => typeof id === 'string' && id.length > 0 && id.trim() === id) ||
    spreadsheetId === skyFolderId
  )
    throw Error('sky_grade_storage_configuration')
  let confirmedCursor = 1
  let observedIntent: string | undefined
  // Deliberately uncached: every recovery, reservation and uncertain-write retry observes native state.
  function target() {
    const workbook = SpreadsheetApp.openById(spreadsheetId)
    if (workbook.getId() !== spreadsheetId) return invalid()
    const sheet = workbook.getSheetByName('grades')
    if (!sheet) return invalid()
    const sheetId = sheet.getSheetId()
    if (!Number.isSafeInteger(sheetId) || sheetId < 0) return invalid()
    const metadata = sheets().get(spreadsheetId, { fields: METADATA_FIELDS })
    if (metadata.spreadsheetId !== spreadsheetId || !Array.isArray(metadata.sheets)) return invalid()
    const matches = metadata.sheets.filter((s) => s.properties?.title === 'grades')
    if (matches.length !== 1 || matches[0]!.properties?.sheetId !== sheetId) return invalid()
    const grid = matches[0]!.properties!.gridProperties
    if (
      !Number.isSafeInteger(grid?.rowCount) ||
      grid!.rowCount! < 1 ||
      !Number.isSafeInteger(grid?.columnCount) ||
      grid!.columnCount! < 12
    )
      return invalid()
    const header = sheet.getRange(1, 1, 1, 12).getValues()[0]
    if (!header || columnsOf('grades').some((name, i) => header[i] !== name)) return invalid()
    const lastRow = sheet.getLastRow()
    if (!Number.isSafeInteger(lastRow) || lastRow < 1) return invalid()
    return { sheetId, sheet, metadata, owned: matches[0]!, rowCount: grid!.rowCount!, lastRow }
  }
  function bound(batch: SkyGradeBatch, current = target()) {
    if (batch.spreadsheetId !== spreadsheetId || batch.sheetId !== current.sheetId) return invalid()
    return current
  }
  function pending(): SkyGradeBatch | null {
    const raw = props().getProperty(SKY_GRADE_BATCH_KEY)
    return raw === null ? null : decodeSkyGradeBatch(raw)
  }
  function receipts(current: ReturnType<typeof target>): StoredSkyGrade[] {
    const count = current.lastRow - 1
    if (!count) return []
    const left = current.sheet.getRange(2, 1, count, 9).getValues()
    const right = current.sheet.getRange(2, 11, count, 2).getValues()
    return Array.from({ length: count }, (_, i) => ({
      rowIndex: i + 1,
      cells: Array.from({ length: 9 }, (_, j) => left[i]?.[j] ?? '').concat(
        Array.from({ length: 2 }, (_, j) => right[i]?.[j] ?? '')
      ) as Cell[]
    }))
  }
  function same(batch: SkyGradeBatch): void {
    const saved = pending()
    if (!saved || encodeSkyGradeBatch(saved) !== encodeSkyGradeBatch(batch)) return invalid()
  }
  function checkTarget(batch: SkyGradeBatch, current: ReturnType<typeof target>): void {
    const rows = receipts(current)
    const ids = new Set(batch.rows.map((r) => r.grade_id))
    const windows = new Set(batch.rows.map((r) => r.window_id))
    const end = batch.startRowIndex + batch.rows.length
    if (
      rows.some(
        (r) =>
          (r.rowIndex < batch.startRowIndex || r.rowIndex >= end) &&
          (ids.has(String(r.cells[0])) || windows.has(String(r.cells[1])))
      )
    )
      return invalid()
    let exact = 0
    for (const [i, row] of batch.rows.entries()) {
      const cells = rows[batch.startRowIndex + i - 1]?.cells
      if (!cells || cells.every((c) => c === '' || c === null || c === undefined)) continue
      const expected = ownedSkyGradeCells(row)
      if (cells.length !== expected.length || cells.some((c, j) => c !== expected[j])) return invalid()
      exact++
    }
    if (exact && exact !== batch.rows.length) return invalid()
    // getLastRow accounts for explanations and any other occupied columns without reading them.
    if (!exact && current.lastRow > batch.startRowIndex) return invalid()
  }
  function crossings(): SkyGradeCrossing[] {
    const result: SkyGradeCrossing[] = []
    const files = DriveApp.getFolderById(skyFolderId).getFiles()
    while (files.hasNext()) {
      const file = files.next()
      if (file.isTrashed()) continue
      result.push({ fileId: file.getId(), name: file.getName(), text: file.getBlob().getDataAsString('UTF-8') })
    }
    return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }
  return {
    now: () => new Date(),
    newGradeId: () => helpers.newGradeId(),
    hashId: (text) => helpers.hashId(text),
    gradeTarget: () => ({ spreadsheetId, sheetId: target().sheetId }),
    readGrades: () => receipts(target()),
    pendingBatch: () => {
      const batch = pending()
      observedIntent = batch ? encodeSkyGradeBatch(batch) : undefined
      return batch
    },
    prepareBatch: (rows) => {
      if (!rows.length) return invalid()
      const current = target()
      return {
        version: 1,
        batchId: rows[0]!.grade_id,
        spreadsheetId,
        sheetId: current.sheetId,
        startRowIndex: Math.max(confirmedCursor, current.lastRow),
        rows: rows.map((r) => ({ ...r }))
      }
    },
    saveBatch: (batch) => {
      const encoded = encodeSkyGradeBatch(batch)
      const valid = decodeSkyGradeBatch(encoded)
      const current = bound(valid)
      const previous = pending()
      if (previous && encodeSkyGradeBatch(previous) !== encoded) return invalid()
      checkTarget(valid, current)
      observedIntent = encoded
      props().setProperty(SKY_GRADE_BATCH_KEY, encoded)
    },
    clearBatch: (batchId) => {
      const saved = pending()
      if (!saved || saved.batchId !== batchId || encodeSkyGradeBatch(saved) !== observedIntent) return invalid()
      bound(saved)
      confirmedCursor = Math.max(confirmedCursor, saved.startRowIndex + saved.rows.length)
      props().deleteProperty(SKY_GRADE_BATCH_KEY)
    },
    applyBatch: (batch) => {
      const valid = decodeSkyGradeBatch(encodeSkyGradeBatch(batch))
      const current = bound(valid)
      same(valid)
      checkTarget(valid, current)
      const cells = valid.rows.map((row) =>
        ownedSkyGradeCells(row).map((value) => ({
          userEnteredValue: typeof value === 'boolean' ? { boolValue: value } : { stringValue: String(value) }
        }))
      )
      const requests: GoogleAppsScript.Sheets.Schema.Request[] = []
      const growth = Math.max(0, valid.startRowIndex + valid.rows.length - current.rowCount)
      if (growth) requests.push({ appendDimension: { sheetId: valid.sheetId, dimension: 'ROWS', length: growth } })
      for (const [columnIndex, from, to] of [
        [0, 0, 9],
        [10, 9, 11]
      ]) {
        requests.push({
          updateCells: {
            start: { sheetId: valid.sheetId, rowIndex: valid.startRowIndex, columnIndex },
            rows: cells.map((row) => ({ values: row.slice(from, to) })),
            fields: 'userEnteredValue'
          }
        })
      }
      sheets().batchUpdate({ requests }, spreadsheetId)
      confirmedCursor = Math.max(confirmedCursor, valid.startRowIndex + valid.rows.length)
    },
    ensureExplanationView: () => {
      const current = target()
      const views = (current.owned.filterViews ?? []) as NativeFilterView[]
      const matches = views.filter((v) => v.title === TITLE)
      if (matches.length > 1) return invalid()
      const range = { sheetId: current.sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 12 }
      const filterSpecs = [
        {
          columnIndex: 8,
          filterCriteria: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$I2=TRUE' }] } }
        }
      ]
      const existing = matches[0]
      if (existing) {
        const filterViewId = existing.filterViewId
        if (!Number.isSafeInteger(filterViewId) || filterViewId! < 0 || filterViewId! > 2147483647) return invalid()
        if (
          viewValue(existing.range) === viewValue(range) &&
          viewValue(existing.filterSpecs) === viewValue(filterSpecs)
        )
          return { status: 'ready', filterViewId: filterViewId! }
        const filter: NativeFilterView = { filterViewId, range, filterSpecs }
        sheets().batchUpdate(
          { requests: [{ updateFilterView: { filter, fields: 'range,filterSpecs' } }] },
          spreadsheetId
        )
        return { status: 'updated', filterViewId: filterViewId! }
      }
      const digest = helpers.hashId(`${spreadsheetId}\0${current.sheetId}\0${TITLE}`)
      if (!/^[0-9a-f]{64}$/.test(digest)) return invalid()
      const filterViewId = 1 + parseInt(digest.slice(0, 7), 16)
      if (current.metadata.sheets!.some((s) => s.filterViews?.some((v) => v.filterViewId === filterViewId)))
        return invalid()
      const filter: NativeFilterView = { filterViewId, title: TITLE, range, filterSpecs }
      sheets().batchUpdate({ requests: [{ addFilterView: { filter } }] }, spreadsheetId)
      return { status: 'created', filterViewId }
    },
    readInputs: () => {
      const properties = props()
      // Native property failures propagate; malformed history is unavailable evidence, never reset.
      const raw = properties.getProperty(CAMERA_PROBATION_HISTORY_KEY)
      let cameraHistory: CameraProbationHistory | null = null
      let cameraHistoryProblem: string | undefined
      if (raw !== null) {
        try {
          cameraHistory = decodeCameraProbationHistory(raw, spreadsheetId)
        } catch {
          cameraHistoryProblem = 'camera_history_invalid'
        }
      }
      const start = properties.getProperty('CAMERA_DAY_START')
      const end = properties.getProperty('CAMERA_DAY_END')
      return {
        windows: helpers
          .read(
            spreadsheetId,
            'windows',
            ['window_id', 'subscriber_id', 'kind', 'date', 'start_myt', 'end_myt', 'language', 'status', 'declared_at'],
            true
          )
          .map(normalizeWindowRow),
        ledger: helpers.read(
          spreadsheetId,
          'ledger',
          ['kind', 'pack', 'call_id', 'window_id or night_id', 'mode', 'body'],
          true
        ),
        // probation is only the latest recorded-decision mirror, never historical eligibility.
        sources: helpers.read(
          spreadsheetId,
          'sources',
          ['source_id', 'kind', 'cadence_min', 'stale_after_min', 'freshness', 'probation', 'distance_km'],
          true
        ),
        readings: helpers.read(
          spreadsheetId,
          'readings',
          [
            'reading_id',
            'source_kind',
            'source_id',
            'metric',
            'observed_at',
            'received_at',
            'value',
            'unit',
            'poll_id',
            'revision'
          ],
          true
        ),
        polls: helpers.read(
          spreadsheetId,
          'polls',
          ['poll_id', 'source_kind', 'source_id', 'started_at', 'received_at', 'http_status', 'outcome'],
          true
        ),
        warnings: helpers.read(
          spreadsheetId,
          'warnings',
          [
            'warning_key',
            'issued',
            'title_en',
            'text_en',
            'valid_from',
            'valid_to',
            'first_seen_at',
            'last_seen_at',
            'names_kl'
          ],
          true
        ),
        clauseVersions: helpers.read(
          spreadsheetId,
          'clause_versions',
          ['saved_at', 'content_hash', 'content_json'],
          true
        ),
        crossings: crossings(),
        daylight: start && end ? { start, end } : null,
        cameraHistory,
        ...(cameraHistoryProblem ? { cameraHistoryProblem } : {})
      }
    }
  }
}
