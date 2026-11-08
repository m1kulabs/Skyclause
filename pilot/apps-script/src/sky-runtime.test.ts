import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { defaultSkyClauseRows } from './clauses.ts'
import type { PlannedSkyCrossingFile } from './crossings.ts'
import { computeSkySnapshot, type SkySnapshot } from './indicators.ts'
import type { Row } from './schema.ts'
import {
  runClauseEditHandler,
  runSkyClauseTick,
  type ClauseEditEventInput,
  type ClauseEditHandlerPorts,
  type SkyClauseRuntimePorts,
  type SkyClauseStorePort,
  type SkyClauseTickInput
} from './sky-runtime.ts'

interface JpsCaptureFile {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}
const jpsCapture = JSON.parse(
  readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
) as JpsCaptureFile
const T_EVAL = '2026-11-02T15:05:00+08:00'
const RECORDED_AT = '2026-11-02T15:05:09+08:00'
function buildWave1530(): Row<'windows'> {
  return {
    window_id: 'W-20261102-01',
    subscriber_id: 'test-subscriber',
    kind: 'commute_wave',
    date: '2026-11-02',
    start_myt: '15:30',
    end_myt: '15:30',
    language: 'en',
    status: 'active',
    declared_at: '2026-11-02T08:00:00+08:00'
  }
}
function build2NovSnapshotAt1505(): SkySnapshot {
  const specs = [
    ['0232901RF', 'jps_rain', 5, 10, 'observed'],
    ['CA16W', 'apims', 60, 120, 'observed'],
    ['CA19B', 'apims', 60, 120, 'observed'],
    ['CA17W', 'apims', 60, 120, 'observed'],
    ['met_warning', 'met_warning', 10, 20, 'polled']
  ] as const
  const sources: Row<'sources'>[] = specs.map(([source_id, kind, cadence_min, stale_after_min, freshness]) => ({
    source_id,
    kind,
    name: source_id,
    cadence_min,
    stale_after_min,
    freshness,
    state: 'fresh',
    state_since: '2026-11-02T14:00:00+08:00',
    probation: false
  }))
  const readings: Row<'readings'>[] = jpsCapture.data
    .filter((r) => r.timestamp <= '2026-11-02T15:00:00')
    .map((r) => ({
      reading_id: `test-jps-${r.timestamp}`,
      source_kind: 'jps_rain',
      source_id: jpsCapture.stationId,
      metric: 'rain_5m_mm',
      observed_at: r.timestamp + '+08:00',
      received_at: T_EVAL,
      value: r.rf,
      unit: 'mm',
      poll_id: 'test-jps-poll',
      revision: 1
    }))
  for (const source_id of ['CA16W', 'CA19B', 'CA17W'])
    readings.push({
      reading_id: `test-api-${source_id}`,
      source_kind: 'apims',
      source_id,
      metric: 'api',
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: T_EVAL,
      value: 52,
      unit: 'API',
      poll_id: 'test-apims-poll',
      revision: 1
    })
  const polls: Row<'polls'>[] = [
    { source_kind: 'jps_rain', source_id: '0232901RF', poll_id: 'test-jps-poll' },
    { source_kind: 'apims', source_id: 'apims', poll_id: 'test-apims-poll' },
    { source_kind: 'met_warning', source_id: 'met_warning', poll_id: 'test-met-poll' }
  ].map((row) => ({ ...row, started_at: T_EVAL, received_at: T_EVAL, outcome: 'ok', new_rows: 0 }))
  return computeSkySnapshot({
    tEval: T_EVAL,
    sources,
    readings,
    polls,
    warnings: [],
    forecast: [],
    windows: [buildWave1530()],
    daylight: { start: '07:15', end: '19:00' }
  })
}

function buildCrowdRow(): Row<'clauses'> {
  return {
    pack: 'crowd',
    Clause: 'Queue watch',
    Reads: 'Manual gate count',
    'Fires when (default)': 'gate queue > 40',
    Proposes: 'Watch only',
    key: 'crowd_queue_watch',
    requires: 'gate_queue',
    span_from: '-60',
    span_to: '30',
    threshold: '40',
    op: '>',
    proposes_key: 'watch',
    rank: 1,
    wording_en: 'Crowd queue watch active.',
    enabled: true
  }
}

function canonicalJson(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString()
    if (Array.isArray(v)) return v.map(normalize)
    if (v !== null && typeof v === 'object') {
      const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      const out: Record<string, unknown> = {}
      for (const [k, val] of entries) {
        out[k] = normalize(val)
      }
      return out
    }
    return v
  }
  return JSON.stringify(normalize(value))
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

interface InMemoryHarness {
  clauses: Row<'clauses'>[]
  clauseVersions: Row<'clause_versions'>[]
  shadow: Row<'shadow'>[]
  shadowState: Row<'shadow_state'>[]
  ledgerFull: Row<'ledger'>[]
  crossings: PlannedSkyCrossingFile[]
  ops: string[]
  readTabs: string[]
  appendTabs: string[]
  replaceTabs: string[]
  store: SkyClauseStorePort
  ports: SkyClauseRuntimePorts
}

