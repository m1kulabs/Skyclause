import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { build } from '../build.ts'
import { skyGradeStoragePorts } from './sky-grade-storage.ts'
import { readColumns, skyGradePorts } from './gas.ts'
import { columnsOf, toRow, type Cell, type Row, type Tab } from './schema.ts'
import { defaultSkyClauseRows } from './clauses.ts'
import { runSkyGrading } from './sky-grades.ts'
import { encodeSkyGradeBatch, SKY_GRADE_BATCH_KEY, type SkyGradeBatch, type SkyGradeRow } from './sky-grade-state.ts'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const TITLE = 'No call to explain'
const original = new Map<string, PropertyDescriptor | undefined>()
afterEach(() => {
  for (const [name, descriptor] of original) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  original.clear()
})
function install(name: string, value: unknown) {
  if (!original.has(name)) original.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
}
const grade = (n = 1): SkyGradeRow => ({
  grade_id: `019a4df0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  window_id: `=window-${n}`,
  call_id: '=literal',
  proposed_mode: '',
  decision: 'none',
  observed_mode: 'no_call',
  outcome: 'no_call',
  mode_diff: '',
  shadow_fired_no_call: true,
  graded_at: '2026-11-08T00:00:00.000Z',
  clause_version_hash: 'a'.repeat(64)
})
type View = GoogleAppsScript.Sheets.Schema.FilterView & { filterSpecs?: unknown[] }
type Request = GoogleAppsScript.Sheets.Schema.Request
function native() {
  const rows = new Map<Tab, Cell[][]>([['grades', [[...columnsOf('grades')]]]])
  const reads: { tab: Tab; column: number; width: number }[] = []
  const propertyReads: string[] = [],
    folders: string[] = [],
    batches: Request[][] = []
  const props: Record<string, string> = {}
  const views: View[] = [],
    otherViews: View[] = []
  const files: { id: string; name: string; text: string; trashed?: boolean }[] = []
  let grid = 2,
    fault = '',
    sheetId = 42,
    ids = 0
  function seed<T extends Tab>(tab: T, data: Row<T>[]) {
    rows.set(tab, [[...columnsOf(tab)], ...data.map((r) => toRow(tab, r))])
  }
  const services = {
    SpreadsheetApp: {
      openById(id: string) {
        expect(id).toBe('workbook')
        if (fault === 'open') throw Error('native private failure')
        return {
          getId: () => 'workbook',
          getSheetByName(tab: Tab) {
            return {
              getSheetId: () => sheetId,
              getLastRow: () => rows.get(tab)?.length ?? 1,
              getRange(row: number, column: number, height: number, width: number) {
                return {
                  getValues() {
                    reads.push({ tab, column, width })
                    if (fault === 'read') throw Error('native private failure')
                    return Array.from({ length: height }, (_, r) =>
                      Array.from({ length: width }, (_, c) => rows.get(tab)?.[row - 1 + r]?.[column - 1 + c] ?? '')
                    )
                  }
                }
              }
            }
          }
        }
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty(key: string) {
          propertyReads.push(key)
          if (fault === 'property-read') throw Error('private')
          return props[key] ?? null
        },
        setProperty(key: string, value: string) {
          if (fault === 'save-before') throw Error('private')
          props[key] = value
          if (fault === 'save-after') throw Error('private')
        },
        deleteProperty(key: string) {
          if (fault === 'clear-before') throw Error('private')
          delete props[key]
          if (fault === 'clear-after') throw Error('private')
        }
      })
    },
    DriveApp: {
      getFolderById(id: string) {
        folders.push(id)
        let n = 0
        return {
          getFiles: () => ({
            hasNext() {
              if (fault === 'iteration') throw Error('private')
              return n < files.length
            },
            next() {
              const f = files[n++]!
              return {
                isTrashed: () => !!f.trashed,
                getId: () => f.id,
                getName: () => f.name,
                getBlob: () => ({
                  getDataAsString() {
                    if (fault === 'blob') throw Error('private')
                    return f.text
                  }
                })
              }
            }
          })
        }
      }
    },
    Sheets: {
      Spreadsheets: {
        get(id: string, options: { fields: string }) {
          expect(id).toBe('workbook')
          expect(options.fields).not.toContain('data')
          if (fault === 'metadata') throw Error('private')
          return {
            spreadsheetId: id,
            sheets: [
              {
                properties: { sheetId, title: 'grades', gridProperties: { rowCount: grid, columnCount: 12 } },
                filterViews: views
              },
              {
                properties: { sheetId: 99, title: 'other', gridProperties: { rowCount: 5, columnCount: 12 } },
                filterViews: otherViews
              }
            ]
          }
        },
        batchUpdate(body: { requests: Request[] }, id: string) {
          expect(id).toBe('workbook')
          batches.push(structuredClone(body.requests))
          if (fault === 'batch-before') throw Error('private')
          // External service double commits the complete request atomically.
          for (const r of body.requests) {
            if (r.appendDimension) grid += r.appendDimension.length!
            if (r.addFilterView) views.push(structuredClone(r.addFilterView.filter!))
            if (r.updateFilterView)
              Object.assign(
                views.find((v) => v.filterViewId === r.updateFilterView!.filter!.filterViewId)!,
                structuredClone(r.updateFilterView.filter)
              )
            if (r.updateCells) {
              const start = r.updateCells.start!
              for (const [i, row] of r.updateCells.rows!.entries()) {
                const data = rows.get('grades')!
                while (data.length <= start.rowIndex! + i) data.push([])
                row.values!.forEach((v, j) => {
                  const typed = v.userEnteredValue!
                  data[start.rowIndex! + i]![start.columnIndex! + j] =
                    typed.stringValue ?? typed.boolValue ?? typed.numberValue ?? ''
                })
              }
            }
          }
          if (fault === 'batch-after') throw Error('private')
          return {}
        }
      }
    }
  }
  Object.entries(services).forEach(([name, value]) => install(name, value))
  const helpers = {
    read: readColumns,
    newGradeId() {
      expect(this).toBe(helpers)
      return grade(++ids).grade_id
    },
    hashId(s: string) {
      expect(this).toBe(helpers)
      return hash(s)
    }
  }
  const ports = () => skyGradeStoragePorts('workbook', 'sky-folder', helpers)
  return {
    ports,
    services,
    rows,
    reads,
    propertyReads,
    folders,
    batches,
    props,
    views,
    otherViews,
    files,
    seed,
    get grid() {
      return grid
    },
    set grid(value: number) {
      grid = value
    },
    set fault(value: string) {
      fault = value
    },
    set sheetId(value: number) {
      sheetId = value
    }
  }
}
function save(n: ReturnType<typeof native>, rows = [grade()]) {
  const p = n.ports(),
    batch = p.prepareBatch(rows)
  p.saveBatch(batch)
  return { p, batch }
}
test('construction is lazy and validates distinct exact IDs', () => {
  expect(() => skyGradePorts('workbook', 'folder')).not.toThrow()
  expect(() =>
    skyGradeStoragePorts('workbook', 'folder', { read: readColumns, newGradeId: () => '', hashId: hash })
  ).not.toThrow()
  for (const [sheet, folder] of [
    ['', 'folder'],
    ['same', 'same'],
    [' sheet ', 'folder']
  ])
    expect(() =>
      skyGradeStoragePorts(sheet!, folder!, { read: readColumns, newGradeId: () => '', hashId: hash })
    ).toThrow()
})
test('actual metadata/header target is detached; narrow physical receipts preserve holes, booleans and J', () => {
  const n = native()
  n.seed('grades', [{}, { window_id: 'partial', shadow_fired_no_call: true, explanation: 'human' }])
  const p = n.ports(),
    target = p.gradeTarget()
  target.sheetId = 0
  expect(p.gradeTarget()).toEqual({ spreadsheetId: 'workbook', sheetId: 42 })
  expect(p.readGrades()).toEqual([
    { rowIndex: 1, cells: Array(11).fill('') },
    { rowIndex: 2, cells: ['', 'partial', '', '', '', '', '', '', true, '', ''] }
  ])
  expect(
    n.reads.filter((r) => r.tab === 'grades' && r.column !== 1).every((r) => r.column === 11 && r.width === 2)
  ).toBe(true)
})
test('prepare uses last occupied physical row and returns an unencoded full batch', () => {
  const n = native()
  n.seed('grades', [{ explanation: 'occupied' }])
  n.grid = 100
  const rows = Array.from({ length: 30 }, (_, i) => grade(i + 1))
  expect(n.ports().prepareBatch(rows)).toMatchObject({ startRowIndex: 2, rows })
})
test('atomic request grows only as needed and writes typed A:I/K:L without touching J', () => {
  const n = native()
  n.seed('grades', [{ explanation: 'human' }])
  const { p, batch } = save(n, [{ ...grade(), shadow_fired_no_call: false }, grade(2)])
  p.applyBatch(batch)
  expect(n.batches).toEqual([
    [
      { appendDimension: { sheetId: 42, dimension: 'ROWS', length: 2 } },
      {
        updateCells: {
          start: { sheetId: 42, rowIndex: 2, columnIndex: 0 },
          rows: batch.rows.map((r) => ({
            values: [
              r.grade_id,
              r.window_id,
              r.call_id,
              r.proposed_mode,
              r.decision,
              r.observed_mode,
              r.outcome,
              r.mode_diff,
              r.shadow_fired_no_call
            ].map((v) => ({ userEnteredValue: typeof v === 'boolean' ? { boolValue: v } : { stringValue: v } }))
          })),
          fields: 'userEnteredValue'
        }
      },
      {
        updateCells: {
          start: { sheetId: 42, rowIndex: 2, columnIndex: 10 },
          rows: batch.rows.map((r) => ({
            values: [r.graded_at, r.clause_version_hash].map((v) => ({ userEnteredValue: { stringValue: v } }))
          })),
          fields: 'userEnteredValue'
        }
      }
    ]
  ])
  expect(n.rows.get('grades')![1]![9]).toBe('human')
  expect(n.rows.get('grades')![2]![1]).toBe('=window-1')
  p.applyBatch(batch)
  expect(n.batches[1]!.some((r) => r.appendDimension)).toBe(false)
  expect(n.grid).toBe(4)
  expect(n.rows.get('grades')!.length).toBe(4)
})
for (const fault of ['batch-before', 'batch-after', 'clear-before', 'clear-after'])
  test(`controller recovers ${fault} with fixed IDs and rows`, () => {
    const n = native(),
      { batch } = save(n)
    n.fault = fault
    const failed = runSkyGrading(n.ports())
    expect(failed.problems.length).toBeGreaterThan(0)
    n.fault = ''
    const recovered = runSkyGrading(n.ports())
    expect(recovered.problems).toEqual([])
    expect(n.rows.get('grades')!.length).toBe(2)
    expect(n.rows.get('grades')![1]![0]).toBe(batch.rows[0]!.grade_id)
    expect(n.props[SKY_GRADE_BATCH_KEY]).toBeUndefined()
  })
test('save and cleanup are strict identity checks; occupied or foreign targets never write', () => {
  const n = native(),
    { p, batch } = save(n)
  expect(() => p.saveBatch({ ...batch, rows: [grade(2)], batchId: grade(2).grade_id })).toThrow()
  expect(() => p.clearBatch(grade(2).grade_id)).toThrow()
  n.rows.get('grades')!.push(['occupied'])
  expect(() => p.applyBatch(batch)).toThrow()
  expect(n.batches).toHaveLength(0)
  n.rows.get('grades')!.pop()
  n.sheetId = 43
  expect(() => p.applyBatch(batch)).toThrow()
  expect(() => p.clearBatch(batch.batchId)).toThrow()
})
test('invalid header and corrupt pending block writes; no property bulk reads', () => {
  const n = native()
  n.rows.get('grades')![0]![8] = 'bad'
  expect(() => n.ports().gradeTarget()).toThrow()
  n.rows.get('grades')![0] = [...columnsOf('grades')]
  n.props[SKY_GRADE_BATCH_KEY] = '{}'
  expect(runSkyGrading(n.ports()).problems).toEqual([{ code: 'batch_recovery_failed' }])
  expect(n.propertyReads).toEqual([SKY_GRADE_BATCH_KEY])
  expect(n.batches).toHaveLength(0)
})
test('view stable ID reconciles lost acknowledgement and preserves foreign views', () => {
  const n = native()
  n.otherViews.push({ title: TITLE, filterViewId: 7 })
  const id = 1 + parseInt(hash('workbook\0' + 42 + '\0' + TITLE).slice(0, 7), 16)
  n.fault = 'batch-after'
  expect(() => n.ports().ensureExplanationView()).toThrow()
  n.fault = ''
  expect(n.ports().ensureExplanationView()).toEqual({ status: 'ready', filterViewId: id })
  expect(n.batches).toHaveLength(1)
  expect(n.views).toEqual([
    {
      filterViewId: id,
      title: TITLE,
      range: { sheetId: 42, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 12 },
      filterSpecs: [
        {
          columnIndex: 8,
          filterCriteria: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=$I2=TRUE' }] } }
        }
      ]
    }
  ])
})
test('view retries the same add ID after a definite rejection', () => {
  const n = native()
  n.fault = 'batch-before'
  expect(() => n.ports().ensureExplanationView()).toThrow()
  n.fault = ''
  n.ports().ensureExplanationView()
  expect(n.batches[0]).toEqual(n.batches[1])
})
test('view adopts exact title and narrowly repairs drift; duplicate titles and ID collisions fail', () => {
  const n = native()
  n.views.push({
    title: TITLE,
    filterViewId: 9,
    range: { sheetId: 42, endRowIndex: 5 },
    sortSpecs: [{ dimensionIndex: 1 }]
  })
  expect(n.ports().ensureExplanationView()).toEqual({ status: 'updated', filterViewId: 9 })
  expect(n.batches[0]![0]!.updateFilterView!.fields).toBe('range,filterSpecs')
  expect(n.batches[0]![0]!.updateFilterView!.filter!.title).toBeUndefined()
  expect(n.views[0]!.sortSpecs).toEqual([{ dimensionIndex: 1 }])
  n.views.push({ title: TITLE, filterViewId: 10 })
  expect(() => n.ports().ensureExplanationView()).toThrow()
  n.views.length = 0
  n.otherViews.push({
    title: 'foreign',
    filterViewId: 1 + parseInt(hash('workbook\0' + 42 + '\0' + TITLE).slice(0, 7), 16)
  })
  expect(() => n.ports().ensureExplanationView()).toThrow()
})
test('native inputs use public windows and narrow evidence, own properties, live Sky folder only', () => {
  const n = native()
  n.seed('windows', [{ window_id: 'w', title: 'private', start_myt: new Date('2026-11-08T06:00:00Z') }])
  n.files.push(
    { id: 'f', name: 'crossing.json', text: '{}' },
    { id: 'trash', name: 'trash', text: 'bad', trashed: true }
  )
  n.props.SKY_CAMERA_PROBATION_HISTORY_V1 = '{}'
  const input = n.ports().readInputs()
  expect(input.cameraHistory).toBeNull()
  expect(input.cameraHistoryProblem).toBeTruthy()
  expect(input.windows[0]!.start_myt).toBe('2026-11-08T14:00:00+08:00')
  expect(input.crossings).toEqual([{ fileId: 'f', name: 'crossing.json', text: '{}' }])
  expect(n.folders).toEqual(['sky-folder'])
  for (const r of n.reads) {
    const key = columnsOf(r.tab)[r.column - 1]
    expect(
      [
        'state',
        'state_since',
        'probation_n',
        'probation_agreement',
        'title',
        'recipient_ids',
        'approver_on_duty'
      ].includes(key!)
    ).toBe(false)
  }
  expect(
    n.propertyReads.every((k) => ['CAMERA_DAY_START', 'CAMERA_DAY_END', 'SKY_CAMERA_PROBATION_HISTORY_V1'].includes(k))
  ).toBe(true)
})
for (const fault of ['property-read', 'iteration', 'blob', 'read'])
  test(`native input ${fault} propagates`, () => {
    const n = native()
    n.seed('windows', [{ window_id: 'w' }])
    n.files.push({ id: 'f', name: 'crossing.json', text: '{}' })
    n.fault = fault
    expect(() => n.ports().readInputs()).toThrow()
  })
test('actual controller writes a closed window once and does not use stale native receipts', () => {
  const n = native()
  n.grid = 100
  n.seed('windows', [
    { window_id: 'window', date: '2026-11-02', start_myt: '14:00', end_myt: '15:30', status: 'active' }
  ])
  const content_json = JSON.stringify(
    defaultSkyClauseRows().map((r) => Object.fromEntries(columnsOf('clauses').map((k) => [k, r[k] ?? ''])))
  )
  n.seed('clause_versions', [{ saved_at: '2026-11-01T00:00:00+08:00', content_json, content_hash: hash(content_json) }])
  const p = n.ports()
  expect(runSkyGrading(p).appendedGrades).toBe(1)
  expect(runSkyGrading(p).alreadyGradedWindows).toBe(1)
  expect(n.rows.get('grades')!.length).toBe(2)
})
test('owned state save before/after failures preserve exact intent and cannot replace it', () => {
  const n = native(),
    p = n.ports(),
    batch = p.prepareBatch([grade()])
  n.fault = 'save-before'
  expect(() => p.saveBatch(batch)).toThrow()
  expect(n.props[SKY_GRADE_BATCH_KEY]).toBeUndefined()
  n.fault = 'save-after'
  expect(() => p.saveBatch(batch)).toThrow()
  expect(n.props[SKY_GRADE_BATCH_KEY]).toBe(encodeSkyGradeBatch(batch))
})

test('view equality ignores JSON property order and never updates a correct view', () => {
  const n = native()
  n.ports().ensureExplanationView()
  n.batches.length = 0
  const v = n.views[0]!
  v.range = { endColumnIndex: 12, startColumnIndex: 0, startRowIndex: 0, sheetId: 42 }
  v.filterSpecs = [
    {
      filterCriteria: { condition: { values: [{ userEnteredValue: '=$I2=TRUE' }], type: 'CUSTOM_FORMULA' } },
      columnIndex: 8
    }
  ]
  expect(n.ports().ensureExplanationView().status).toBe('ready')
  expect(n.batches).toHaveLength(0)
})
test('cleanup refuses replacement content even when its batch ID is reused', () => {
  const n = native(),
    { p, batch } = save(n)
  n.props[SKY_GRADE_BATCH_KEY] = encodeSkyGradeBatch({ ...batch, rows: [{ ...grade(), mode_diff: 'changed' }] })
  expect(() => p.clearBatch(batch.batchId)).toThrow()
  expect(n.props[SKY_GRADE_BATCH_KEY]).toBeTruthy()
})
test('camera consistency mirror and warning exclusions survive native projections', () => {
  const n = native()
  n.seed('sources', [{ source_id: 'cam-1', kind: 'camera', probation: false }])
  n.seed('readings', [{ reading_id: 'r', poll_id: 'p', unit: 'ratio' }])
  n.seed('warnings', [{ warning_key: 'w', title_en: 'No advisory', text_en: 'for malaysian waters' }])
  const input = n.ports().readInputs()
  expect(input.sources[0]!.probation).toBe(false)
  expect(input.readings[0]!.poll_id).toBe('p')
  expect(input.warnings[0]!.title_en).toBe('No advisory')
  expect(input.warnings[0]!.text_en).toBe('for malaysian waters')
})
for (const mutation of ['partial', 'hole', 'duplicate-id', 'duplicate-window', 'foreign-sheet'])
  test(`native apply rejects ${mutation} without writes`, () => {
    const n = native(),
      { p, batch } = save(n)
    if (mutation === 'partial') n.rows.get('grades')!.push(['', batch.rows[0]!.window_id])
    if (mutation === 'hole') n.rows.get('grades')!.push([], ['', '', '', '', '', '', '', '', '', 'human'])
    if (mutation === 'duplicate-id') n.rows.get('grades')!.push([], [batch.rows[0]!.grade_id])
    if (mutation === 'duplicate-window') n.rows.get('grades')!.push([], ['', batch.rows[0]!.window_id])
    if (mutation === 'foreign-sheet') batch.sheetId = 99
    expect(() => p.applyBatch(batch)).toThrow()
    expect(n.batches).toHaveLength(0)
  })
test('exact receipt reapplication keeps J, IDs, row count and grid unchanged after lost acknowledgement', () => {
  const n = native(),
    { p, batch } = save(n)
  n.fault = 'batch-after'
  expect(() => p.applyBatch(batch)).toThrow()
  n.fault = ''
  n.rows.get('grades')![1]![9] = 'human explanation for TRUE row'
  const before = structuredClone(n.rows.get('grades')),
    grid = n.grid
  p.applyBatch(batch)
  expect(n.rows.get('grades')).toEqual(before)
  expect(n.grid).toBe(grid)
  expect(n.batches[0]).toEqual(n.batches[1])
})

test('native time-only window cells normalize while captured and received instants stay native', () => {
  const n = native(),
    captured = new Date('2026-11-02T08:00:00Z'),
    received = new Date('2026-11-02T08:01:00Z')
  n.seed('windows', [
    {
      window_id: 'time-only',
      date: new Date('2026-11-01T16:00:00Z'),
      start_myt: new Date('1899-12-30T06:00:00Z'),
      end_myt: new Date('1899-12-30T07:30:00Z')
    }
  ])
  n.seed('readings', [{ observed_at: captured, received_at: received }])
  const input = n.ports().readInputs()
  expect(input.windows[0]).toMatchObject({ date: '2026-11-02', start_myt: '14:00', end_myt: '15:30' })
  expect(input.readings[0]!.observed_at).toBe(captured)
  expect(input.readings[0]!.received_at).toBe(received)
})

for (const fault of ['metadata', 'open', 'read', 'property-read'])
  test(`controller bounds native ${fault} errors`, () => {
    const n = native()
    n.fault = fault
    const report = runSkyGrading(n.ports())
    expect(report.problems).toEqual([{ code: fault === 'property-read' ? 'batch_recovery_failed' : 'view_failed' }])
    expect(n.batches).toHaveLength(0)
  })
test('partial legacy native grade row suppresses fresh grades for that window', () => {
  const n = native()
  n.seed('grades', [{ window_id: 'window' }])
  n.seed('windows', [
    { window_id: 'window', date: '2026-11-02', start_myt: '14:00', end_myt: '15:30', status: 'active' }
  ])
  const report = runSkyGrading(n.ports())
  expect(report.alreadyGradedWindows).toBe(1)
  expect(report.plannedGrades).toBe(0)
  expect(n.batches.every((requests) => requests.every((r) => !r.updateCells))).toBe(true)
})
test('native pending foreign workbook is bounded by controller target checks', () => {
  const n = native(),
    { batch } = save(n)
  n.props[SKY_GRADE_BATCH_KEY] = encodeSkyGradeBatch({ ...batch, spreadsheetId: 'foreign' })
  expect(runSkyGrading(n.ports()).problems).toEqual([{ code: 'batch_target_changed' }])
  expect(n.batches).toHaveLength(0)
})
test('view keeps an unbounded range after future grid growth and never filters on explanation', () => {
  const n = native()
  n.ports().ensureExplanationView()
  n.grid = 1000
  expect(n.ports().ensureExplanationView().status).toBe('ready')
  expect(n.batches).toHaveLength(1)
  expect(n.views[0]!.range!.endRowIndex).toBeUndefined()
  expect(n.views[0]!.filterSpecs).toHaveLength(1)
})

test('an existing exact-title view with ID zero is adopted', () => {
  const n = native()
  n.views.push({ title: TITLE, filterViewId: 0 })
  expect(n.ports().ensureExplanationView()).toEqual({ status: 'updated', filterViewId: 0 })
  expect(n.batches[0]![0]!.updateFilterView!.filter!.filterViewId).toBe(0)
})

let bundleDir = ''
let bundle = ''
beforeAll(async () => {
  bundleDir = mkdtempSync(join(tmpdir(), 'sky-grade-main-'))
  await build({ outdir: bundleDir, sha: 'task-5-test', builtAt: '2026-11-09T00:00:00+08:00', pilotScriptId: '' })
  bundle = readFileSync(join(bundleDir, 'Code.js'), 'utf8')
})
afterAll(() => rmSync(bundleDir, { recursive: true, force: true }))

// Only native services and wall-clock time are doubled; built main, factory, controller and storage all run.
function builtGrader() {
  const n = native()
  n.props.SHEET_ID = 'workbook'
  n.props.CROSSINGS_SKY_FOLDER_ID = 'sky-folder'
  const logs: string[] = [],
    forbidden: string[] = [],
    locks: string[] = []
  let clock = Date.parse('2026-11-08T23:55:00+08:00'),
    held = false,
    failLog = false,
    readDelay = 0
  class Clock extends Date {
    constructor(value?: string | number) {
      super(value === undefined ? clock : value)
    }
    static now() {
      return clock
    }
  }
  const blocked = (name: string) =>
    new Proxy(
      {},
      {
        get() {
          forbidden.push(name)
          throw Error('forbidden native callback')
        }
      }
    )
  const context = createContext({
    ...n.services,
    Date: Clock,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm: string, text: string) => [...createHash('sha256').update(text).digest()]
    },
    LockService: {
      getScriptLock: () => ({
        waitLock() {
          if (held) throw Error('nested lock')
          held = true
          locks.push('acquire')
        },
        releaseLock() {
          held = false
          locks.push('release')
        }
      })
    },
    console: {
      log(line: string) {
        if (failLog) throw Error('log failure')
        logs.push(line)
      }
    },
    Gmail: blocked('Gmail'),
    GmailApp: blocked('GmailApp'),
    MailApp: blocked('MailApp'),
    CalendarApp: blocked('CalendarApp'),
    UrlFetchApp: blocked('UrlFetchApp'),
    ScriptApp: blocked('ScriptApp')
  })
  const open = n.services.SpreadsheetApp.openById
  n.services.SpreadsheetApp.openById = (id: string) => {
    expect(held).toBe(true)
    const book = open(id)
    clock += readDelay
    return book
  }
  runInContext(bundle, context)
  const main = context as unknown as { gradeSky(): void }
  return {
    n,
    logs,
    forbidden,
    locks,
    main,
    at: (value: string) => {
      clock = Date.parse(value)
    },
    delay: (ms: number) => {
      readDelay = ms
    },
    failLog: () => {
      failLog = true
    }
  }
}
function seedNight(n: ReturnType<typeof native>) {
  n.seed('windows', [
    {
      window_id: 'night',
      date: '2026-11-08',
      start_myt: '22:00',
      end_myt: '23:30',
      title: 'PRIVATE_TITLE',
      status: 'active'
    }
  ])
  const content_json = JSON.stringify(
    defaultSkyClauseRows().map((r) => Object.fromEntries(columnsOf('clauses').map((k) => [k, r[k] ?? ''])))
  )
  n.seed('clause_versions', [{ saved_at: '2026-11-01T00:00:00+08:00', content_json, content_hash: hash(content_json) }])
  n.seed('ledger', [
    {
      pack: 'sky',
      'window_id or night_id': 'night',
      call_id: 'call',
      mode: 'normal',
      kind: 'approved',
      body: '{"mode":"normal","private":"PRIVATE_BODY"}',
      recipient_ids: 'PRIVATE_RECIPIENT'
    }
  ])
  n.seed('grades', [{ window_id: 'older', explanation: 'PRIVATE_EXPLANATION' }])
}

test('built gradeSky requires actual workbook and live Sky folder under one released lock', () => {
  for (const key of ['SHEET_ID', 'CROSSINGS_SKY_FOLDER_ID']) {
    for (const value of [undefined, '', '   ']) {
      const r = builtGrader()
      if (value === undefined) delete r.n.props[key]
      else r.n.props[key] = value
      expect(typeof r.main.gradeSky).toBe('function')
      expect(() => r.main.gradeSky()).toThrow(`${key} is not set`)
      expect(r.locks).toEqual(['acquire', 'release'])
      expect(r.n.batches).toEqual([])
      expect(r.forbidden).toEqual([])
    }
  }
  const r = builtGrader()
  r.n.props.CROSSINGS_SKY_FOLDER_ID = 'workbook'
  expect(() => r.main.gradeSky()).toThrow()
  expect(r.locks).toEqual(['acquire', 'release'])
})

test('built ANL-1 uses actual 00:30 close, skips 23:55 and exact close, grades at 06:00 once', () => {
  const r = builtGrader()
  expect(typeof r.main.gradeSky).toBe('function')
  seedNight(r.n)
  const unchanged = JSON.stringify([...r.n.rows].filter(([tab]) => tab !== 'grades'))
  for (const at of ['2026-11-08T23:55:00+08:00', '2026-11-09T00:30:00+08:00']) {
    r.at(at)
    r.main.gradeSky()
    expect(r.n.rows.get('grades')).toHaveLength(2)
    expect(JSON.parse(r.logs.at(-1)!).closedWindows).toBe(0)
  }
  r.at('2026-11-09T06:00:00+08:00')
  r.main.gradeSky()
  const rows = r.n.rows.get('grades')!
  // No readings are invented for this night. Incomplete evidence must stay No call.
  expect(rows[2]!.slice(1, 9)).toEqual(['night', 'call', 'normal', 'approved', 'no_call', 'no_call', '', false])
  expect(rows[2]![10]).toBe('2026-11-08T22:00:00.000Z')
  expect(JSON.parse(r.logs.at(-1)!).appendedGrades).toBe(1)
  r.main.gradeSky()
  expect(r.n.rows.get('grades')).toHaveLength(3)
  expect(JSON.parse(r.logs.at(-1)!).alreadyGradedWindows).toBe(1)
  expect(r.locks).toEqual(Array(4).fill(['acquire', 'release']).flat())
  expect(r.n.folders.every((id) => id === 'sky-folder')).toBe(true)
  expect(r.forbidden).toEqual([])
  expect(JSON.stringify([...r.n.rows].filter(([tab]) => tab !== 'grades'))).toBe(unchanged)
  expect(rows[1]![9]).toBe('PRIVATE_EXPLANATION')
  expect(r.logs.join('')).not.toMatch(/PRIVATE_|recipients|body|title|explanation/)
})

test('built gradeSky logs only bounded counts and codes and releases lock after native or logging failures', () => {
  const r = builtGrader()
  expect(typeof r.main.gradeSky).toBe('function')
  seedNight(r.n)
  r.n.seed('windows', [{ window_id: 'PRIVATE_TITLE', date: 'invalid' }])
  r.main.gradeSky()
  const report = JSON.parse(r.logs[0]!)
  expect(report.problems).toEqual(['window_invalid_or_conflicting'])
  expect(Object.keys(report).sort()).toEqual(
    [
      'alreadyGradedWindows',
      'appendedGrades',
      'budgetExhausted',
      'closedWindows',
      'deferredWindows',
      'pendingBatch',
      'plannedGrades',
      'problems',
      'reconciledGrades'
    ].sort()
  )
  expect(r.logs.join('')).not.toMatch(/PRIVATE_|windowId|filterViewId/)
  r.n.fault = 'metadata'
  r.main.gradeSky()
  expect(JSON.parse(r.logs.at(-1)!).problems).toEqual(['view_failed'])
  r.failLog()
  expect(() => r.main.gradeSky()).toThrow('log failure')
  expect(r.locks).toEqual(Array(3).fill(['acquire', 'release']).flat())
  expect(r.forbidden).toEqual([])
})

test('built gradeSky admission uses elapsed run time rather than scheduled trigger time', () => {
  const r = builtGrader()
  expect(typeof r.main.gradeSky).toBe('function')
  seedNight(r.n)
  r.at('2026-11-09T06:00:00+08:00')
  r.delay(240000)
  r.main.gradeSky()
  expect(JSON.parse(r.logs[0]!).budgetExhausted).toBe(true)
  expect(r.n.rows.get('grades')).toHaveLength(2)
  expect(r.n.props[SKY_GRADE_BATCH_KEY]).toBeUndefined()
  expect(r.locks).toEqual(['acquire', 'release'])
  expect(r.forbidden).toEqual([])
})
