import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from '../build.ts'
import { runJpsHandler, parseJpsRainfall, runJpsPoll, type JpsHttpResponse, type JpsPollPorts } from './jps.ts'
import { runEvaluationTick } from './main.ts'
import { validateReading } from './readings.ts'
import { triggerRegistry } from './registry.ts'
import { toRow, type Row } from './schema.ts'
import { syncTriggers, type Cadence } from './triggers.ts'

const FIXTURE_PATH = join(import.meta.dir, '..', '..', 'fixtures', 'rainfall-graph-75-20261105T1312Z.json')
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, 'utf8')
const FIXTURE_JSON = JSON.parse(FIXTURE_TEXT) as {
  stationId: string
  data: { timestamp: string; rf: number; dailyrf: number }[]
}

const SOURCE_ROW: Row<'sources'> = {
  source_id: '0232901RF',
  kind: 'jps_rain',
  name: 'Sg. Kuyoh di LRT Bukit Jalil',
  cadence_min: 5,
  stale_after_min: 10,
  freshness: 'observed',
  licence: 'No published terms found (5 Nov 2026)',
  url: 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
}

function makeHarness(options?: {
  fetch?: (url: string) => JpsHttpResponse
  times?: string[]
  sources?: Row<'sources'>[]
  readings?: Row<'readings'>[]
}) {
  const sources: Row<'sources'>[] = [...(options?.sources ?? [])]
  const readings: Row<'readings'>[] = [...(options?.readings ?? [])]
  const polls: Row<'polls'>[] = []
  const readingBatches: Row<'readings'>[][] = []
  const fetchedUrls: string[] = []
  let evaluations = 0
  let pollSequence = 0

  const queue = [...(options?.times ?? ['2026-11-05T21:12:00+08:00', '2026-11-05T21:12:01+08:00'])]
  let lastIso = queue[queue.length - 1] ?? '2026-11-05T21:12:00+08:00'

  const ports: JpsPollPorts = {
    newPollId: () => `019a5470-3a40-7000-8000-${String(++pollSequence).padStart(12, '0')}`,
    now: () => {
      const next = queue.shift() ?? lastIso
      lastIso = next
      return new Date(next)
    },
    fetch: (url) => {
      fetchedUrls.push(url)
      if (options?.fetch) return options.fetch(url)
      return { status: 200, body: FIXTURE_TEXT }
    },
    readSources: () => sources,
    appendSource: (row) => {
      toRow('sources', row)
      sources.push(row)
    },
    readReadings: () => readings,
    appendReadings: (rows) => {
      for (const row of rows) {
        const problems = validateReading(row)
        if (problems.length > 0) throw new Error(`invalid reading: ${problems.join('; ')}`)
        toRow('readings', row)
      }
      readingBatches.push(rows)
      readings.push(...rows)
    },
    appendPoll: (row) => {
      toRow('polls', row)
      polls.push(row)
    },
    evaluate: () => {
      evaluations += 1
    }
  }

  return {
    ports,
    sources,
    readings,
    polls,
    readingBatches,
    fetchedUrls,
    get evaluations() {
      return evaluations
    }
  }
}