function createHarness(initial?: {
  clauses?: Row<'clauses'>[]
  clauseVersions?: Row<'clause_versions'>[]
  shadow?: Row<'shadow'>[]
  shadowState?: Row<'shadow_state'>[]
  ledgerFull?: Row<'ledger'>[]
  crossings?: PlannedSkyCrossingFile[]
  peerReservations?: string[]
}): InMemoryHarness {
  const clauses = structuredClone(initial?.clauses ?? [])
  const clauseVersions = structuredClone(initial?.clauseVersions ?? [])
  const shadow = structuredClone(initial?.shadow ?? [])
  const shadowState = structuredClone(initial?.shadowState ?? [])
  const ledgerFull = structuredClone(initial?.ledgerFull ?? [])
  const crossings = structuredClone(initial?.crossings ?? [])
  const ops: string[] = []
  const readTabs: string[] = []
  const appendTabs: string[] = []
  const replaceTabs: string[] = []

  const store: SkyClauseStorePort = {
    readRows<T extends 'clauses' | 'clause_versions' | 'shadow_state' | 'ledger'>(tab: T): readonly Row<T>[] {
      readTabs.push(tab)
      ops.push(`read:${tab}`)
      if (tab === 'clauses') return structuredClone(clauses) as unknown as readonly Row<T>[]
      if (tab === 'clause_versions') {
        return structuredClone(clauseVersions) as unknown as readonly Row<T>[]
      }
      if (tab === 'shadow_state') {
        return structuredClone(shadowState) as unknown as readonly Row<T>[]
      }
      if (tab === 'ledger') {
        // Projection containing only entry_id and source_ref so retry logic never depends on body/recipient_ids
        return ledgerFull.map((row) => ({
          entry_id: row.entry_id,
          source_ref: row.source_ref
        })) as unknown as readonly Row<T>[]
      }
      throw new Error(`Unexpected read tab: ${String(tab)}`)
    },
    appendRows<T extends 'clauses' | 'clause_versions' | 'ledger'>(tab: T, rows: readonly Row<T>[]): void {
      appendTabs.push(tab)
      ops.push(`append:${tab}:${rows.length}`)
      if (tab === 'clauses') {
        clauses.push(...(structuredClone(rows) as Row<'clauses'>[]))
        return
      }
      if (tab === 'clause_versions') {
        clauseVersions.push(...(structuredClone(rows) as Row<'clause_versions'>[]))
        return
      }
      if (tab === 'ledger') {
        ledgerFull.push(...(structuredClone(rows) as Row<'ledger'>[]))
        return
      }
      throw new Error(`Unexpected append tab: ${String(tab)}`)
    },
    replaceRows<T extends 'shadow' | 'shadow_state'>(tab: T, rows: readonly Row<T>[]): void {
      replaceTabs.push(tab)
      ops.push(`replace:${tab}:${rows.length}`)
      if (tab === 'shadow') {
        shadow.splice(0, shadow.length, ...(structuredClone(rows) as Row<'shadow'>[]))
        return
      }
      if (tab === 'shadow_state') {
        shadowState.splice(0, shadowState.length, ...(structuredClone(rows) as Row<'shadow_state'>[]))
        return
      }
      throw new Error(`Unexpected replace tab: ${String(tab)}`)
    }
  }

  const ports: SkyClauseRuntimePorts = {
    store,
    canonicalJson,
    sha256,
    reservedCrossingNames: () => initial?.peerReservations ?? [],
    listCrossings(): readonly PlannedSkyCrossingFile[] {
      ops.push('listCrossings')
      return structuredClone(crossings)
    },
    createCrossing(file: PlannedSkyCrossingFile): void {
      ops.push(`createCrossing:${file.filename}`)
      crossings.push(structuredClone(file))
    }
  }

  return {
    clauses,
    clauseVersions,
    shadow,
    shadowState,
    ledgerFull,
    crossings,
    ops,
    readTabs,
    appendTabs,
    replaceTabs,
    store,
    ports
  }
}

function buildTickInput(overrides?: Partial<SkyClauseTickInput>): SkyClauseTickInput {
  return {
    tEval: T_EVAL,
    recordedAt: RECORDED_AT,
    editor: null,
    snapshot: build2NovSnapshotAt1505(),
    windows: [buildWave1530()],
    trigger: 'schedule',
    ...overrides
  }
}

