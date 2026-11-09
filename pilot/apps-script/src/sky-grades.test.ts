import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defaultSkyClauseRows } from './clauses.ts'
import { parseJpsRainfall } from './jps.ts'
import { columnsOf, type Cell, type Row } from './schema.ts'
import { decodeSkyGradeBatch, encodeSkyGradeBatch, ownedSkyGradeCells, type SkyGradeBatch } from './sky-grade-state.ts'
import { runSkyGrading, selectSkyGradeVersion, type SkyGradeInputs, type SkyGraderPorts } from './sky-grades.ts'
const now = '2026-11-08T00:00:00.000Z'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const windowRow: Row<'windows'> = {
  window_id: 'wave',
  date: '2026-11-02',
  start_myt: '14:00',
  end_myt: '15:30',
  status: 'active'
}
// Explicit test-only haze-off historical version, retaining actual gauge capture receipts.
const clauses = defaultSkyClauseRows().map((r) => ({ ...r, enabled: !String(r.key).startsWith('haze_') }))
function version(rows: Row<'clauses'>[] = clauses, saved_at = '2026-11-01T00:00:00+08:00'): Row<'clause_versions'> {
  const content_json = JSON.stringify(
    rows.map((r) => Object.fromEntries(columnsOf('clauses').map((k) => [k, r[k] ?? ''])))
  )
  return { saved_at, content_json, content_hash: hash(content_json) }
}
const gauge = parseJpsRainfall(
  JSON.parse(readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8'))
).map((r) => ({
  source_id: '0232901RF',
  metric: 'rain_5m_mm',
  observed_at: r.observedAt,
  value: r.value,
  received_at: '2026-11-05T21:12:00+08:00',
  reading_id: r.observedAt,
  revision: 1
}))
function inputs(): SkyGradeInputs {
  return {
    windows: [windowRow],
    ledger: [],
    sources: [{ source_id: '0232901RF', kind: 'jps_rain', stale_after_min: 10 }],
    readings: gauge,
    polls: [],
    warnings: [],
    clauseVersions: [version()],
    crossings: [],
    daylight: null,
    cameraHistory: null
  }
}
function call(patch: Row<'ledger'> = {}): Row<'ledger'> {
  return {
    kind: 'approved',
    pack: 'sky',
    'window_id or night_id': 'wave',
    call_id: 'call-one',
    mode: 'commute_disruption',
    body: JSON.stringify({ mode: 'commute_disruption', no_call: null }),
    ...patch
  }
}
function crossing(patch: Record<string, unknown> = {}) {
  return {
    fileId: 'file',
    name: 'crossing-20261102-1530-01.json',
    text: JSON.stringify({
      crossing_id: 'X-20261102-1530-01',
      pack: 'sky',
      replay: false,
      t_eval: '2026-11-02T15:30:00+08:00',
      snapshot_id: '2026-11-02T15:30:00+08:00',
      clause_version: 1,
      changes: [
        {
          scope: 'wave',
          window: { kind: 'commute', date: '2026-11-02', start_myt: '14:00', end_myt: '15:30' },
          from: 'normal',
          to: 'commute_disruption',
          fired: ['storm_confirmed'],
          blocked: [],
          inputs: []
        }
      ],
      ...patch
    })
  }
}
// Independent property and sheet stores model failures before/after durable persistence.
function rig(data = inputs()) {
  let raw: string | null = null
  const sheet = new Map<number, Cell[]>()
  const explanations = new Map<number, string>()
  let ids = 0
  let clock = Date.parse(now)
  let fault = ''
  let inputReads = 0
  let staleReads = false
  const applied: SkyGradeBatch[] = []
  const ports: SkyGraderPorts = {
    now: () => new Date(clock),
    newGradeId: () => `019a4df0-0000-7000-8000-${String(++ids).padStart(12, '0')}`,
    hashId: hash,
    gradeTarget: () => ({ spreadsheetId: 'workbook', sheetId: 4 }),
    ensureExplanationView: () => ({ status: 'ready', filterViewId: 8 }),
    readInputs: () => {
      inputReads++
      if (fault === 'inputs') throw Error('unreadable')
      if (fault === 'slow-inputs') clock += 240001
      return data
    },
    readGrades: () => (staleReads ? [] : [...sheet].map(([rowIndex, cells]) => ({ rowIndex, cells: [...cells] }))),
    pendingBatch: () => (raw === null ? null : decodeSkyGradeBatch(raw)),
    prepareBatch: (rows) => ({
      version: 1,
      batchId: rows[0]!.grade_id,
      spreadsheetId: 'workbook',
      sheetId: 4,
      startRowIndex: 1,
      rows: [...rows]
    }),
    saveBatch: (b) => {
      if (fault === 'save-before') throw Error('save')
      raw = encodeSkyGradeBatch(b)
      if (fault === 'save-after') throw Error('save')
    },
    applyBatch: (b) => {
      applied.push(b)
      if (fault === 'apply-before') throw Error('apply')
      b.rows.forEach((r, i) => sheet.set(b.startRowIndex + i, [...ownedSkyGradeCells(r)]))
      if (fault === 'apply-after') throw Error('apply')
    },
    clearBatch: (id) => {
      if (raw && decodeSkyGradeBatch(raw).batchId !== id) throw Error('identity')
      if (fault === 'clear-before') throw Error('clear')
      raw = null
      if (fault === 'clear-after') throw Error('clear')
    }
  }
  return {
    ports,
    data,
    sheet,
    explanations,
    applied,
    get ids() {
      return ids
    },
    get raw() {
      return raw
    },
    get inputReads() {
      return inputReads
    },
    setRaw: (v: string) => {
      raw = v
    },
    fault: (v: string) => {
      fault = v
    },
    stale: () => {
      staleReads = true
    },
    advance: () => {
      clock += 240001
    }
  }
}
function grade(r: ReturnType<typeof rig>) {
  const report = runSkyGrading(r.ports)
  return { report, cells: r.sheet.values().next().value! }
}
test('grades actual wave once, retaining original proposal and historical hash', () => {
  const r = rig()
  r.data.ledger = [call()]
  const { report, cells } = grade(r)
  expect(cells.slice(1, 9)).toEqual([
    'wave',
    'call-one',
    'commute_disruption',
    'approved',
    'commute_disruption',
    'hit',
    '',
    false
  ])
  expect(cells[10]).toBe(version().content_hash)
  expect(report.appendedGrades).toBe(1)
  expect(grade(r).report.alreadyGradedWindows).toBe(1)
  expect(r.ids).toBe(1)
})
test.each([
  ['none', undefined, 'miss', '', ''],
  ['rejected', 'commute_disruption', 'miss', 'commute_disruption', ''],
  ['edited', 'outdoor_limited', 'hit', 'commute_disruption', 'outdoor_limited→commute_disruption'],
  ['edited', 'normal', 'miss', 'commute_disruption', ''],
  ['edited', 'no_call', 'no_call', 'commute_disruption', '']
] as const)('classifies %s sent %s independently of proposal', (decision, sent, outcome, proposal, diff) => {
  const r = rig()
  if (decision !== 'none') r.data.ledger = [call({ kind: decision, body: JSON.stringify({ mode: sent }) })]
  const { cells } = grade(r)
  expect(cells[3]).toBe(proposal)
  expect(cells[4]).toBe(decision)
  expect(cells[6]).toBe(outcome)
  expect(cells[7]).toBe(diff)
})
test('No call proposal and documented null sent mode remain separate from Normal', () => {
  for (const row of [call({ mode: 'no_call' }), call({ body: JSON.stringify({ mode: null, no_call: ['gauge'] }) })]) {
    const r = rig()
    r.data.ledger = [row]
    expect(grade(r).cells[6]).toBe('no_call')
  }
  const r = rig()
  r.data.readings = []
  r.data.ledger = [call()]
  expect(grade(r).cells.slice(5, 7)).toEqual(['no_call', 'no_call'])
})
test.each([
  ['normal', 'correct_normal'],
  ['commute_disruption', 'false_alarm']
] as const)('Normal observed versus sent %s', (sent, outcome) => {
  const r = rig()
  r.data.readings = gauge.map((x) => ({ ...x, value: 0 }))
  r.data.ledger = [call({ mode: sent, body: JSON.stringify({ mode: sent }) })]
  expect(grade(r).cells[6]).toBe(outcome)
})
test('physical latest relevant Sky call wins with blank/backfilled timestamps', () => {
  const r = rig()
  r.data.ledger = [
    call({ approved_at: now }),
    call({ kind: 'rejected', call_id: 'last', approved_at: '' }),
    call({ pack: 'crowd' }),
    call({ kind: 'notice' })
  ]
  expect(grade(r).cells.slice(2, 7)).toEqual(['last', 'commute_disruption', 'rejected', 'commute_disruption', 'miss'])
})
test.each(['{', '{}', '{"mode":null}', '{"mode":"surge_night"}'])('malformed selected sent body defers %s', (body) => {
  const r = rig()
  r.data.ledger = [call(), call({ body })]
  expect(grade(r).report.deferredWindows).toBe(1)
  expect(r.sheet.size).toBe(0)
})
test('ANL2 flags rejection but any older approval defeats it', () => {
  const r = rig()
  r.data.crossings = [crossing()]
  r.data.ledger = [call({ kind: 'rejected' })]
  expect(grade(r).cells[8]).toBe(true)
  const s = rig()
  s.data.crossings = [crossing()]
  s.data.ledger = [call(), call({ kind: 'rejected' })]
  expect(grade(s).cells[8]).toBe(false)
})
test.each([
  { replay: true },
  { pack: 'crowd' },
  {
    changes: [
      { scope: 'site', window: null, from: 'normal', to: 'commute_disruption', fired: [], blocked: [], inputs: [] }
    ]
  },
  {
    changes: [
      {
        scope: 'wave',
        window: { kind: 'commute', date: '2026-11-02', start_myt: '14:00', end_myt: '15:30' },
        from: 'commute_disruption',
        to: 'normal',
        fired: [],
        blocked: [],
        inputs: []
      }
    ]
  }
])('ANL2 excludes %j', (patch) => {
  const r = rig()
  r.data.crossings = [crossing(patch)]
  expect(grade(r).cells[8]).toBe(false)
})
test.each(['{', '{}', '{"pack":"sky","replay":false,"changes":[{}]}'])(
  'malformed live crossings cannot claim absence %s',
  (text) => {
    const r = rig()
    r.data.crossings = [{ ...crossing(), text }]
    expect(grade(r).report.problems.length).toBeGreaterThan(0)
    expect(r.sheet.size).toBe(0)
  }
)
test('identical public definitions collapse, conflicts defer, partial grades suppress', () => {
  const r = rig()
  r.data.windows = [windowRow, { ...windowRow }]
  expect(grade(r).report.appendedGrades).toBe(1)
  const s = rig()
  s.data.windows = [windowRow, { ...windowRow, end_myt: '15:35' }]
  expect(grade(s).report.deferredWindows).toBe(1)
  const t = rig()
  t.sheet.set(5, ['', 'wave'])
  expect(grade(t).report.alreadyGradedWindows).toBe(1)
  expect(t.ids).toBe(0)
})
test('close is strict and real calendar dates govern eligibility', () => {
  const r = rig()
  r.ports.now = () => new Date('2026-11-02T16:30:00+08:00')
  expect(grade(r).report.closedWindows).toBe(0)
  const s = rig()
  s.data.windows = [{ ...windowRow, date: '2026-02-30' }]
  expect(grade(s).report.appendedGrades).toBe(0)
})
test('version cutoff, physical ties, exact hash and corrupt selected version never fall back', () => {
  const a = version()
  const b = version(clauses.map((r) => ({ ...r, wording_en: 'second' })))
  expect(b.content_hash).not.toBe(a.content_hash)
  const future = version(clauses, '2026-12-01T00:00:00Z')
  const close = new Date('2026-11-02T16:30:00+08:00')
  expect(selectSkyGradeVersion([a, b, future], close, hash)).toMatchObject({
    status: 'valid',
    version: { hash: b.content_hash }
  })
  for (const bad of [
    { ...b, content_hash: '0'.repeat(64) },
    { ...b, content_json: '{}', content_hash: hash('{}') },
    { ...b, content_json: '[{}]', content_hash: hash('[{}]') }
  ])
    expect(selectSkyGradeVersion([a, bad], close, hash).status).toBe('invalid')
  expect(selectSkyGradeVersion([future], close, hash).status).toBe('missing')
})
test.each(['save-before', 'save-after', 'apply-before', 'apply-after', 'clear-before', 'clear-after'])(
  'durable recovery after %s',
  (fault) => {
    const r = rig()
    r.fault(fault)
    const first = grade(r).report
    expect(first.problems.length).toBeGreaterThan(0)
    const original = r.applied[0]
    r.fault('')
    const second = grade(r).report
    expect(r.sheet.size).toBe(1)
    expect(r.raw).toBe(null)
    if (fault !== 'save-before') expect(r.ids).toBe(1)
    if (fault === 'apply-after' || fault === 'clear-before') expect(second.reconciledGrades).toBe(1)
    if (original) expect(r.sheet.get(1)?.[0]).toBe(original.rows[0]!.grade_id)
  }
)
test('pending recovery precedes input reads and ambiguous writes freeze IDs/targets', () => {
  const r = rig()
  r.fault('apply-before')
  grade(r)
  const frozen = r.raw!
  r.data.readings = []
  r.fault('inputs')
  const result = grade(r).report
  expect(result.appendedGrades).toBe(1)
  expect(r.sheet.get(1)?.[5]).toBe('commute_disruption')
  expect(r.ids).toBe(1)
  expect(r.applied[1]).toEqual(decodeSkyGradeBatch(frozen))
})
test('changed owned cells, partial receipts and wrong target block pending writes', () => {
  for (const conflict of ['changed', 'partial', 'workbook', 'tab', 'corrupt']) {
    const r = rig()
    r.fault('apply-before')
    grade(r)
    r.fault('')
    const b = decodeSkyGradeBatch(r.raw!)
    if (conflict === 'changed')
      r.sheet.set(
        1,
        ownedSkyGradeCells(b.rows[0]!).map((c, i) => (i === 7 ? 'changed' : c))
      )
    if (conflict === 'partial') r.sheet.set(1, [b.rows[0]!.grade_id])
    if (conflict === 'workbook') r.ports.gradeTarget = () => ({ spreadsheetId: 'other', sheetId: 4 })
    if (conflict === 'tab') r.ports.gradeTarget = () => ({ spreadsheetId: 'workbook', sheetId: 9 })
    if (conflict === 'corrupt') r.setRaw('{')
    const result = grade(r).report
    expect(result.pendingBatch).toBe(true)
    expect(result.problems.length).toBeGreaterThan(0)
    expect(r.inputReads).toBe(1)
    expect(r.applied).toHaveLength(1)
  }
})
test('delayed original request only reapplies frozen coordinates, preserving explanations and subsequent batch', () => {
  const r = rig()
  r.explanations.set(1, 'human')
  r.fault('apply-before')
  grade(r)
  const original = r.applied[0]!
  r.fault('')
  r.data.windows = [windowRow, { ...windowRow, window_id: 'second' }]
  r.stale()
  grade(r)
  expect(r.sheet.size).toBe(2)
  expect(r.sheet.get(2)?.[1]).toBe('second')
  r.ports.applyBatch(original)
  expect(r.sheet.size).toBe(2)
  expect(r.sheet.get(2)?.[1]).toBe('second')
  expect(r.explanations.get(1)).toBe('human')
  expect(r.ids).toBe(2)
})
test('splits fitting batches and reports oversized single rows without dropping later windows', () => {
  const r = rig()
  r.data.windows = Array.from({ length: 30 }, (_, i) => ({ ...windowRow, window_id: `window-${i}` }))
  r.data.windows = [{ ...windowRow, window_id: '漢'.repeat(3000) }, ...r.data.windows]
  const result = grade(r).report
  expect(result.appendedGrades).toBe(30)
  expect(result.deferredWindows).toBe(1)
  expect(r.applied.length).toBeGreaterThan(1)
  expect(new Set([...r.sheet.values()].map((c) => c[1])).size).toBe(30)
  for (const b of r.applied) expect(Buffer.byteLength(encodeSkyGradeBatch(b))).toBeLessThanOrEqual(8192)
})
test('newly prepared target mismatch never saves or applies', () => {
  const r = rig()
  const prepare = r.ports.prepareBatch
  r.ports.prepareBatch = (rows) => ({ ...prepare(rows), spreadsheetId: 'wrong' })
  expect(grade(r).report.problems.length).toBeGreaterThan(0)
  expect(r.raw).toBe(null)
  expect(r.sheet.size).toBe(0)
})
test('slow reads gate fresh work honestly while pending recovery still gets a chance', () => {
  const r = rig()
  r.fault('slow-inputs')
  const result = grade(r).report
  expect(result.budgetExhausted).toBe(true)
  expect(result.closedWindows).toBe(0)
  expect(r.ids).toBe(0)
  const s = rig()
  s.fault('apply-before')
  grade(s)
  s.fault('')
  const read = s.ports.pendingBatch
  s.ports.pendingBatch = () => {
    s.advance()
    return read()
  }
  expect(grade(s).report.appendedGrades).toBe(1)
})
test('saved blank Sky pack follows evaluator identity semantics and receiver-bound hash works', () => {
  const r = rig()
  r.data.clauseVersions = [version(clauses.map((row) => ({ ...row, pack: '' })))]
  r.ports.hashId = function (raw) {
    expect(this).toBe(r.ports)
    return hash(raw)
  }
  expect(grade(r).cells?.[5]).toBe('commute_disruption')
})
test('preparation cannot mutate computed rows before frozen intent', () => {
  const r = rig()
  const prepare = r.ports.prepareBatch
  r.ports.prepareBatch = (rows) => {
    try {
      rows[0]!.observed_mode = 'normal'
    } catch {}
    return prepare(rows)
  }
  expect(grade(r).cells[5]).toBe('commute_disruption')
})
test('live crossing metadata requires a real identity and version', () => {
  for (const patch of [{ crossing_id: {} }, { clause_version: {} }, { clause_version: undefined }]) {
    const r = rig()
    r.data.crossings = [crossing(patch)]
    const result = grade(r)
    expect(result.report.problems.length).toBeGreaterThan(0)
    expect(r.sheet.size).toBe(0)
  }
})
test('mixed exact/empty batch receipts block and explanation changes do not block exact receipt cleanup', () => {
  const r = rig()
  r.data.windows = [windowRow, { ...windowRow, window_id: 'two' }]
  r.fault('apply-before')
  grade(r)
  const b = r.applied[0]!
  r.sheet.set(1, [...ownedSkyGradeCells(b.rows[0]!)])
  r.fault('')
  expect(grade(r).report.problems).toContainEqual({ code: 'batch_receipt_conflict' })
  expect(r.sheet.size).toBe(1)
  r.sheet.set(2, [...ownedSkyGradeCells(b.rows[1]!)])
  r.explanations.set(1, 'updated explanation')
  expect(grade(r).report.reconciledGrades).toBe(2)
  expect(r.explanations.get(1)).toBe('updated explanation')
})
test('cleanup validates the exact frozen identity and keeps unknown intent blocked', () => {
  const r = rig()
  const apply = r.ports.applyBatch
  r.ports.applyBatch = (b) => {
    apply(b)
    r.setRaw(encodeSkyGradeBatch({ ...b, rows: b.rows.map((row) => ({ ...row, mode_diff: 'changed' })) }))
  }
  const result = grade(r).report
  expect(result.appendedGrades).toBe(1)
  expect(result.pendingBatch).toBe(true)
  expect(result.problems).toContainEqual({ code: 'batch_cleanup_identity' })
})
test('camera diagnostics do not defer valid observations and actual target binds eligibility', () => {
  function cameraRig() {
    const r = rig()
    r.data.clauseVersions = [
      version(defaultSkyClauseRows().map((row) => (row.key === 'haze_severe' ? { ...row, enabled: false } : row)))
    ]
    r.data.sources = [
      ...r.data.sources,
      ...['CA16W', 'CA19B', 'CA17W'].map((source_id) => ({ source_id, kind: 'apims', stale_after_min: 120 })),
      { source_id: 'cam', kind: 'camera', stale_after_min: 30, probation: false }
    ]
    r.data.readings = [
      ...gauge.map((row) => ({ ...row, value: 0 })),
      ...['CA16W', 'CA19B', 'CA17W'].map((source_id) => ({
        source_id,
        metric: 'api',
        observed_at: '2026-11-02T16:00:00+08:00',
        received_at: '2026-11-07T20:00:00+08:00',
        value: 50,
        revision: 1
      })),
      ...['16:10', '16:20', '16:30'].map((clock) => ({
        source_id: 'cam',
        metric: 'contrast_far',
        observed_at: `2026-11-02T${clock}:00+08:00`,
        received_at: `2026-11-02T${clock}:00+08:00`,
        value: 0.2,
        revision: 1
      }))
    ]
    r.data.daylight = { start: '07:15', end: '19:00' }
    r.data.cameraHistory = {
      version: 1,
      spreadsheetId: 'workbook',
      decisions: [{ sourceId: 'cam', at: '2026-11-02T07:00:00.000Z', passed: true }]
    }
    return r
  }
  const valid = cameraRig()
  expect(grade(valid).cells[5]).toBe('outdoor_limited')
  const invalid = cameraRig()
  invalid.data.cameraHistory!.spreadsheetId = 'wrong'
  const { cells, report } = grade(invalid)
  expect(cells[5]).toBe('normal')
  expect(report.deferredWindows).toBe(0)
  expect(report.problems).toContainEqual({ code: 'camera_history_invalid', windowId: 'wave' })
  const missing = cameraRig()
  missing.data.cameraHistory = null
  missing.data.readings = [...gauge, ...missing.data.readings.filter((row) => row.source_id !== '0232901RF')]
  expect(grade(missing).cells[5]).toBe('commute_disruption')
})
test('grade IDs already present in partial legacy receipts or generated this run never get reused', () => {
  const r = rig()
  r.sheet.set(5, ['019a4df0-0000-7000-8000-000000000001', 'old'])
  expect(grade(r).report.deferredWindows).toBe(1)
  expect(r.sheet.size).toBe(1)
  const s = rig()
  s.data.windows = [windowRow, { ...windowRow, window_id: 'two' }]
  s.ports.newGradeId = () => '019a4df0-0000-7000-8000-000000000001'
  const result = grade(s).report
  expect(result.appendedGrades).toBe(1)
  expect(result.deferredWindows).toBe(1)
  expect(s.sheet.size).toBe(1)
})
test('slow version hashing stops before evaluating and allocating a fresh grade', () => {
  const r = rig()
  r.ports.hashId = (text) => {
    r.advance()
    return hash(text)
  }
  const result = grade(r).report
  expect(result.budgetExhausted).toBe(true)
  expect(result.plannedGrades).toBe(0)
  expect(r.ids).toBe(0)
})