describe('parseJpsRainfall', () => {
  test('parses the station 75 capture into 2,269 gapless 5-minute readings with +08:00 offsets', () => {
    const readings = parseJpsRainfall(FIXTURE_JSON)
    expect(readings).toHaveLength(2269)
    expect(readings[0]).toEqual({
      observedAt: '2026-10-29T00:00:00+08:00',
      value: 0
    })
    expect(readings[readings.length - 1]).toEqual({
      observedAt: '2026-11-05T21:00:00+08:00',
      value: 0
    })

    for (let i = 1; i < readings.length; i += 1) {
      const prev = Date.parse(readings[i - 1]!.observedAt)
      const curr = Date.parse(readings[i]!.observedAt)
      expect(curr - prev).toBe(5 * 60 * 1000)
    }

    const stormPeak = readings.find((entry) => entry.observedAt === '2026-11-02T15:00:00+08:00')
    expect(stormPeak).toEqual({
      observedAt: '2026-11-02T15:00:00+08:00',
      value: 9.5
    })
  })

  test('collapses identical duplicate timestamps and rejects conflicting duplicate timestamps', () => {
    const collapsed = parseJpsRainfall({
      stationId: '0232901RF',
      data: [
        { timestamp: '2026-11-02T15:00:00', rf: 9.5, dailyrf: 40 },
        { timestamp: '2026-11-02T15:00:00', rf: 9.5, dailyrf: 99 },
        { timestamp: '2026-11-02T15:05:00', rf: 4, dailyrf: 44 }
      ]
    })
    expect(collapsed).toEqual([
      { observedAt: '2026-11-02T15:00:00+08:00', value: 9.5 },
      { observedAt: '2026-11-02T15:05:00+08:00', value: 4 }
    ])

    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [
          { timestamp: '2026-11-02T15:00:00', rf: 9.5 },
          { timestamp: '2026-11-02T15:00:00', rf: 10 }
        ]
      })
    ).toThrow(/duplicate|conflict/i)
  })

  test('rejects wrong stationId, missing data array, invalid timestamps, non-finite rf and a corrupt last row', () => {
    expect(() => parseJpsRainfall(null)).toThrow()
    expect(() => parseJpsRainfall({ stationId: 'OTHER', data: [] })).toThrow(/stationId/i)
    expect(() => parseJpsRainfall({ stationId: '0232901RF' })).toThrow(/data/i)
    expect(() => parseJpsRainfall({ stationId: '0232901RF', data: 'not-an-array' })).toThrow(/data/i)
    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [{ timestamp: 'not-a-timestamp', rf: 0 }]
      })
    ).toThrow(/timestamp/i)
    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [{ timestamp: '2026-02-30T00:00:00', rf: 0 }]
      })
    ).toThrow(/timestamp/i)
    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [{ timestamp: '2026-11-02T15:00:00', rf: '9.5' }]
      })
    ).toThrow(/rf/i)
    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [{ timestamp: '2026-11-02T15:00:00', rf: Number.NaN }]
      })
    ).toThrow(/rf/i)
    expect(() =>
      parseJpsRainfall({
        stationId: '0232901RF',
        data: [{ timestamp: '2026-11-02T15:00:00', rf: Number.POSITIVE_INFINITY }]
      })
    ).toThrow(/rf/i)

    const corruptTail = {
      ...FIXTURE_JSON,
      data: [...FIXTURE_JSON.data.slice(0, -1), { timestamp: '2026-11-05T21:00:00', rf: null }]
    }
    expect(() => parseJpsRainfall(corruptTail)).toThrow(/rf/i)
  })
})