describe('Sky runtime versioning and durable crossing coordination', () => {
  test('reserves a same-stamp Crowd identity and carries the allocated ID into state', () => {
    const harness = createHarness()
    harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-01.json']
    runSkyClauseTick(buildTickInput(), harness.ports)
    expect(harness.crossings[0]?.filename).toBe('crossing-20261102-1505-02.json')
    expect(harness.shadowState.some((r) => r.last_crossing_id === 'X-20261102-1505-02')).toBe(true)
  })

  test('ignores different-stamp peers and extends the same-stamp maximum rather than filling gaps', () => {
    const harness = createHarness({
      peerReservations: ['crossing-20261102-1435-99.json', 'crossing-20261102-1505-03.json']
    })
    runSkyClauseTick(buildTickInput(), harness.ports)
    expect(harness.crossings[0]?.filename).toBe('crossing-20261102-1505-04.json')
    const different = createHarness({ peerReservations: ['crossing-20261102-1435-99.json'] })
    runSkyClauseTick(buildTickInput(), different.ports)
    expect(different.crossings[0]?.filename).toBe('crossing-20261102-1505-01.json')
  })

  test('reuses its persisted crossing before considering higher peer ordinals and rejects a claimed reusable identity', () => {
    const harness = createHarness()
    const create = harness.ports.createCrossing
    harness.ports.createCrossing = (file) => {
      create(file)
      throw new Error('Drive timeout after persisting crossing file')
    }
    expect(() => runSkyClauseTick(buildTickInput(), harness.ports)).toThrow(
      'Drive timeout after persisting crossing file'
    )
    harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-09.json']
    const retry = runSkyClauseTick(buildTickInput(), harness.ports)
    expect(retry.fileReused).toBe(true)
    expect(retry.plan.crossing?.document.crossing_id).toBe('X-20261102-1505-01')
    expect(harness.crossings).toHaveLength(1)
    harness.shadowState.splice(0)
    const stateBefore = structuredClone(harness.shadowState)
    harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-01.json']
    expect(() => runSkyClauseTick(buildTickInput(), harness.ports)).toThrow(/reserved|ambiguous/i)
    expect(harness.crossings).toHaveLength(1)
    expect(harness.shadowState).toEqual(stateBefore)
  })

  test('does not read peer reservations when the verdict produces no crossing', () => {
    const harness = createHarness()
    runSkyClauseTick(buildTickInput(), harness.ports)
    harness.ports.reservedCrossingNames = () => {
      throw new Error('unexpected reservation read')
    }
    expect(runSkyClauseTick(buildTickInput(), harness.ports).plan.crossing).toBeNull()
  })

  test('rejects reuse when a peer claims the actual JSON ID of a differently named own file', () => {
    const harness = createHarness()
    runSkyClauseTick(buildTickInput(), harness.ports)
    harness.crossings[0]!.document.crossing_id = 'X-20261102-1505-03'
    harness.shadowState.splice(0)
    harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-03.json']
    const filesBefore = structuredClone(harness.crossings)
    const stateBefore = structuredClone(harness.shadowState)

    expect(() => runSkyClauseTick(buildTickInput(), harness.ports)).toThrow(/reserved|ambiguous/i)
    expect(harness.crossings).toEqual(filesBefore)
    expect(harness.shadowState).toEqual(stateBefore)
  })

  test('preserves existing mismatched own metadata reuse when neither actual claim is peer-reserved', () => {
    const harness = createHarness()
    runSkyClauseTick(buildTickInput(), harness.ports)
    harness.crossings[0]!.document.crossing_id = 'X-20261102-1505-03'
    harness.shadowState.splice(0)
    harness.ports.reservedCrossingNames = () => ['crossing-20261102-1505-09.json']
    const filesBefore = structuredClone(harness.crossings)

    const retry = runSkyClauseTick(buildTickInput(), harness.ports)
    expect(retry.fileReused).toBe(true)
    expect(retry.fileCreated).toBe(false)
    expect(retry.plan.crossing?.document.crossing_id).toBe('X-20261102-1505-01')
    expect(harness.crossings).toEqual(filesBefore)
  })

  test('rejects unsafe peer sequence calculations before file creation', () => {
    const harness = createHarness({ peerReservations: ['crossing-20261102-1505-9007199254740991.json'] })
    expect(() => runSkyClauseTick(buildTickInput(), harness.ports)).toThrow(/sequence/i)
    expect(harness.crossings).toHaveLength(0)
    expect(harness.shadowState).toHaveLength(0)
  })

  test('bootstraps 6 default Sky rows while preserving Crowd row, logs version 1 and ledger entry, writes shadow then crossing then state without mutating input', () => {
    const harness = createHarness({ clauses: [buildCrowdRow()] })
    const input = buildTickInput()
    const snapshotBefore = structuredClone(input.snapshot)
    const windowsBefore = structuredClone(input.windows)

    expect(input.snapshot.evidenceByScope['W-20261102-01']!['w.rain_max_60m_mm']!.value).toBe(39)
    expect(input.snapshot.inputs.apims.state).toBe('fresh')
    const result = runSkyClauseTick(input, harness.ports)

    expect(input.snapshot).toEqual(snapshotBefore)
    expect(input.windows).toEqual(windowsBefore)

    // 1 existing crowd row + 6 default sky rows = 7 rows
    expect(harness.clauses).toHaveLength(7)
    expect(harness.clauses[0]).toEqual(buildCrowdRow())
    expect(harness.clauses.slice(1)).toEqual(defaultSkyClauseRows())

    // Version 1 recorded with editor 'system' on default bootstrap
    expect(harness.clauseVersions).toHaveLength(1)
    const v1 = harness.clauseVersions[0]!
    expect(v1.version_n).toBe(1)
    expect(v1.editor).toBe('system')
    expect(v1.saved_at).toBe(RECORDED_AT)
    expect(v1.content_hash).toBe(sha256(String(v1.content_json)))
    expect(result.version).toEqual(v1)

    // Ledger row recorded with deterministic CV entry_id and JSON body
    expect(harness.ledgerFull).toHaveLength(1)
    const ledgerRow = harness.ledgerFull[0]!
    expect(ledgerRow.entry_id).toBe(`CV-1-${v1.content_hash}`)
    expect(ledgerRow.kind).toBe('clause_version')
    expect(ledgerRow.pack).toBe('sky')
    expect(ledgerRow.source_ref).toBe('')
    expect(ledgerRow.recorded_at).toBe(RECORDED_AT)
    expect(JSON.parse(String(ledgerRow.body))).toEqual({
      version_n: 1,
      content_hash: v1.content_hash
    })

    // One crossing file created for W-20261102-01 commute (39 mm at 15:00) while site is normal
    expect(result.fileCreated).toBe(true)
    expect(result.fileReused).toBe(false)
    expect(harness.crossings).toHaveLength(1)
    const crossing = harness.crossings[0]!
    expect(crossing.filename).toBe('crossing-20261102-1505-01.json')
    expect(crossing.document.crossing_id).toBe('X-20261102-1505-01')
    expect(crossing.document.t_eval).toBe(T_EVAL)
    expect(crossing.document.clause_version).toBe(1)
    expect('replay_clause_content_json' in crossing.document).toBe(false)
    expect(crossing.document.changes).toHaveLength(1)
    expect(crossing.document.changes[0]?.scope).toBe('W-20261102-01')
    expect(crossing.document.changes[0]?.to).toBe('commute_disruption')

    // Shadow and shadow_state persisted for both scopes
    expect(harness.shadow).toHaveLength(2)
    expect(harness.shadowState).toHaveLength(2)
    expect(harness.shadowState.find((row) => row.scope === 'W-20261102-01')).toEqual({
      scope: 'W-20261102-01',
      verdict: 'commute_disruption',
      since: T_EVAL,
      last_crossing_id: 'X-20261102-1505-01'
    })
    expect(harness.shadowState.find((row) => row.scope === 'site')).toEqual({
      scope: 'site',
      verdict: 'normal',
      since: T_EVAL,
      last_crossing_id: ''
    })

    // Delivery state changes only after the file exists.
    const shadowIdx = harness.ops.findIndex((op) => op.startsWith('replace:shadow:'))
    const crossingIdx = harness.ops.findIndex((op) => op.startsWith('createCrossing:'))
    const stateIdx = harness.ops.findIndex((op) => op.startsWith('replace:shadow_state:'))
    expect(shadowIdx).toBeGreaterThanOrEqual(0)
    expect(crossingIdx).toBeGreaterThan(shadowIdx)
    expect(stateIdx).toBeGreaterThan(crossingIdx)
  })

  test('unchanged tick appends nothing; editing A -> B -> A creates versions 1, 2, 3 and ledger rows without reusing version 1', () => {
    const harness = createHarness({ clauses: [buildCrowdRow()] })
    const first = runSkyClauseTick(buildTickInput(), harness.ports)
    expect(first.version.version_n).toBe(1)
    const hashA = String(first.version.content_hash)

    // Repeat with unchanged clauses and snapshot at a later recordedAt
    const second = runSkyClauseTick(buildTickInput({ recordedAt: '2026-11-02T15:10:02+08:00' }), harness.ports)
    expect(second.version.version_n).toBe(1)
    expect(second.fileCreated).toBe(false)
    expect(second.fileReused).toBe(false)
    expect(harness.clauseVersions).toHaveLength(1)
    expect(harness.ledgerFull).toHaveLength(1)
    expect(harness.crossings).toHaveLength(1)
    expect(harness.shadowState.find((r) => r.scope === 'W-20261102-01')?.since).toBe(T_EVAL)
    expect(harness.shadowState.find((r) => r.scope === 'W-20261102-01')?.last_crossing_id).toBe('X-20261102-1505-01')

    // Permuting object key insertion order in clause rows does NOT create a new version
    harness.clauses[1] = {
      enabled: harness.clauses[1]!.enabled,
      wording_en: harness.clauses[1]!.wording_en,
      rank: harness.clauses[1]!.rank,
      proposes_key: harness.clauses[1]!.proposes_key,
      op: harness.clauses[1]!.op,
      threshold: harness.clauses[1]!.threshold,
      span_to: harness.clauses[1]!.span_to,
      span_from: harness.clauses[1]!.span_from,
      requires: harness.clauses[1]!.requires,
      key: harness.clauses[1]!.key,
      Proposes: harness.clauses[1]!.Proposes,
      'Fires when (default)': harness.clauses[1]!['Fires when (default)'],
      Reads: harness.clauses[1]!.Reads,
      Clause: harness.clauses[1]!.Clause,
      pack: harness.clauses[1]!.pack
    }
    const permuted = runSkyClauseTick(buildTickInput({ recordedAt: '2026-11-02T15:11:00+08:00' }), harness.ports)
    expect(permuted.version.version_n).toBe(1)
    expect(harness.clauseVersions).toHaveLength(1)

    // Edit A -> B (change wording on haze_watch; verdict at 15:05 remains unchanged)
    const originalWording = harness.clauses[1]!.wording_en
    harness.clauses[1]!.wording_en = 'Updated haze watch copy for convocation.'
    const third = runSkyClauseTick(
      buildTickInput({
        recordedAt: '2026-11-02T15:15:00+08:00',
        editor: '  ops.lead@apu.edu.my  '
      }),
      harness.ports
    )
    expect(third.version.version_n).toBe(2)
    expect(third.version.editor).toBe('ops.lead@apu.edu.my')
    expect(third.version.saved_at).toBe('2026-11-02T15:15:00+08:00')
    expect(third.version.content_hash).not.toBe(hashA)
    expect(third.fileCreated).toBe(false)
    expect(third.fileReused).toBe(false)
    expect(harness.clauseVersions).toHaveLength(2)
    expect(harness.ledgerFull).toHaveLength(2)
    expect(harness.ledgerFull[1]?.entry_id).toBe(`CV-2-${third.version.content_hash}`)
    expect(third.verdicts.every((v) => v.clauseVersion === 2)).toBe(true)

    // Revert B -> A (must create version 3 with hashA, never reusing historical version 1)
    harness.clauses[1]!.wording_en = originalWording
    const fourth = runSkyClauseTick(
      buildTickInput({
        recordedAt: '2026-11-02T15:20:00+08:00',
        editor: '   '
      }),
      harness.ports
    )
    expect(fourth.version.version_n).toBe(3)
    expect(fourth.version.editor).toBe('unknown')
    expect(fourth.version.content_hash).toBe(hashA)
    expect(harness.clauseVersions.map((v) => v.version_n)).toEqual([1, 2, 3])
    expect(harness.ledgerFull).toHaveLength(3)
    expect(harness.ledgerFull[2]?.entry_id).toBe(`CV-3-${hashA}`)
    expect(JSON.parse(String(harness.ledgerFull[2]?.body))).toEqual({
      version_n: 3,
      content_hash: hashA
    })
  })

  test('recovers idempotently when version append or ledger append fails after persisting', () => {
    // 4a: appendRows('clause_versions') persists row then throws before ledger append
    const harnessA = createHarness({ clauses: defaultSkyClauseRows() })
    let failVersionOnce = true
    const origAppendA = harnessA.store.appendRows.bind(harnessA.store)
    harnessA.store.appendRows = <T extends 'clauses' | 'clause_versions' | 'ledger'>(
      tab: T,
      rows: readonly Row<T>[]
    ): void => {
      origAppendA(tab, rows)
      if (tab === 'clause_versions' && failVersionOnce) {
        failVersionOnce = false
        throw new Error('Transient timeout after clause_versions append')
      }
    }

    expect(() => runSkyClauseTick(buildTickInput(), harnessA.ports)).toThrow(
      'Transient timeout after clause_versions append'
    )
    expect(harnessA.clauseVersions).toHaveLength(1)
    expect(harnessA.ledgerFull).toHaveLength(0)
    expect(harnessA.crossings).toHaveLength(0)

    const retryA = runSkyClauseTick(buildTickInput(), harnessA.ports)
    expect(retryA.version.version_n).toBe(1)
    expect(harnessA.clauseVersions).toHaveLength(1)
    expect(harnessA.ledgerFull).toHaveLength(1)
    expect(harnessA.ledgerFull[0]?.entry_id).toBe(`CV-1-${retryA.version.content_hash}`)
    expect(retryA.fileCreated).toBe(true)

    // 4b: appendRows('ledger') persists row then throws; retry sees entry_id via projection and skips duplicate append
    const harnessB = createHarness({ clauses: defaultSkyClauseRows() })
    let failLedgerOnce = true
    const origAppendB = harnessB.store.appendRows.bind(harnessB.store)
    harnessB.store.appendRows = <T extends 'clauses' | 'clause_versions' | 'ledger'>(
      tab: T,
      rows: readonly Row<T>[]
    ): void => {
      origAppendB(tab, rows)
      if (tab === 'ledger' && failLedgerOnce) {
        failLedgerOnce = false
        throw new Error('Transient timeout after ledger append')
      }
    }

    expect(() => runSkyClauseTick(buildTickInput(), harnessB.ports)).toThrow('Transient timeout after ledger append')
    expect(harnessB.clauseVersions).toHaveLength(1)
    expect(harnessB.ledgerFull).toHaveLength(1)
    expect(harnessB.crossings).toHaveLength(0)

    const retryB = runSkyClauseTick(buildTickInput(), harnessB.ports)
    expect(retryB.version.version_n).toBe(1)
    expect(harnessB.clauseVersions).toHaveLength(1)
    expect(harnessB.ledgerFull).toHaveLength(1)
    expect(retryB.fileCreated).toBe(true)
    expect(harnessB.crossings).toHaveLength(1)
  })

  test('recovers across crossing creation and shadow_state commit failures without duplicate files or lost transitions', () => {
    // 5a: createCrossing throws before persisting file -> shadow written, shadow_state NOT written
    const harnessA = createHarness({ clauses: defaultSkyClauseRows() })
    let failCrossingBeforePersist = true
    const origCreateA = harnessA.ports.createCrossing.bind(harnessA.ports)
    harnessA.ports.createCrossing = (file: PlannedSkyCrossingFile): void => {
      if (failCrossingBeforePersist) {
        failCrossingBeforePersist = false
        throw new Error('Drive folder write failed before file creation')
      }
      origCreateA(file)
    }

    expect(() => runSkyClauseTick(buildTickInput(), harnessA.ports)).toThrow(
      'Drive folder write failed before file creation'
    )
    expect(harnessA.shadow).toHaveLength(2)
    expect(harnessA.shadowState).toHaveLength(0)
    expect(harnessA.crossings).toHaveLength(0)

    const recoveredA = runSkyClauseTick(buildTickInput(), harnessA.ports)
    expect(recoveredA.fileCreated).toBe(true)
    expect(recoveredA.fileReused).toBe(false)
    expect(harnessA.crossings).toHaveLength(1)
    expect(harnessA.shadowState).toHaveLength(2)

    // 5b: createCrossing persists file then throws (or shadow_state replace throws before persisting) -> retry reuses existing file
    const harnessB = createHarness({ clauses: defaultSkyClauseRows() })
    let failCrossingAfterPersist = true
    const origCreateB = harnessB.ports.createCrossing.bind(harnessB.ports)
    harnessB.ports.createCrossing = (file: PlannedSkyCrossingFile): void => {
      origCreateB(file)
      if (failCrossingAfterPersist) {
        failCrossingAfterPersist = false
        throw new Error('Drive timeout after persisting crossing file')
      }
    }

    expect(() => runSkyClauseTick(buildTickInput(), harnessB.ports)).toThrow(
      'Drive timeout after persisting crossing file'
    )
    expect(harnessB.crossings).toHaveLength(1)
    expect(harnessB.shadowState).toHaveLength(0)

    const recoveredB = runSkyClauseTick(buildTickInput(), harnessB.ports)
    expect(recoveredB.fileCreated).toBe(false)
    expect(recoveredB.fileReused).toBe(true)
    expect(harnessB.crossings).toHaveLength(1)
    expect(harnessB.shadowState.find((r) => r.scope === 'W-20261102-01')?.last_crossing_id).toBe('X-20261102-1505-01')

    // 5c: replaceRows('shadow_state') persists state then throws -> retry converges with no new file
    const harnessC = createHarness({ clauses: defaultSkyClauseRows() })
    let failStateAfterCommit = true
    const origReplaceC = harnessC.store.replaceRows.bind(harnessC.store)
    harnessC.store.replaceRows = <T extends 'shadow' | 'shadow_state'>(tab: T, rows: readonly Row<T>[]): void => {
      origReplaceC(tab, rows)
      if (tab === 'shadow_state' && failStateAfterCommit) {
        failStateAfterCommit = false
        throw new Error('Sheet flush timeout after shadow_state commit')
      }
    }

    expect(() => runSkyClauseTick(buildTickInput(), harnessC.ports)).toThrow(
      'Sheet flush timeout after shadow_state commit'
    )
    expect(harnessC.crossings).toHaveLength(1)
    expect(harnessC.shadowState).toHaveLength(2)

    const recoveredC = runSkyClauseTick(buildTickInput(), harnessC.ports)
    expect(recoveredC.fileCreated).toBe(false)
    expect(recoveredC.fileReused).toBe(false)
    expect(harnessC.crossings).toHaveLength(1)
  })

  test('resolves crossing sequence numbers per t_eval stamp and carries sequence 02 ID into shadow_state on creation and reuse', () => {
    const earlierFile: PlannedSkyCrossingFile = {
      filename: 'crossing-20261102-1435-01.json',
      document: {
        crossing_id: 'X-20261102-1435-01',
        pack: 'sky',
        t_eval: '2026-11-02T14:35:00+08:00',
        clause_version: 1,
        snapshot_id: '2026-11-02T14:35:00+08:00',
        replay: false,
        changes: []
      }
    }

    const harness = createHarness({
      clauses: defaultSkyClauseRows(),
      crossings: [earlierFile]
    })

    // Earlier stamp at 14:35 does NOT consume sequence 01 at 15:05
    const firstAt1505 = runSkyClauseTick(buildTickInput(), harness.ports)
    expect(firstAt1505.fileCreated).toBe(true)
    expect(firstAt1505.plan.crossing?.filename).toBe('crossing-20261102-1505-01.json')
    expect(firstAt1505.plan.crossing?.document.crossing_id).toBe('X-20261102-1505-01')

    // Same t_eval: raise storm_confirmed threshold above39 so the pending commute call returns to Normal.
    // Fail shadow_state commit before persisting on first attempt so we also test reusing sequence 02 on retry
    const stormRow = harness.clauses.find((r) => r.key === 'storm_confirmed')!
    stormRow.threshold = 40

    let failStateBeforeCommit = true
    const origReplace = harness.store.replaceRows.bind(harness.store)
    harness.store.replaceRows = <T extends 'shadow' | 'shadow_state'>(tab: T, rows: readonly Row<T>[]): void => {
      if (tab === 'shadow_state' && failStateBeforeCommit) {
        failStateBeforeCommit = false
        throw new Error('Failed before committing shadow_state for seq 02')
      }
      origReplace(tab, rows)
    }

    expect(() =>
      runSkyClauseTick(
        buildTickInput({
          recordedAt: '2026-11-02T15:05:30+08:00',
          editor: 'duty.officer@apu.edu.my'
        }),
        harness.ports
      )
    ).toThrow('Failed before committing shadow_state for seq 02')

    // Sequence 02 file was created in Drive alongside 14:35-01 and 15:05-01
    expect(harness.crossings.map((c) => c.filename)).toEqual([
      'crossing-20261102-1435-01.json',
      'crossing-20261102-1505-01.json',
      'crossing-20261102-1505-02.json'
    ])
    expect(harness.crossings[2]?.document.crossing_id).toBe('X-20261102-1505-02')
    expect(harness.crossings[2]?.document.clause_version).toBe(2)

    // Retry reuses crossing-20261102-1505-02.json and writes X-20261102-1505-02 to shadow_state
    const retriedSeq2 = runSkyClauseTick(
      buildTickInput({
        recordedAt: '2026-11-02T15:05:45+08:00',
        editor: 'duty.officer@apu.edu.my'
      }),
      harness.ports
    )
    expect(retriedSeq2.fileCreated).toBe(false)
    expect(retriedSeq2.fileReused).toBe(true)
    expect(retriedSeq2.plan.crossing?.filename).toBe('crossing-20261102-1505-02.json')
    expect(retriedSeq2.plan.crossing?.document.crossing_id).toBe('X-20261102-1505-02')
    expect(harness.shadowState.find((r) => r.scope === 'W-20261102-01')?.verdict).toBe('normal')
    expect(harness.shadowState.find((r) => r.scope === 'W-20261102-01')?.last_crossing_id).toBe('X-20261102-1505-02')
  })

  test('enforces strict store tab discipline across reads, appends, and replacements', () => {
    const harness = createHarness()
    runSkyClauseTick(buildTickInput(), harness.ports)

    expect(new Set(harness.readTabs)).toEqual(new Set(['clauses', 'clause_versions', 'shadow_state', 'ledger']))
    expect(harness.readTabs.every((t) => ['clauses', 'clause_versions', 'shadow_state', 'ledger'].includes(t))).toBe(
      true
    )
    expect(harness.appendTabs.every((t) => ['clauses', 'clause_versions', 'ledger'].includes(t))).toBe(true)
    expect(harness.replaceTabs.every((t) => ['shadow', 'shadow_state'].includes(t))).toBe(true)
  })

  test('runClauseEditHandler filters non-target edits, locks once on valid clauses edit, normalizes editor, and propagates errors', () => {
    let lockCount = 0
    const savedEditors: string[] = []
    const ports: ClauseEditHandlerPorts = {
      configuredSheetId: 'SHEET-PROD-01',
      withLock<T>(action: () => T): T {
        lockCount += 1
        return action()
      },
      saveEditor(editor: string): void {
        savedEditors.push(editor)
      }
    }

    // Wrong workbookId -> ignored without lock
    expect(
      runClauseEditHandler({ workbookId: 'SHEET-OTHER', sheetName: 'clauses', editor: 'alice@apu.edu.my' }, ports)
    ).toBe(false)
    // Wrong sheetName -> ignored without lock
    expect(
      runClauseEditHandler({ workbookId: 'SHEET-PROD-01', sheetName: 'windows', editor: 'alice@apu.edu.my' }, ports)
    ).toBe(false)
    expect(lockCount).toBe(0)
    expect(savedEditors).toEqual([])

    // Matching workbook and clauses tab with explicit editor
    const matched = runClauseEditHandler(
      {
        workbookId: 'SHEET-PROD-01',
        sheetName: 'clauses',
        editor: '  coordinator@apu.edu.my '
      } satisfies ClauseEditEventInput,
      ports
    )
    expect(matched).toBe(true)
    expect(lockCount).toBe(1)
    expect(savedEditors).toEqual(['coordinator@apu.edu.my'])

    // Blank/null editor normalizes to 'unknown'
    expect(runClauseEditHandler({ workbookId: 'SHEET-PROD-01', sheetName: 'clauses', editor: '   ' }, ports)).toBe(true)
    expect(lockCount).toBe(2)
    expect(savedEditors).toEqual(['coordinator@apu.edu.my', 'unknown'])

    expect(runClauseEditHandler({ workbookId: 'SHEET-PROD-01', sheetName: 'clauses', editor: null }, ports)).toBe(true)
    expect(savedEditors.at(-1)).toBe('unknown')
    expect(lockCount).toBe(3)

    // Error inside saveEditor propagates out of withLock
    const failingPorts: ClauseEditHandlerPorts = {
      ...ports,
      saveEditor(): void {
        throw new Error('PropertiesService quota exceeded')
      }
    }
    expect(() =>
      runClauseEditHandler(
        { workbookId: 'SHEET-PROD-01', sheetName: 'clauses', editor: 'bob@apu.edu.my' },
        failingPorts
      )
    ).toThrow('PropertiesService quota exceeded')
    expect(lockCount).toBe(4)
  })
})

