import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import type { Row } from './schema.ts'
import { GAUGE_SOURCE_ID, type DaylightWindow, type SourceStateUpdate } from './indicators.ts'
import { executeEvaluationTick, runEvaluationTick, runSkyEvaluation, type SkyEvaluationStore } from './tick.ts'

interface JpsFixture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}

type ReadTab = 'sources' | 'readings' | 'polls' | 'warnings' | 'forecast' | 'windows' | 'indicators'

const DAYLIGHT: DaylightWindow = { start: '07:15', end: '19:00' }

const jpsFixture = JSON.parse(
  readFileSync(new URL('../../fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url), 'utf8')
) as JpsFixture

function buildJpsReadings(receivedAt = '2026-11-02T15:05:00+08:00', pollId = 'poll-jps-1505'): Row<'readings'>[] {
  return jpsFixture.data
    .map((point) => ({ point, observedAt: `${point.timestamp}+08:00` }))
    .filter(({ observedAt }) => observedAt.startsWith('2026-11-02T') && observedAt <= '2026-11-02T15:00:00+08:00')
    .map(({ point, observedAt }) => ({
      reading_id: `${jpsFixture.stationId}:rain_5m_mm:${observedAt}`,
      source_kind: 'jps_rain',
      source_id: jpsFixture.stationId,
      metric: 'rain_5m_mm',
      observed_at: observedAt,
      received_at: receivedAt,
      value: point.rf,
      unit: 'mm',
      http_status: 200,
      latency_ms: 120,
      poll_id: pollId,
      revision: 1
    }))
}

function buildGaugeSource(overrides: Row<'sources'> = {}): Row<'sources'> {
  return {
    source_id: GAUGE_SOURCE_ID,
    kind: 'jps_rain',
    name: 'Sg. Kuyoh di LRT Bukit Jalil',
    cadence_min: 5,
    stale_after_min: 10,
    freshness: 'observed',
    state: 'fresh',
    state_since: '2026-11-02T14:00:00+08:00',
    ...overrides
  }
}

function buildJpsPoll(overrides: Row<'polls'> = {}): Row<'polls'> {
  return {
    poll_id: 'poll-jps-1505',
    source_kind: 'jps_rain',
    source_id: GAUGE_SOURCE_ID,
    started_at: '2026-11-02T15:05:12+08:00',
    received_at: '2026-11-02T15:05:14+08:00',
    http_status: 200,
    latency_ms: 180,
    outcome: 'ok',
    new_rows: 1,
    ...overrides
  }
}

function buildCommuteWindow(overrides: Row<'windows'> = {}): Row<'windows'> {
  return {
    window_id: 'win-commute-20261102',
    subscriber_id: 'sub-1',
    kind: 'commute_wave',
    date: '2026-11-02',
    start_myt: '14:30',
    end_myt: '15:30',
    language: 'en',
    status: 'active',
    declared_at: '2026-11-02T08:00:00+08:00',
    title: 'Afternoon commute',
    ...overrides
  }
}

function createMemoryStore(seed: Partial<{ [K in ReadTab]: Row<K>[] }> = {}) {
  const tables: { [K in ReadTab]: Row<K>[] } & { now: Row<'now'>[] } = {
    sources: (seed.sources ?? [buildGaugeSource()]).map((r) => ({ ...r })),
    readings: (seed.readings ?? buildJpsReadings()).map((r) => ({ ...r })),
    polls: (seed.polls ?? [buildJpsPoll()]).map((r) => ({ ...r })),
    warnings: (seed.warnings ?? []).map((r) => ({ ...r })),
    forecast: (seed.forecast ?? []).map((r) => ({ ...r })),
    windows: (seed.windows ?? [buildCommuteWindow()]).map((r) => ({ ...r })),
    indicators: (seed.indicators ?? []).map((r) => ({ ...r })),
    now: []
  }
  const sourceUpdateCalls: SourceStateUpdate[][] = []

  const store: SkyEvaluationStore = {
    readRows<T extends ReadTab>(tab: T): Row<T>[] {
      return tables[tab].map((row) => ({ ...row })) as Row<T>[]
    },
    appendIndicators(rows: readonly Row<'indicators'>[]): void {
      tables.indicators.push(...rows.map((row) => ({ ...row })))
    },
    replaceNow(rows: readonly Row<'now'>[]): void {
      tables.now = rows.map((row) => ({ ...row }))
    },
    updateSourceStates(updates: readonly SourceStateUpdate[]): void {
      sourceUpdateCalls.push(updates.map((u) => ({ ...u })))
      for (const update of updates) {
        const target = tables.sources.find((s) => s.source_id === update.source_id)
        if (target) {
          target.state = update.state
          target.state_since = update.state_since
        }
      }
    }
  }

  return { store, tables, sourceUpdateCalls }
}

describe('tick runtime evaluation (#54)', () => {
  test('selects latest out-of-order strict JPS poll started_at, floors minute, computes snapshot, and updates store', () => {
    const { store, tables, sourceUpdateCalls } = createMemoryStore({
      polls: [
        buildJpsPoll({
          poll_id: 'poll-apims-later',
          source_kind: 'apims',
          source_id: 'CA16W',
          started_at: '2026-11-02T15:10:05+08:00',
          received_at: '2026-11-02T15:10:06+08:00'
        }),
        buildJpsPoll({
          poll_id: 'poll-jps-1505',
          started_at: '2026-11-02T15:05:12+08:00',
          received_at: '2026-11-02T15:05:14+08:00'
        }),
        buildJpsPoll({
          poll_id: 'poll-jps-1500',
          started_at: '2026-11-02T15:00:08+08:00',
          received_at: '2026-11-02T15:00:10+08:00'
        })
      ]
    })

    const snapshot = runSkyEvaluation({ store, daylight: DAYLIGHT })

    expect(snapshot.inputs.gauge.state).toBe('fresh')
    expect(snapshot.inputs.gauge.ageMin).toBe(5)
    expect(snapshot.inputs.apims.state).toBeNull()
    expect(snapshot.inputs.met.state).toBeNull()
    expect(snapshot.inputs.camera.state).toBeNull()

    const windowNow = tables.now.find((row) => row.scope === 'win-commute-20261102')
    expect(windowNow).toBeDefined()
    expect(windowNow?.snapshot_id).toBe('2026-11-02T15:05:00+08:00')
    expect(windowNow?.['w.rain_max_60m_mm']).toBe(39)
    expect(windowNow?.age_min_gauge).toBe(5)
    expect(windowNow?.state_gauge).toBe('fresh')
    expect(windowNow?.state_apims).toBe('')
    expect(windowNow?.state_met).toBe('')
    expect(windowNow?.state_camera).toBe('')

    expect(tables.indicators.length).toBeGreaterThan(0)
    const keys = tables.indicators.map((r) => `${r.snapshot_id}|${r.scope}|${r.name}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(tables.indicators.every((r) => r.snapshot_id === '2026-11-02T15:05:00+08:00')).toBe(true)
    const rain60 = tables.indicators.find((r) => r.scope === 'win-commute-20261102' && r.name === 'w.rain_max_60m_mm')
    expect(rain60).toMatchObject({ value: 39, age_min: 5, state: 'fresh' })

    for (const update of sourceUpdateCalls.flat()) {
      expect(Object.keys(update).sort()).toEqual(['source_id', 'state', 'state_since'])
    }
    expect(tables.sources[0]).toMatchObject({
      source_id: GAUGE_SOURCE_ID,
      kind: 'jps_rain',
      name: 'Sg. Kuyoh di LRT Bukit Jalil',
      cadence_min: 5,
      stale_after_min: 10,
      freshness: 'observed',
      state: 'fresh',
      state_since: '2026-11-02T14:00:00+08:00'
    })
  })

  test('does not duplicate indicator log rows when a manual tick repeats on the same JPS poll', () => {
    const { store, tables } = createMemoryStore()

    runSkyEvaluation({ store, daylight: DAYLIGHT })
    const countAfterFirst = tables.indicators.length
    expect(countAfterFirst).toBeGreaterThan(0)

    runSkyEvaluation({ store, daylight: DAYLIGHT })
    expect(tables.indicators).toHaveLength(countAfterFirst)
    const keys = tables.indicators.map((r) => `${r.snapshot_id}|${r.scope}|${r.name}`)
    expect(new Set(keys).size).toBe(countAfterFirst)
  })

  test('marks gauge error and blanks gauge outputs when a later error JPS poll is present', () => {
    const { store, tables, sourceUpdateCalls } = createMemoryStore({
      polls: [
        buildJpsPoll(),
        buildJpsPoll({
          poll_id: 'poll-jps-1510-err',
          started_at: '2026-11-02T15:10:09+08:00',
          received_at: '2026-11-02T15:10:11+08:00',
          http_status: 500,
          outcome: 'error',
          new_rows: 0,
          error: 'HTTP 500'
        })
      ]
    })

    const snapshot = runSkyEvaluation({ store, daylight: DAYLIGHT })

    expect(snapshot.inputs.gauge.state).toBe('error')
    expect(sourceUpdateCalls.flat()).toHaveLength(1)
    expect(Object.keys(sourceUpdateCalls.flat()[0]!).sort()).toEqual(['source_id', 'state', 'state_since'])
    const windowNow = tables.now.find((row) => row.scope === 'win-commute-20261102')
    expect(windowNow?.snapshot_id).toBe('2026-11-02T15:10:00+08:00')
    expect(windowNow?.state_gauge).toBe('error')
    expect(windowNow?.['w.rain_max_60m_mm']).toBe('')
    expect(tables.sources[0]).toMatchObject({
      source_id: GAUGE_SOURCE_ID,
      state: 'error',
      state_since: '2026-11-02T15:10:00+08:00'
    })
  })

  test('throws a clear prerequisite error when no strict JPS gauge poll exists', () => {
    const { store, tables } = createMemoryStore({
      polls: [
        buildJpsPoll({
          poll_id: 'poll-apims-only',
          source_kind: 'apims',
          source_id: 'CA16W'
        })
      ]
    })

    expect(() => runSkyEvaluation({ store, daylight: DAYLIGHT })).toThrow(/jps|poll|0232901RF/i)
    expect(tables.now).toHaveLength(0)
    expect(tables.indicators).toHaveLength(0)
  })

  test('propagates storage read and write failures', () => {
    const { store } = createMemoryStore()
    const failingWriteStore: SkyEvaluationStore = {
      ...store,
      replaceNow() {
        throw new Error('sheet write failed')
      }
    }

    expect(() => runSkyEvaluation({ store: failingWriteStore, daylight: DAYLIGHT })).toThrow('sheet write failed')
    const failingReadStore: SkyEvaluationStore = {
      ...store,
      readRows() {
        throw new Error('sheet read failed')
      }
    }
    expect(() => runSkyEvaluation({ store: failingReadStore, daylight: DAYLIGHT })).toThrow('sheet read failed')
  })

  test('freezes reading availability at the selected poll completion on a manual tick', () => {
    const { store, tables } = createMemoryStore()
    const latest = tables.readings.find((row) => row.observed_at === '2026-11-02T15:00:00+08:00')!
    tables.readings.push({
      ...latest,
      value: 99,
      revision: 2,
      received_at: '2026-11-02T15:06:00+08:00',
      poll_id: 'unfinished-later-poll'
    })
    runSkyEvaluation({ store, daylight: DAYLIGHT })
    expect(tables.now.find((row) => row.scope === 'win-commute-20261102')?.['w.rain_max_60m_mm']).toBe(39)
  })

  test('normalizes Sheets day and time-only Date cells without leaking the 1899 serial epoch', () => {
    const variants: Row<'windows'>[] = [
      buildCommuteWindow({
        date: new Date('2026-11-02T00:00:00+08:00'),
        start_myt: new Date('1899-12-30T14:30:00+08:00'),
        end_myt: new Date('1899-12-30T15:30:00+08:00')
      }),
      buildCommuteWindow({
        date: '2026-11-02T00:00:00+08:00',
        start_myt: '1899-12-30T14:30:00+08:00',
        end_myt: '1899-12-30T15:30:00+08:00'
      })
    ]
    for (const window of variants) {
      const { store, tables } = createMemoryStore({ windows: [window] })
      runSkyEvaluation({ store, daylight: DAYLIGHT })
      const row = tables.now.find((row) => row.scope === 'win-commute-20261102')
      expect(row?.span_from).toBe('2026-11-02T15:00:00+08:00')
      expect(row?.['w.rain_max_60m_mm']).toBe(39)
    }
  })

  test('requires SHEET_ID in executeEvaluationTick and runEvaluationTick when unconfigured', () => {
    const globals = globalThis as unknown as Record<string, unknown>
    const oldProperties = globals.PropertiesService
    const oldLock = globals.LockService
    globals.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) }
    globals.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
    try {
      expect(() => executeEvaluationTick()).toThrow(/SHEET_ID/)
      expect(() => runEvaluationTick()).toThrow(/SHEET_ID/)
    } finally {
      if (oldProperties === undefined) delete globals.PropertiesService
      else globals.PropertiesService = oldProperties
      if (oldLock === undefined) delete globals.LockService
      else globals.LockService = oldLock
    }
  })
})

describe('tick onSnapshot callback seam (#55)', () => {
  test('invokes onSnapshot once after #54 persistence with the exact snapshot, normalized A-I windows, and fixed poll minute without extra table reads', () => {
    const { store, tables, sourceUpdateCalls } = createMemoryStore({
      sources: [
        buildGaugeSource({
          state: 'stale',
          state_since: '2026-11-02T14:50:00+08:00'
        })
      ],
      windows: [
        buildCommuteWindow({
          date: new Date('2026-11-02T00:00:00+08:00'),
          start_myt: new Date('1899-12-30T14:30:00+08:00'),
          end_myt: new Date('1899-12-30T15:30:00+08:00'),
          declared_at: new Date('2026-11-02T08:00:00+08:00')
        })
      ]
    })

    const readTabs: ReadTab[] = []
    const events: string[] = []
    const trackedStore: SkyEvaluationStore = {
      readRows<T extends ReadTab>(tab: T): Row<T>[] {
        readTabs.push(tab)
        events.push(`read:${tab}`)
        return store.readRows(tab)
      },
      replaceNow(rows: readonly Row<'now'>[]): void {
        events.push('replaceNow')
        store.replaceNow(rows)
      },
      appendIndicators(rows: readonly Row<'indicators'>[]): void {
        events.push('appendIndicators')
        store.appendIndicators(rows)
      },
      updateSourceStates(updates: readonly SourceStateUpdate[]): void {
        events.push('updateSourceStates')
        store.updateSourceStates(updates)
      }
    }

    const callbackInvocations: Array<{
      snapshot: ReturnType<typeof runSkyEvaluation>
      windows: readonly Row<'windows'>[]
      tEval: string
      nowCountAtCall: number
      indicatorCountAtCall: number
      sourceStateAtCall: Row<'sources'>['state']
    }> = []

    const returnedSnapshot = runSkyEvaluation({
      store: trackedStore,
      daylight: DAYLIGHT,
      onSnapshot(snapshot, normalizedWindows, tEval) {
        events.push('onSnapshot')
        callbackInvocations.push({
          snapshot,
          windows: normalizedWindows,
          tEval,
          nowCountAtCall: tables.now.length,
          indicatorCountAtCall: tables.indicators.length,
          sourceStateAtCall: tables.sources[0]?.state
        })
      }
    })

    expect(callbackInvocations).toHaveLength(1)
    const call = callbackInvocations[0]!
    expect(call.snapshot).toBe(returnedSnapshot)
    expect(call.tEval).toBe('2026-11-02T15:05:00+08:00')
    expect(call.windows).toEqual([
      buildCommuteWindow({
        date: '2026-11-02',
        start_myt: '14:30',
        end_myt: '15:30',
        declared_at: '2026-11-02T08:00:00+08:00'
      })
    ])

    expect(readTabs).toEqual(['sources', 'readings', 'polls', 'warnings', 'forecast', 'windows', 'indicators'])
    expect(events.slice(-4)).toEqual(['replaceNow', 'appendIndicators', 'updateSourceStates', 'onSnapshot'])
    expect(call.nowCountAtCall).toBe(tables.now.length)
    expect(call.indicatorCountAtCall).toBe(tables.indicators.length)
    expect(call.sourceStateAtCall).toBe('recovered')
    expect(sourceUpdateCalls).toHaveLength(1)
  })

  test('propagates onSnapshot errors and never calls onSnapshot when #54 persistence fails', () => {
    const { store, tables } = createMemoryStore()
    expect(() =>
      runSkyEvaluation({
        store,
        daylight: DAYLIGHT,
        onSnapshot() {
          throw new Error('clause runtime failure')
        }
      })
    ).toThrow('clause runtime failure')
    expect(tables.now.length).toBeGreaterThan(0)
    expect(tables.indicators.length).toBeGreaterThan(0)

    let callbackCount = 0
    const failingNowStore: SkyEvaluationStore = {
      ...store,
      replaceNow() {
        throw new Error('replaceNow failed before callback')
      }
    }
    expect(() =>
      runSkyEvaluation({
        store: failingNowStore,
        daylight: DAYLIGHT,
        onSnapshot() {
          callbackCount += 1
        }
      })
    ).toThrow('replaceNow failed before callback')

    const { store: freshIndicatorStore } = createMemoryStore()
    const failingIndicatorsStore: SkyEvaluationStore = {
      ...freshIndicatorStore,
      appendIndicators() {
        throw new Error('appendIndicators failed before callback')
      }
    }
    expect(() =>
      runSkyEvaluation({
        store: failingIndicatorsStore,
        daylight: DAYLIGHT,
        onSnapshot() {
          callbackCount += 1
        }
      })
    ).toThrow('appendIndicators failed before callback')

    const { store: staleStore } = createMemoryStore({
      sources: [
        buildGaugeSource({
          state: 'stale',
          state_since: '2026-11-02T14:50:00+08:00'
        })
      ]
    })
    const failingSourceUpdateStore: SkyEvaluationStore = {
      ...staleStore,
      updateSourceStates() {
        throw new Error('updateSourceStates failed before callback')
      }
    }
    expect(() =>
      runSkyEvaluation({
        store: failingSourceUpdateStore,
        daylight: DAYLIGHT,
        onSnapshot() {
          callbackCount += 1
        }
      })
    ).toThrow('updateSourceStates failed before callback')

    expect(callbackCount).toBe(0)
  })
})