describe('runJpsPoll persistence, dedupe and revisions', () => {
  test('first run registers the JPS source row and batch-appends all 2,269 readings with outcome ok', () => {
    const harness = makeHarness({
      times: ['2026-11-05T21:12:00+08:00', '2026-11-05T21:12:02+08:00']
    })

    const result = runJpsPoll(harness.ports)

    expect(harness.fetchedUrls).toEqual(['https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'])
    expect(harness.sources).toEqual([SOURCE_ROW])
    expect(harness.readingBatches).toHaveLength(1)
    expect(result.newReadings).toHaveLength(2269)
    expect(harness.readings).toHaveLength(2269)

    const nov2Reading = result.newReadings.find((row) => row.observed_at === '2026-11-02T15:00:00+08:00')
    expect(nov2Reading).toEqual({
      reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      metric: 'rain_5m_mm',
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: '2026-11-05T21:12:02+08:00',
      value: 9.5,
      unit: 'mm',
      http_status: 200,
      latency_ms: 2000,
      poll_id: '019a5470-3a40-7000-8000-000000000001',
      revision: 1
    })

    expect(result.poll).toEqual({
      poll_id: '019a5470-3a40-7000-8000-000000000001',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      started_at: '2026-11-05T21:12:00+08:00',
      received_at: '2026-11-05T21:12:02+08:00',
      http_status: 200,
      latency_ms: 2000,
      outcome: 'ok',
      new_rows: 2269
    })
    expect(harness.polls).toEqual([result.poll])
    expect(harness.evaluations).toBe(1)
  })

  test('polling the identical capture again appends zero readings and records outcome unchanged without duplicating the source row', () => {
    const harness = makeHarness({
      times: [
        '2026-11-05T21:12:00+08:00',
        '2026-11-05T21:12:01+08:00',
        '2026-11-05T21:17:00+08:00',
        '2026-11-05T21:17:01+08:00'
      ]
    })

    runJpsPoll(harness.ports)
    const second = runJpsPoll(harness.ports)

    expect(harness.sources).toHaveLength(1)
    expect(second.newReadings).toEqual([])
    expect(harness.readingBatches).toHaveLength(1)
    expect(harness.readings).toHaveLength(2269)
    expect(second.poll).toEqual({
      poll_id: '019a5470-3a40-7000-8000-000000000002',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      started_at: '2026-11-05T21:17:00+08:00',
      received_at: '2026-11-05T21:17:01+08:00',
      http_status: 200,
      latency_ms: 1000,
      outcome: 'unchanged',
      new_rows: 0
    })
    expect(harness.evaluations).toBe(2)
  })

  test('changing one rf value appends exactly one reading row with revision 2', () => {
    const modifiedPayload = JSON.stringify({
      ...FIXTURE_JSON,
      data: FIXTURE_JSON.data.map((row) => (row.timestamp === '2026-11-02T15:00:00' ? { ...row, rf: 11.0 } : row))
    })

    let callCount = 0
    const harness = makeHarness({
      times: [
        '2026-11-05T21:12:00+08:00',
        '2026-11-05T21:12:01+08:00',
        '2026-11-05T21:17:00+08:00',
        '2026-11-05T21:17:01+08:00'
      ],
      fetch: () => {
        callCount += 1
        return { status: 200, body: callCount === 1 ? FIXTURE_TEXT : modifiedPayload }
      }
    })

    runJpsPoll(harness.ports)
    const revised = runJpsPoll(harness.ports)

    expect(revised.newReadings).toHaveLength(1)
    expect(revised.newReadings[0]).toEqual({
      reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      metric: 'rain_5m_mm',
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: '2026-11-05T21:17:01+08:00',
      value: 11,
      unit: 'mm',
      http_status: 200,
      latency_ms: 1000,
      poll_id: '019a5470-3a40-7000-8000-000000000002',
      revision: 2
    })
    expect(revised.poll.outcome).toBe('ok')
    expect(revised.poll.new_rows).toBe(1)
    expect(harness.readings).toHaveLength(2270)
  })

  test('out-of-order response and out-of-order stored revisions compare against the highest stored revision and normalize Date cells', () => {
    const existingReadings: Row<'readings'>[] = [
      {
        reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
        source_kind: 'jps_rain',
        source_id: '0232901RF',
        metric: 'rain_5m_mm',
        observed_at: new Date('2026-11-02T15:00:00+08:00'),
        received_at: '2026-11-05T21:17:01+08:00',
        value: 12,
        unit: 'mm',
        http_status: 200,
        latency_ms: 500,
        poll_id: '019a5470-3a40-7000-8000-000000000002',
        revision: 2
      },
      {
        reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
        source_kind: 'jps_rain',
        source_id: '0232901RF',
        metric: 'rain_5m_mm',
        observed_at: '2026-11-02T15:00:00+08:00',
        received_at: '2026-11-05T21:12:01+08:00',
        value: 9.5,
        unit: 'mm',
        http_status: 200,
        latency_ms: 500,
        poll_id: '019a5470-3a40-7000-8000-000000000001',
        revision: 1
      },
      {
        reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:05:00+08:00',
        source_kind: 'jps_rain',
        source_id: '0232901RF',
        metric: 'rain_5m_mm',
        observed_at: '2026-11-02T15:05:00+08:00',
        received_at: '2026-11-05T21:12:01+08:00',
        value: 4,
        unit: 'mm',
        http_status: 200,
        latency_ms: 500,
        poll_id: '019a5470-3a40-7000-8000-000000000001',
        revision: 1
      }
    ]

    let call = 0
    const harness = makeHarness({
      sources: [SOURCE_ROW],
      readings: existingReadings,
      times: [
        '2026-11-05T21:22:00+08:00',
        '2026-11-05T21:22:01+08:00',
        '2026-11-05T21:27:00+08:00',
        '2026-11-05T21:27:01+08:00'
      ],
      fetch: () => {
        call += 1
        if (call === 1) {
          return {
            status: 200,
            body: JSON.stringify({
              stationId: '0232901RF',
              data: [
                { timestamp: '2026-11-02T15:05:00', rf: 4 },
                { timestamp: '2026-11-02T15:00:00', rf: 12 }
              ]
            })
          }
        }
        return {
          status: 200,
          body: JSON.stringify({
            stationId: '0232901RF',
            data: [
              { timestamp: '2026-11-02T15:05:00', rf: 4 },
              { timestamp: '2026-11-02T15:00:00', rf: 9.5 }
            ]
          })
        }
      }
    })

    const unchanged = runJpsPoll(harness.ports)
    expect(unchanged.poll.outcome).toBe('unchanged')
    expect(unchanged.newReadings).toEqual([])

    const revertedToRev1Value = runJpsPoll(harness.ports)
    expect(revertedToRev1Value.poll.outcome).toBe('ok')
    expect(revertedToRev1Value.newReadings).toHaveLength(1)
    expect(revertedToRev1Value.newReadings[0]?.revision).toBe(3)
    expect(revertedToRev1Value.newReadings[0]?.value).toBe(9.5)
  })
})