describe('Sky runtime historical version ledger reconciliation (#55)', () => {
  test('repairs missing CV ledger row for an older persisted version when clauses are edited before retry, without duplicating rows on subsequent ticks', () => {
    const harness = createHarness({ clauses: defaultSkyClauseRows() })
    let failFirstLedgerBeforePersist = true
    const origAppend = harness.store.appendRows.bind(harness.store)
    harness.store.appendRows = <T extends 'clauses' | 'clause_versions' | 'ledger'>(
      tab: T,
      rows: readonly Row<T>[]
    ): void => {
      if (tab === 'ledger' && failFirstLedgerBeforePersist) {
        failFirstLedgerBeforePersist = false
        throw new Error('Ledger write failed before persistence on version 1')
      }
      origAppend(tab, rows)
    }

    expect(() =>
      runSkyClauseTick(
        buildTickInput({
          recordedAt: '2026-11-02T15:05:09+08:00',
          editor: 'alice@apu.edu.my'
        }),
        harness.ports
      )
    ).toThrow('Ledger write failed before persistence on version 1')

    expect(harness.clauseVersions).toHaveLength(1)
    const v1 = structuredClone(harness.clauseVersions[0]!)
    expect(v1.version_n).toBe(1)
    expect(v1.editor).toBe('alice@apu.edu.my')
    expect(v1.saved_at).toBe('2026-11-02T15:05:09+08:00')
    expect(harness.ledgerFull).toHaveLength(0)

    // Owner edits clauses before the next tick runs, so version 1 is no longer the active hash
    harness.clauses[0]!.wording_en = 'Updated haze watch wording before version 1 ledger retry.'

    const second = runSkyClauseTick(
      buildTickInput({
        recordedAt: '2026-11-02T15:10:00+08:00',
        editor: 'bob@apu.edu.my'
      }),
      harness.ports
    )

    expect(second.version.version_n).toBe(2)
    expect(harness.clauseVersions).toHaveLength(2)
    expect(harness.clauseVersions[0]).toEqual(v1)
    const v2 = structuredClone(harness.clauseVersions[1]!)
    expect(v2.version_n).toBe(2)
    expect(v2.editor).toBe('bob@apu.edu.my')
    expect(v2.saved_at).toBe('2026-11-02T15:10:00+08:00')
    expect(v2.content_hash).not.toBe(v1.content_hash)

    expect(harness.ledgerFull.map((row) => row.entry_id)).toEqual([
      `CV-1-${v1.content_hash}`,
      `CV-2-${v2.content_hash}`
    ])
    expect(harness.ledgerFull[0]?.kind).toBe('clause_version')
    expect(harness.ledgerFull[0]?.pack).toBe('sky')
    expect(harness.ledgerFull[0]?.source_ref).toBe('')
    expect(harness.ledgerFull[0]?.recorded_at).toBe('2026-11-02T15:10:00+08:00')
    expect(harness.ledgerFull[0]?.snapshot_id ?? '').toBe('')
    expect(harness.ledgerFull[0]?.trigger ?? '').toBe('')
    expect(JSON.parse(String(harness.ledgerFull[0]?.body))).toEqual({
      version_n: 1,
      content_hash: v1.content_hash
    })
    expect(harness.ledgerFull[1]?.kind).toBe('clause_version')
    expect(harness.ledgerFull[1]?.pack).toBe('sky')
    expect(harness.ledgerFull[1]?.source_ref).toBe('')
    expect(harness.ledgerFull[1]?.recorded_at).toBe('2026-11-02T15:10:00+08:00')
    expect(JSON.parse(String(harness.ledgerFull[1]?.body))).toEqual({
      version_n: 2,
      content_hash: v2.content_hash
    })

    // Subsequent unchanged tick preserves both versions and appends no duplicate ledger rows
    const third = runSkyClauseTick(
      buildTickInput({
        recordedAt: '2026-11-02T15:15:00+08:00',
        editor: 'bob@apu.edu.my'
      }),
      harness.ports
    )
    expect(third.version.version_n).toBe(2)
    expect(harness.clauseVersions).toEqual([v1, v2])
    expect(harness.ledgerFull).toHaveLength(2)
    expect(harness.ledgerFull.map((row) => row.entry_id)).toEqual([
      `CV-1-${v1.content_hash}`,
      `CV-2-${v2.content_hash}`
    ])
  })
})