test('ignores stored readings with missing or blank source_id or metric when deduplicating JPS readings', () => {
  const fixtureRow = FIXTURE_JSON.data.find((row) => row.timestamp === '2026-11-02T15:00:00')!
  const payload = JSON.stringify({ stationId: FIXTURE_JSON.stationId, data: [fixtureRow] })
  const incompleteIdentities: Partial<Row<'readings'>>[] = [
    { source_id: undefined, metric: 'rain_5m_mm' },
    { source_id: '', metric: 'rain_5m_mm' },
    { source_id: '0232901RF', metric: undefined },
    { source_id: '0232901RF', metric: '' }
  ]

  for (const identity of incompleteIdentities) {
    const harness = makeHarness({
      sources: [SOURCE_ROW],
      readings: [
        {
          observed_at: '2026-11-02T15:00:00+08:00',
          received_at: '2026-11-05T21:12:01+08:00',
          value: fixtureRow.rf,
          unit: 'mm',
          http_status: 200,
          latency_ms: 500,
          poll_id: '019a5470-3a40-7000-8000-000000000000',
          revision: 1,
          ...identity
        }
      ],
      fetch: () => ({ status: 200, body: payload })
    })

    const result = runJpsPoll(harness.ports)
    expect(result.poll.outcome).toBe('ok')
    expect(result.poll.new_rows).toBe(1)
    expect(result.newReadings).toHaveLength(1)
    expect(result.newReadings[0]).toMatchObject({
      source_id: '0232901RF',
      metric: 'rain_5m_mm',
      observed_at: '2026-11-02T15:00:00+08:00',
      value: 9.5,
      revision: 1
    })
  }
})
describe('failure handling and runtime wiring', () => {
  test('HTTP 500, transport exception and bad schema each register the source on first run, write one error poll, zero readings and invoke evaluation', () => {
    const http500 = makeHarness({
      times: ['2026-11-05T21:12:00+08:00', '2026-11-05T21:12:01+08:00'],
      fetch: () => ({ status: 500, body: 'Internal Server Error' })
    })
    const res500 = runJpsPoll(http500.ports)
    expect(http500.sources).toEqual([SOURCE_ROW])
    expect(res500.newReadings).toEqual([])
    expect(http500.readings).toEqual([])
    expect(res500.poll).toMatchObject({
      poll_id: '019a5470-3a40-7000-8000-000000000001',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      http_status: 500,
      latency_ms: 1000,
      outcome: 'error',
      new_rows: 0
    })
    expect(String(res500.poll.error)).toMatch(/500/)
    expect(http500.evaluations).toBe(1)

    const timeout = makeHarness({
      times: ['2026-11-05T21:12:00+08:00', '2026-11-05T21:12:20+08:00'],
      fetch: () => {
        throw new Error('Address unavailable: infobanjirjpskl.water.gov.my')
      }
    })
    const resTimeout = runJpsPoll(timeout.ports)
    expect(timeout.sources).toEqual([SOURCE_ROW])
    expect(resTimeout.newReadings).toEqual([])
    expect(timeout.readings).toEqual([])
    expect(resTimeout.poll).toEqual({
      poll_id: '019a5470-3a40-7000-8000-000000000001',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      started_at: '2026-11-05T21:12:00+08:00',
      received_at: '2026-11-05T21:12:20+08:00',
      http_status: 0,
      latency_ms: 20000,
      outcome: 'error',
      new_rows: 0,
      error: 'Address unavailable: infobanjirjpskl.water.gov.my'
    })
    expect(timeout.evaluations).toBe(1)

    const corruptTailBody = JSON.stringify({
      ...FIXTURE_JSON,
      data: [...FIXTURE_JSON.data.slice(0, -1), { timestamp: '2026-11-05T21:00:00', rf: 'bad' }]
    })
    const badSchema = makeHarness({
      times: ['2026-11-05T21:12:00+08:00', '2026-11-05T21:12:01+08:00'],
      fetch: () => ({ status: 200, body: corruptTailBody })
    })
    const resSchema = runJpsPoll(badSchema.ports)
    expect(badSchema.sources).toEqual([SOURCE_ROW])
    expect(resSchema.newReadings).toEqual([])
    expect(badSchema.readings).toEqual([])
    expect(badSchema.readingBatches).toEqual([])
    expect(resSchema.poll).toMatchObject({
      poll_id: '019a5470-3a40-7000-8000-000000000001',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      http_status: 200,
      latency_ms: 1000,
      outcome: 'error',
      new_rows: 0
    })
    expect(String(resSchema.poll.error)).toMatch(/rf/i)
    expect(badSchema.evaluations).toBe(1)
  })

  test('the JPS coordinator holds one script lock across poll and unlocked tick, and releases the lock when persistence or evaluation fails', () => {
    const events: string[] = []
    let activeLocks = 0

    const withLockSpy = <T>(fn: () => T): T => {
      activeLocks += 1
      if (activeLocks > 1) throw new Error('recursive lock acquisition')
      events.push('lock:acquire')
      try {
        return fn()
      } finally {
        activeLocks -= 1
        events.push('lock:release')
      }
    }

    const successHarness = makeHarness()
    runJpsHandler({
      withLock: withLockSpy,
      ports: {
        ...successHarness.ports,
        evaluate: () => {
          expect(activeLocks).toBe(1)
          events.push('tick:execute')
        }
      }
    })
    expect(events).toEqual(['lock:acquire', 'tick:execute', 'lock:release'])
    expect(activeLocks).toBe(0)

    events.length = 0
    const errorHarness = makeHarness({
      fetch: () => ({ status: 503, body: 'unavailable' })
    })
    const errorResult = runJpsHandler({
      withLock: withLockSpy,
      ports: {
        ...errorHarness.ports,
        evaluate: () => {
          expect(activeLocks).toBe(1)
          events.push('tick:execute')
        }
      }
    })
    expect(errorResult.poll.outcome).toBe('error')
    expect(events).toEqual(['lock:acquire', 'tick:execute', 'lock:release'])
    expect(activeLocks).toBe(0)

    events.length = 0
    const storageFailureHarness = makeHarness()
    storageFailureHarness.ports.appendReadings = () => {
      throw new Error('spreadsheet quota exceeded')
    }
    expect(() =>
      runJpsHandler({
        withLock: withLockSpy,
        ports: {
          ...storageFailureHarness.ports,
          evaluate: () => {
            events.push('tick:execute')
          }
        }
      })
    ).toThrow('spreadsheet quota exceeded')
    expect(events).toEqual(['lock:acquire', 'lock:release'])
    expect(storageFailureHarness.polls).toEqual([])
    expect(activeLocks).toBe(0)

    events.length = 0
    const evalFailureHarness = makeHarness({
      sources: [SOURCE_ROW],
      readings: successHarness.readings
    })
    expect(() =>
      runJpsHandler({
        withLock: withLockSpy,
        ports: {
          ...evalFailureHarness.ports,
          evaluate: () => {
            events.push('tick:execute')
            throw new Error('evaluation failure')
          }
        }
      })
    ).toThrow('evaluation failure')
    expect(events).toEqual(['lock:acquire', 'tick:execute', 'lock:release'])
    expect(activeLocks).toBe(0)

    events.length = 0
    const globals = globalThis as unknown as Record<string, unknown>
    const previous = globals.LockService
    const previousProperties = globals.PropertiesService
    globals.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) }
    globals.LockService = {
      getScriptLock: () => ({
        waitLock: () => {
          events.push('lock:acquire')
        },
        releaseLock: () => {
          events.push('lock:release')
        }
      })
    }
    try {
      expect(() => runEvaluationTick()).toThrow('SHEET_ID')
    } finally {
      if (previous === undefined) delete globals.LockService
      else globals.LockService = previous
      if (previousProperties === undefined) delete globals.PropertiesService
      else globals.PropertiesService = previousProperties
    }
    expect(events).toEqual(['lock:acquire', 'lock:release'])
  })

  test('built bundle exports pollJps and triggerRegistry installs pollJps every 5 minutes only on the pilot script', async () => {
    expect(triggerRegistry).toContainEqual({
      kind: 'time',
      handler: 'pollJps',
      every: { minutes: 5 }
    })

    const outdir = mkdtempSync(join(tmpdir(), 'skyclause-jps-build-'))
    try {
      const entryPoints = await build({
        outdir,
        sha: 'test-sha',
        builtAt: '2026-11-05T21:12:00+08:00',
        pilotScriptId: 'pilot-script-id'
      })
      expect(entryPoints).toContain('pollJps')
      expect(entryPoints).toContain('runEvaluationTick')
    } finally {
      rmSync(outdir, { recursive: true, force: true })
    }

    const created: { handler: string; every: Cadence }[] = []
    const triggerPort = {
      list: () => [],
      createTime: (handler: string, every: Cadence) => {
        created.push({ handler, every })
      },
      createSpreadsheet: () => {},
      remove: () => {}
    }
    const dev = syncTriggers(triggerRegistry, triggerPort, {
      scriptId: 'dev-script-id',
      pilotScriptId: 'pilot-script-id',
      getProperty: () => null
    })
    expect(dev.pilot).toBe(false)
    expect(created).toEqual([])
    const pilot = syncTriggers(triggerRegistry, triggerPort, {
      scriptId: 'pilot-script-id',
      pilotScriptId: 'pilot-script-id',
      getProperty: () => null
    })
    expect(pilot.created).toContain('pollJps')
    expect(created).toContainEqual({ handler: 'pollJps', every: { minutes: 5 } })
  })
})
