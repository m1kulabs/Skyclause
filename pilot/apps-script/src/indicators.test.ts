import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeSkySnapshot, type SkySnapshot, type SkySnapshotInput } from './indicators.ts'
import { type Cell, type Row, toRow } from './schema.ts'

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}

interface ApimsCapture {
  data: Array<{ STATION_ID: string; API: number; RECORD_DT: string }>
}

interface MetWarningCaptureEntry {
  warning_issue: { issued: string; title_bm: string; title_en: string }
  valid_from: string | null
  valid_to: string | null
  heading_en: string
  text_en: string
  text_bm: string
}

const BOUND_APIMS = ['CA16W', 'CA19B', 'CA17W'] as const
const DEFAULT_DAYLIGHT = { start: '07:15', end: '19:00' }

function loadCapture<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(import.meta.dir, '../../fixtures', filename), 'utf8')) as T
}

const jpsCapture = loadCapture<JpsCapture>('rainfall-graph-75-20261105T1312Z.json')
const apimsCapture = loadCapture<ApimsCapture>('mapcaqm-20261105T1313Z.json')
const metCapture = loadCapture<MetWarningCaptureEntry[]>('weather-warning-20261105T1313Z.json')

function baseSources(overrides: Partial<Record<string, Partial<Row<'sources'>>>> = {}): Row<'sources'>[] {
  const defaults: Row<'sources'>[] = [
    {
      source_id: '0232901RF',
      kind: 'jps_rain',
      name: 'Sg. Kuyoh di LRT Bukit Jalil',
      cadence_min: 5,
      stale_after_min: 10,
      freshness: 'observed',
      state: 'fresh',
      state_since: '2026-11-02T00:00:00+08:00',
      probation: false
    },
    ...BOUND_APIMS.map((id) => ({
      source_id: id,
      kind: 'apims',
      name: `APIMS ${id}`,
      cadence_min: 60,
      stale_after_min: 120,
      freshness: 'observed',
      state: 'fresh',
      state_since: '2026-10-29T00:00:00+08:00',
      probation: false
    })),
    {
      source_id: 'met_warning',
      kind: 'met_warning',
      name: 'MET Malaysia Warnings',
      cadence_min: 10,
      stale_after_min: 20,
      freshness: 'polled',
      state: 'fresh',
      state_since: '2026-10-29T00:00:00+08:00',
      probation: false
    },
    {
      source_id: 'Ds058',
      kind: 'met_forecast',
      name: 'MET General Forecast',
      cadence_min: 360,
      stale_after_min: 720,
      freshness: 'polled',
      state: 'fresh',
      state_since: '2026-10-29T00:00:00+08:00',
      probation: false
    },
    {
      source_id: 'cam_01',
      kind: 'camera',
      name: 'Site Camera 01',
      cadence_min: 10,
      stale_after_min: 20,
      freshness: 'observed',
      state: 'fresh',
      state_since: '2026-11-02T00:00:00+08:00',
      probation: false
    }
  ]
  return defaults.map((row) => ({ ...row, ...(overrides[String(row.source_id)] ?? {}) }))
}

function adaptJpsReadings(
  opts: { fromIso?: string; upToIso?: string; pollId?: string; receivedAt?: string } = {}
): Row<'readings'>[] {
  const pollId = opts.pollId ?? 'poll-jps-1'
  const receivedAt = opts.receivedAt ?? '2026-11-05T21:12:00+08:00'
  return jpsCapture.data
    .map((entry) => {
      const observedAt = `${entry.timestamp}+08:00`
      return {
        reading_id: `${jpsCapture.stationId}:rain_5m_mm:${observedAt}`,
        source_kind: 'jps_rain',
        source_id: jpsCapture.stationId,
        metric: 'rain_5m_mm',
        observed_at: observedAt,
        received_at: receivedAt,
        value: entry.rf,
        unit: 'mm',
        http_status: 200,
        latency_ms: 120,
        poll_id: pollId,
        revision: 1,
        note: ''
      } satisfies Row<'readings'>
    })
    .filter((r) => (!opts.fromIso || r.observed_at >= opts.fromIso) && (!opts.upToIso || r.observed_at <= opts.upToIso))
}

function adaptApimsReadings(pollId = 'poll-apims-1', receivedAt = '2026-11-05T21:13:00+08:00'): Row<'readings'>[] {
  return apimsCapture.data
    .filter((entry) => (BOUND_APIMS as readonly string[]).includes(entry.STATION_ID))
    .map((entry) => {
      const observedAt = `${entry.RECORD_DT}+08:00`
      return {
        reading_id: `${entry.STATION_ID}:api:${observedAt}`,
        source_kind: 'apims',
        source_id: entry.STATION_ID,
        metric: 'api',
        observed_at: observedAt,
        received_at: receivedAt,
        value: Number(entry.API),
        unit: 'API',
        http_status: 200,
        latency_ms: 150,
        poll_id: pollId,
        revision: 1,
        note: ''
      } satisfies Row<'readings'>
    })
}

function adaptMetWarnings(pollId = 'poll-met-1', seenAt = '2026-11-05T21:13:00+08:00'): Row<'warnings'>[] {
  return metCapture.map((entry, idx) => {
    const titleEn = entry.warning_issue.title_en
    const issued = `${entry.warning_issue.issued}+08:00`
    const validFrom = entry.valid_from ? `${entry.valid_from}+08:00` : ''
    const validTo = entry.valid_to ? `${entry.valid_to}+08:00` : ''
    const isMarine = /strong winds and rough seas/i.test(titleEn) || /for malaysian waters/i.test(entry.text_en)
    const isNoAdvisory = /no advisory/i.test(titleEn)
    const mentionsKl = /kuala lumpur/i.test(`${entry.heading_en} ${entry.text_en} ${entry.text_bm}`)
    return {
      warning_key: `met:${issued}:${idx}`,
      issued,
      title_en: titleEn,
      title_bm: entry.warning_issue.title_bm,
      valid_from: validFrom,
      valid_to: validTo,
      heading_en: entry.heading_en,
      text_en: entry.text_en,
      instruction_en: '',
      heading_bm: '',
      text_bm: entry.text_bm,
      instruction_bm: '',
      first_seen_at: seenAt,
      last_seen_at: seenAt,
      poll_id: pollId,
      http_status: 200,
      latency_ms: 110,
      names_kl: !isMarine && !isNoAdvisory && mentionsKl
    } satisfies Row<'warnings'>
  })
}

function makeInput(overrides: Partial<SkySnapshotInput> & { tEval: string }): SkySnapshotInput {
  return {
    tEval: overrides.tEval,
    sources: overrides.sources ?? baseSources(),
    readings: overrides.readings ?? [],
    polls: overrides.polls ?? [],
    warnings: overrides.warnings ?? [],
    forecast: overrides.forecast ?? [],
    windows: overrides.windows ?? [],
    previousIndicators: overrides.previousIndicators ?? [],
    daylight: overrides.daylight ?? DEFAULT_DAYLIGHT
  }
}

function findNow(snapshot: SkySnapshot, scope: string): Row<'now'> {
  const row = snapshot.nowRows.find((r) => r.scope === scope)
  if (!row) throw new Error(`Missing now row for scope ${scope}`)
  return row
}

function findIndicator(snapshot: SkySnapshot, scope: string, name: string): Row<'indicators'> {
  const matches = snapshot.indicatorRows.filter((r) => r.scope === scope && r.name === name)
  expect(matches.length).toBe(1)
  return matches[0]!
}

describe('Task 2 #54: computeSkySnapshot pure indicator and source-state core', () => {
  test('rainfall boundaries on real JPS capture: 60m first >=31 at 15:00 (39.0), (14:00,16:00]=63.0, peak 59.5 at 15:35, 240m first >60 at 15:40 (60.5)', () => {
    expect(jpsCapture.stationId).toBe('0232901RF')
    expect(jpsCapture.data.length).toBe(2269)

    const allReadings = adaptJpsReadings({
      upToIso: '2026-11-02T16:00:00+08:00',
      receivedAt: '2026-11-02T16:00:00+08:00'
    })
    const windowRow: Row<'windows'> = {
      window_id: 'w-storm',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '2026-11-02T14:00:00+08:00',
      end_myt: '2026-11-02T15:15:00+08:00',
      status: 'active'
    }

    const cases: Array<{
      tEval: string
      expected60m: number
      expected60mObs: string
      expected4h: number
      expected4hObs: string
      check60mUnder31?: boolean
      check4hAtMost60?: boolean
    }> = [
      {
        tEval: '2026-11-02T14:55:00+08:00',
        expected60m: 29.5,
        expected60mObs: '2026-11-02T14:55:00+08:00',
        expected4h: 29.5,
        expected4hObs: '2026-11-02T14:55:00+08:00',
        check60mUnder31: true
      },
      {
        tEval: '2026-11-02T15:00:00+08:00',
        expected60m: 39.0,
        expected60mObs: '2026-11-02T15:00:00+08:00',
        expected4h: 39.0,
        expected4hObs: '2026-11-02T15:00:00+08:00'
      },
      {
        tEval: '2026-11-02T15:35:00+08:00',
        expected60m: 59.5,
        expected60mObs: '2026-11-02T15:35:00+08:00',
        expected4h: 60.0,
        expected4hObs: '2026-11-02T15:35:00+08:00',
        check4hAtMost60: true
      },
      {
        tEval: '2026-11-02T15:40:00+08:00',
        expected60m: 59.5,
        expected60mObs: '2026-11-02T15:35:00+08:00',
        expected4h: 60.5,
        expected4hObs: '2026-11-02T15:40:00+08:00'
      },
      {
        tEval: '2026-11-02T16:00:00+08:00',
        expected60m: 59.5,
        expected60mObs: '2026-11-02T15:35:00+08:00',
        expected4h: 63.0,
        expected4hObs: '2026-11-02T16:00:00+08:00'
      }
    ]

    for (const c of cases) {
      const snap = computeSkySnapshot(
        makeInput({
          tEval: c.tEval,
          readings: allReadings,
          polls: [
            {
              poll_id: 'poll-jps-1',
              source_kind: 'jps_rain',
              source_id: '0232901RF',
              started_at: c.tEval,
              received_at: c.tEval,
              http_status: 200,
              latency_ms: 80,
              outcome: 'ok',
              new_rows: 1
            }
          ],
          windows: [windowRow]
        })
      )
      const nowRow = findNow(snap, 'w-storm')
      const ind60 = findIndicator(snap, 'w-storm', 'w.rain_max_60m_mm')
      const ind4h = findIndicator(snap, 'w-storm', 'w.rain_max_4h_mm')

      if (c.check60mUnder31) expect(Number(nowRow['w.rain_max_60m_mm'])).toBeLessThan(31)
      if (c.check4hAtMost60) expect(Number(nowRow['w.rain_max_4h_mm'])).toBeLessThanOrEqual(60)
      expect(nowRow['w.rain_max_60m_mm']).toBe(c.expected60m)
      expect(ind60.value).toBe(c.expected60m)
      expect(ind60.observed_at).toBe(c.expected60mObs)
      expect(nowRow['w.rain_max_4h_mm']).toBe(c.expected4h)
      expect(ind4h.value).toBe(c.expected4h)
      expect(ind4h.observed_at).toBe(c.expected4hObs)
      expect(JSON.parse(String(ind60.reading_ids)).length).toBeGreaterThan(0)
    }
  })

  test('replay stream spans (decision 2): 15:30 window is 39.0 at 15:05 (age 5); 15:45 window is blank at 15:15 and 54.0 at 15:20', () => {
    const windows: Row<'windows'>[] = [
      {
        window_id: 'w-1530',
        subscriber_id: 'sub-1',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '2026-11-02T14:30:00+08:00',
        end_myt: '2026-11-02T15:30:00+08:00',
        status: 'active'
      },
      {
        window_id: 'w-1545',
        subscriber_id: 'sub-1',
        kind: 'commute_wave',
        date: '2026-11-02',
        start_myt: '2026-11-02T14:45:00+08:00',
        end_myt: '2026-11-02T15:45:00+08:00',
        status: 'active'
      }
    ]

    const runStreamTick = (tEval: string, seenUpTo: string): SkySnapshot =>
      computeSkySnapshot(
        makeInput({
          tEval,
          readings: adaptJpsReadings({ upToIso: seenUpTo, receivedAt: tEval }),
          polls: [
            {
              poll_id: `poll-${tEval}`,
              source_kind: 'jps_rain',
              source_id: '0232901RF',
              started_at: tEval,
              received_at: tEval,
              http_status: 200,
              latency_ms: 90,
              outcome: 'ok',
              new_rows: 1
            }
          ],
          windows
        })
      )

    const at1505 = runStreamTick('2026-11-02T15:05:00+08:00', '2026-11-02T15:00:00+08:00')
    const now1530 = findNow(at1505, 'w-1530')
    const ind1530 = findIndicator(at1505, 'w-1530', 'w.rain_max_60m_mm')
    expect(now1530.span_from).toBe('2026-11-02T15:00:00+08:00')
    expect(now1530.span_to).toBe('2026-11-02T16:30:00+08:00')
    expect(now1530['w.rain_max_60m_mm']).toBe(39.0)
    expect(ind1530.observed_at).toBe('2026-11-02T15:00:00+08:00')
    expect(now1530.age_min_gauge).toBe(5)
    expect(now1530.state_gauge).toBe('fresh')

    const at1515 = runStreamTick('2026-11-02T15:15:00+08:00', '2026-11-02T15:10:00+08:00')
    const now1545At1515 = findNow(at1515, 'w-1545')
    expect(now1545At1515['w.rain_max_60m_mm']).toBe('')
    expect(now1545At1515['w.rain_max_4h_mm']).toBe('')

    const at1520 = runStreamTick('2026-11-02T15:20:00+08:00', '2026-11-02T15:15:00+08:00')
    const now1545At1520 = findNow(at1520, 'w-1545')
    expect(now1545At1520['w.rain_max_60m_mm']).toBe(54.0)
  })

  test('no future-observation leakage, latest revision wins, half-open (T-N, T] boundary, and zero vs blank', () => {
    const fullReadings = adaptJpsReadings({ receivedAt: '2026-11-02T15:00:00+08:00' })
    const staleRevision: Row<'readings'> = {
      reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      metric: 'rain_5m_mm',
      observed_at: '2026-11-02T15:00:00+08:00',
      received_at: '2026-11-02T15:00:00+08:00',
      value: 500,
      unit: 'mm',
      http_status: 200,
      latency_ms: 100,
      poll_id: 'poll-old',
      revision: 0,
      note: 'superseded'
    }
    const boundaryExcluded: Row<'readings'> = {
      reading_id: '0232901RF:rain_5m_mm:2026-11-02T14:00:00+08:00',
      source_kind: 'jps_rain',
      source_id: '0232901RF',
      metric: 'rain_5m_mm',
      observed_at: '2026-11-02T14:00:00+08:00',
      received_at: '2026-11-02T14:00:00+08:00',
      value: 88,
      unit: 'mm',
      http_status: 200,
      latency_ms: 100,
      poll_id: 'poll-boundary',
      revision: 2,
      note: 'exact T-60m must be excluded from (T-60m, T]'
    }

    const snap = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        readings: [...fullReadings, staleRevision, boundaryExcluded],
        polls: [
          {
            poll_id: 'poll-jps-1',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:00:12+08:00',
            received_at: '2026-11-02T15:00:14+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        windows: [
          {
            window_id: 'w-1500',
            subscriber_id: 'sub-1',
            kind: 'commute_wave',
            date: '2026-11-02',
            start_myt: '14:00',
            end_myt: '15:30',
            status: 'active'
          },
          {
            window_id: 'w-dry',
            subscriber_id: 'sub-1',
            kind: 'commute_wave',
            date: '2026-11-02',
            start_myt: '2026-11-02T08:00:00+08:00',
            end_myt: '2026-11-02T09:00:00+08:00',
            status: 'active'
          }
        ]
      })
    )

    expect(findNow(snap, 'w-1500')['w.rain_max_60m_mm']).toBe(39.0)
    expect(findNow(snap, 'w-dry')['w.rain_max_60m_mm']).toBe(0)
    expect(snap.inputs.gauge.observedAt).toBe('2026-11-02T15:00:00+08:00')
    expect(snap.inputs.gauge.ageMin).toBe(0)
  })

  test('SIG-3 and I-3 recovery checkpoint: stale at 15:00 -> recovered on backfill batch -> stays recovered on repeat/revision -> fresh on new timestamp', () => {
    const cutAt1400 = adaptJpsReadings({
      upToIso: '2026-11-02T14:00:00+08:00',
      receivedAt: '2026-11-02T14:00:00+08:00'
    })
    const windowRow: Row<'windows'> = {
      window_id: 'w-rec',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '2026-11-02T14:00:00+08:00',
      end_myt: '2026-11-02T15:30:00+08:00',
      status: 'active'
    }

    const tick1Stale = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        readings: cutAt1400,
        polls: [
          {
            poll_id: 'p-1400',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T14:00:00+08:00',
            received_at: '2026-11-02T14:00:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        windows: [windowRow]
      })
    )
    expect(tick1Stale.inputs.gauge.state).toBe('stale')
    expect(tick1Stale.inputs.gauge.ageMin).toBe(60)
    expect(findNow(tick1Stale, 'w-rec')['w.rain_max_60m_mm']).toBe('')

    const backfillUpTo1500 = adaptJpsReadings({
      upToIso: '2026-11-02T15:00:00+08:00',
      pollId: 'p-1505',
      receivedAt: '2026-11-02T15:05:00+08:00'
    })
    const tick2Recovered = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:05:00+08:00',
        sources: baseSources({
          '0232901RF': { state: 'stale', state_since: '2026-11-02T15:00:00+08:00' }
        }),
        readings: backfillUpTo1500,
        polls: [
          {
            poll_id: 'p-1505',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:05:00+08:00',
            received_at: '2026-11-02T15:05:03+08:00',
            http_status: 200,
            latency_ms: 90,
            outcome: 'ok',
            new_rows: 12
          }
        ],
        previousIndicators: tick1Stale.indicatorRows,
        windows: [windowRow]
      })
    )
    expect(tick2Recovered.inputs.gauge.state).toBe('recovered')
    expect(tick2Recovered.inputs.gauge.stateSince).toBe('2026-11-02T15:05:00+08:00')
    expect(findIndicator(tick2Recovered, 'site', 'age_min_gauge').observed_at).toBe('2026-11-02T15:00:00+08:00')

    const revisedSameTimestamp: Row<'readings'> = {
      ...backfillUpTo1500[backfillUpTo1500.length - 1]!,
      value: 10.0,
      revision: 2,
      poll_id: 'p-1505-rev',
      received_at: '2026-11-02T15:08:00+08:00'
    }
    const tick3StillRecovered = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:08:00+08:00',
        sources: baseSources({
          '0232901RF': { state: 'recovered', state_since: '2026-11-02T15:05:00+08:00' }
        }),
        readings: [...backfillUpTo1500, revisedSameTimestamp],
        polls: [
          {
            poll_id: 'p-1505-rev',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:08:00+08:00',
            received_at: '2026-11-02T15:08:02+08:00',
            http_status: 200,
            latency_ms: 85,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        previousIndicators: tick2Recovered.indicatorRows,
        windows: [windowRow]
      })
    )
    expect(tick3StillRecovered.inputs.gauge.state).toBe('recovered')
    expect(tick3StillRecovered.inputs.gauge.stateSince).toBe('2026-11-02T15:05:00+08:00')

    const with1505Obs = adaptJpsReadings({
      upToIso: '2026-11-02T15:05:00+08:00',
      pollId: 'p-1510',
      receivedAt: '2026-11-02T15:10:00+08:00'
    })
    const tick4Fresh = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:10:00+08:00',
        sources: baseSources({
          '0232901RF': { state: 'recovered', state_since: '2026-11-02T15:05:00+08:00' }
        }),
        readings: with1505Obs,
        polls: [
          {
            poll_id: 'p-1510',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:10:00+08:00',
            received_at: '2026-11-02T15:10:02+08:00',
            http_status: 200,
            latency_ms: 85,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        previousIndicators: tick2Recovered.indicatorRows,
        windows: [windowRow]
      })
    )
    expect(tick4Fresh.inputs.gauge.state).toBe('fresh')
    expect(tick4Fresh.inputs.gauge.stateSince).toBe('2026-11-02T15:10:00+08:00')
  })

  test('APIMS fixture at 5 Nov 21:13 -> CA16W max 67, age 13, fresh; subsequent error poll blanks API values; 06:00 history and worst station state', () => {
    const apimsReadings = adaptApimsReadings('poll-apims-ok', '2026-11-05T21:05:00+08:00')
    const history0600: Row<'readings'>[] = [
      { d: '2026-11-05', v: 58 },
      { d: '2026-11-04', v: 54 },
      { d: '2026-11-02', v: 49 },
      { d: '2026-11-01', v: 41 }
    ].map((item) => ({
      reading_id: `CA16W:api:${item.d}T06:00:00+08:00`,
      source_kind: 'apims',
      source_id: 'CA16W',
      metric: 'api',
      observed_at: `${item.d}T06:00:00+08:00`,
      received_at: `${item.d}T06:10:00+08:00`,
      value: item.v,
      unit: 'API',
      http_status: 200,
      latency_ms: 100,
      poll_id: 'poll-apims-hist',
      revision: 1,
      note: ''
    }))

    const tEval = '2026-11-05T21:13:00+08:00'
    const okSnap = computeSkySnapshot(
      makeInput({
        tEval,
        readings: [...history0600, ...apimsReadings],
        polls: [
          {
            poll_id: 'poll-apims-ok',
            source_kind: 'apims',
            source_id: 'apims',
            started_at: '2026-11-05T21:05:00+08:00',
            received_at: '2026-11-05T21:05:02+08:00',
            http_status: 200,
            latency_ms: 140,
            outcome: 'ok',
            new_rows: 3
          }
        ]
      })
    )

    const siteNow = findNow(okSnap, 'site')
    expect(siteNow['site.api_max']).toBe(67)
    expect(siteNow['site.api_max_station']).toBe('CA16W')
    expect(siteNow.age_min_apims).toBe(13)
    expect(siteNow.state_apims).toBe('fresh')
    expect(okSnap.inputs.apims.stations.CA16W?.ageMin).toBe(13)
    expect(okSnap.inputs.apims.stations.CA17W?.ageMin).toBe(13)
    expect(okSnap.inputs.apims.stations.CA19B?.ageMin).toBe(13)

    const parsed0600 = JSON.parse(String(siteNow['site.api_0600'])) as Record<
      string,
      Array<{ date: string; value: number }>
    >
    expect(parsed0600.CA16W).toEqual([
      { date: '2026-11-05', value: 58 },
      { date: '2026-11-04', value: 54 },
      { date: '2026-11-02', value: 49 }
    ])

    const errSnap = computeSkySnapshot(
      makeInput({
        tEval,
        readings: [...history0600, ...apimsReadings],
        polls: [
          {
            poll_id: 'poll-apims-ok',
            source_kind: 'apims',
            source_id: 'apims',
            started_at: '2026-11-05T21:05:00+08:00',
            received_at: '2026-11-05T21:05:02+08:00',
            http_status: 200,
            latency_ms: 140,
            outcome: 'ok',
            new_rows: 3
          },
          {
            poll_id: 'poll-apims-err',
            source_kind: 'apims',
            source_id: 'apims',
            started_at: '2026-11-05T21:12:00+08:00',
            received_at: '2026-11-05T21:12:05+08:00',
            http_status: 503,
            latency_ms: 500,
            outcome: 'error',
            new_rows: 0,
            error: 'HTTP 503'
          }
        ]
      })
    )
    const errNow = findNow(errSnap, 'site')
    expect(errNow.state_apims).toBe('error')
    expect(errNow['site.api_max']).toBe('')
    expect(errNow['site.api_max_station']).toBe('')
    expect(errNow['site.api_0600']).toBe('')
  })

  test('MET warning fixture gives FALSE for 21:00-22:00 KL window; active KL overlap gives TRUE; receipt seconds in same minute yield age 0', () => {
    const warnings = adaptMetWarnings('poll-met-ok', '2026-11-05T21:13:14+08:00')
    const win2100: Row<'windows'> = {
      window_id: 'w-2100',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-05',
      start_myt: '2026-11-05T21:00:00+08:00',
      end_myt: '2026-11-05T22:00:00+08:00',
      status: 'active'
    }

    const snap = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-05T21:13:00+08:00',
        warnings,
        polls: [
          {
            poll_id: 'poll-met-ok',
            source_kind: 'met_warning',
            source_id: 'met_warning',
            started_at: '2026-11-05T21:13:12+08:00',
            received_at: '2026-11-05T21:13:14+08:00',
            http_status: 200,
            latency_ms: 95,
            outcome: 'ok',
            new_rows: 4
          }
        ],
        windows: [win2100]
      })
    )

    const nowWin = findNow(snap, 'w-2100')
    expect(nowWin.age_min_met).toBe(0)
    expect(nowWin.state_met).toBe('fresh')
    expect(nowWin['w.met_kl_warning_in_force']).toBe(false)
    expect(nowWin['w.met_warning_keys']).toBe('[]')

    const klWarning: Row<'warnings'> = {
      warning_key: 'met:kl:2026-11-05T21:05:00+08:00',
      issued: '2026-11-05T21:05:00+08:00',
      title_en: 'Thunderstorms Warning',
      title_bm: 'Amaran Ribut Petir',
      valid_from: '2026-11-05T21:00:00+08:00',
      valid_to: '2026-11-06T01:00:00+08:00',
      heading_en: 'THUNDERSTORMS WARNING',
      text_en: 'Thunderstorms expected over WP Kuala Lumpur.',
      text_bm: 'Ribut petir dijangka di WP Kuala Lumpur.',
      first_seen_at: '2026-11-05T21:13:14+08:00',
      last_seen_at: '2026-11-05T21:13:14+08:00',
      poll_id: 'poll-met-ok',
      http_status: 200,
      latency_ms: 95,
      names_kl: true
    }

    const withKl = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-05T21:13:00+08:00',
        warnings: [...warnings, klWarning],
        polls: [
          {
            poll_id: 'poll-met-ok',
            source_kind: 'met_warning',
            source_id: 'met_warning',
            started_at: '2026-11-05T21:13:12+08:00',
            received_at: '2026-11-05T21:13:14+08:00',
            http_status: 200,
            latency_ms: 95,
            outcome: 'ok',
            new_rows: 5
          }
        ],
        windows: [win2100]
      })
    )
    expect(findNow(withKl, 'w-2100')['w.met_kl_warning_in_force']).toBe(true)
    expect(findNow(withKl, 'w-2100')['w.met_warning_keys']).toBe(JSON.stringify(['met:kl:2026-11-05T21:05:00+08:00']))
  })

  describe('current MET warning revisions', () => {
    const warning: Row<'warnings'> = {
      warning_key: '2026-11-05T21:00:00+08:00·Thunderstorms Warning·2026-11-05T20:00:00+08:00',
      issued: '2026-11-05T21:00:00+08:00',
      first_seen_at: '2026-11-05T21:01:00+08:00',
      valid_from: '2026-11-05T20:00:00+08:00',
      valid_to: '2026-11-05T22:00:00+08:00',
      title_en: 'Thunderstorms Warning',
      text_en: 'Kuala Lumpur',
      names_kl: true
    }
    function current(
      warnings: Row<'warnings'>[],
      polls: Row<'polls'>[] = [
        {
          poll_id: 'test-only-met-poll',
          source_kind: 'met_warning',
          source_id: 'met_warning',
          received_at: '2026-11-05T21:13:00+08:00',
          outcome: 'ok'
        }
      ]
    ) {
      return findNow(
        computeSkySnapshot(
          makeInput({
            tEval: '2026-11-05T21:13:00+08:00',
            warnings,
            polls,
            windows: [
              {
                window_id: 'test-only-warning-window',
                date: '2026-11-05',
                start_myt: '21:00',
                end_myt: '22:00',
                status: 'active'
              }
            ]
          })
        ),
        'test-only-warning-window'
      )
    }

    test.each([
      { names_kl: false },
      { valid_to: '2026-11-05T20:59:00+08:00' },
      { title_en: 'No Advisory' },
      { title_en: 'Strong Winds and Rough Seas Warning' },
      { text_en: 'FOR MALAYSIAN WATERS' }
    ])('newest eligible revision removes the old active warning: %j', (change) => {
      const newer = { ...warning, ...change, first_seen_at: '2026-11-05T21:02:00+08:00' }
      for (const rows of [
        [warning, newer],
        [newer, warning]
      ]) {
        const now = current(rows)
        expect(now['w.met_kl_warning_in_force']).toBe(false)
        expect(now['w.met_warning_keys']).toBe('[]')
      }
    })

    test('minute availability precedes latest selection, including receipt seconds in the evaluation minute', () => {
      const nextMinute = { ...warning, names_kl: false, first_seen_at: '2026-11-05T21:14:00+08:00' }
      expect(current([warning, nextMinute])['w.met_kl_warning_in_force']).toBe(true)
      const sameMinute = { ...nextMinute, first_seen_at: '2026-11-05T21:13:59+08:00' }
      expect(current([warning, sameMinute])['w.met_kl_warning_in_force']).toBe(false)
    })

    test('A to B to A uses the last receipt rather than historical content or input sorting', () => {
      const removed = { ...warning, names_kl: false, first_seen_at: '2026-11-05T21:02:00+08:00' }
      const restored = { ...warning, first_seen_at: '2026-11-05T21:03:00+08:00' }
      const now = current([restored, warning, removed])
      expect(now['w.met_kl_warning_in_force']).toBe(true)
      expect(now['w.met_warning_keys']).toBe(JSON.stringify([warning.warning_key]))
    })

    test('equal issued and receipt instants use the later physical revision', () => {
      const removed = { ...warning, names_kl: false }
      expect(current([warning, removed])['w.met_kl_warning_in_force']).toBe(false)
      expect(current([removed, warning])['w.met_kl_warning_in_force']).toBe(true)
    })

    test('issued precedence does not add an indicator issued-availability cutoff', () => {
      const newerIssue = {
        ...warning,
        issued: '2026-11-05T21:14:00+08:00',
        names_kl: false
      }
      const laterReceipt = { ...warning, first_seen_at: '2026-11-05T21:12:00+08:00' }
      expect(current([newerIssue, laterReceipt])['w.met_kl_warning_in_force']).toBe(false)
    })

    test('native and padded metadata retain indicator timestamp interpretation', () => {
      const base = {
        ...warning,
        issued: new Date('2026-11-05T21:00:00+08:00'),
        first_seen_at: new Date('2026-11-05T21:01:00+08:00')
      }
      const removed = {
        ...warning,
        issued: '2026-11-05T13:00:00Z ',
        first_seen_at: '2026-11-05T13:02:00Z ',
        names_kl: false
      }
      expect(current([base])['w.met_kl_warning_in_force']).toBe(true)
      expect(current([base, removed])['w.met_kl_warning_in_force']).toBe(false)
    })

    test('unknown MET state keeps warning indicators blank', () => {
      const now = current([warning], [])
      expect(now['w.met_kl_warning_in_force']).toBe('')
      expect(now['w.met_warning_keys']).toBe('')
    })
  })

  test('camera daylight/probation/last3frames rain sum, forecast today newest vs blank, and schema row compatibility', () => {
    const camFrames: Row<'readings'>[] = [
      { t: '2026-11-02T14:45:00+08:00', v: 0.42 },
      { t: '2026-11-02T14:50:00+08:00', v: 0.35 },
      { t: '2026-11-02T14:55:00+08:00', v: 0.28 },
      { t: '2026-11-02T15:00:00+08:00', v: 0.21 }
    ].map((f) => ({
      reading_id: `cam_01:contrast_far:${f.t}`,
      source_kind: 'camera',
      source_id: 'cam_01',
      metric: 'contrast_far',
      observed_at: f.t,
      received_at: f.t,
      value: f.v,
      unit: 'ratio',
      http_status: 200,
      latency_ms: 50,
      poll_id: 'poll-cam',
      revision: 1,
      note: ''
    }))
    const rainReadings = adaptJpsReadings({
      upToIso: '2026-11-02T15:00:00+08:00',
      receivedAt: '2026-11-02T15:00:00+08:00'
    })

    const snap = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        sources: baseSources({ cam_01: { probation: true } }),
        readings: [...rainReadings, ...camFrames],
        polls: [
          {
            poll_id: 'poll-jps-1',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:00:00+08:00',
            received_at: '2026-11-02T15:00:01+08:00',
            http_status: 200,
            latency_ms: 60,
            outcome: 'ok',
            new_rows: 1
          },
          {
            poll_id: 'poll-fc',
            source_kind: 'met_forecast',
            source_id: 'Ds058',
            started_at: '2026-11-02T14:30:00+08:00',
            received_at: '2026-11-02T14:30:02+08:00',
            http_status: 200,
            latency_ms: 70,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        forecast: [
          {
            date: '2026-11-02',
            location_id: 'Ds058',
            first_seen_at: '2026-11-02T08:00:00+08:00',
            poll_id: 'poll-fc-old',
            afternoon_thunderstorm: false
          },
          {
            date: '2026-11-02',
            location_id: 'Ds058',
            first_seen_at: '2026-11-02T14:30:00+08:00',
            poll_id: 'poll-fc',
            afternoon_thunderstorm: true
          }
        ]
      })
    )

    const siteNow = findNow(snap, 'site')
    expect(siteNow.state_camera).toBe('probation')
    expect(JSON.parse(String(siteNow['site.camera_far_ratio_last3']))).toEqual([
      { value: 0.21, observed_at: '2026-11-02T15:00:00+08:00' },
      { value: 0.28, observed_at: '2026-11-02T14:55:00+08:00' },
      { value: 0.35, observed_at: '2026-11-02T14:50:00+08:00' }
    ])
    expect(siteNow['site.gauge_rain_last3frames_mm']).toBe(18.0)
    expect(siteNow['site.met_afternoon_thunderstorm']).toBe(true)

    for (const row of snap.nowRows) expect(() => toRow('now', row)).not.toThrow()
    for (const row of snap.indicatorRows) expect(() => toRow('indicators', row)).not.toThrow()

    const offHoursSnap = computeSkySnapshot(makeInput({ tEval: '2026-11-02T20:00:00+08:00', readings: camFrames }))
    expect(findNow(offHoursSnap, 'site').state_camera).toBe('off_hours')
    expect(findNow(offHoursSnap, 'site')['site.met_afternoon_thunderstorm']).toBe('')
  })
})

describe('Task 2 #54: Round 1 regressions for forecast checkpoint, post-error data recovery, and strict bound source IDs', () => {
  test('forecast Ds058 uses its own age_min_forecast checkpoint: older age_min_met does not clear repeated poll, and later poll clears when warnings are absent', () => {
    const recSnap = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        sources: baseSources({
          Ds058: { state: 'error', state_since: '2026-11-02T14:30:00+08:00' }
        }),
        polls: [
          {
            poll_id: 'poll-met-1450',
            source_kind: 'met_warning',
            source_id: 'met_warning',
            started_at: '2026-11-02T14:50:00+08:00',
            received_at: '2026-11-02T14:50:00+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 0
          },
          {
            poll_id: 'poll-fc-1500',
            source_kind: 'met_forecast',
            source_id: 'Ds058',
            started_at: '2026-11-02T15:00:10+08:00',
            received_at: '2026-11-02T15:00:14+08:00',
            http_status: 200,
            latency_ms: 90,
            outcome: 'ok',
            new_rows: 1
          }
        ]
      })
    )
    expect(recSnap.sourceStates.Ds058?.state).toBe('recovered')
    expect(recSnap.sourceStates.Ds058?.stateSince).toBe('2026-11-02T15:00:00+08:00')
    expect(findIndicator(recSnap, 'site', 'age_min_forecast').observed_at).toBe('2026-11-02T15:00:14+08:00')
    expect(findIndicator(recSnap, 'site', 'age_min_met').observed_at).toBe('2026-11-02T14:50:00+08:00')

    const repeatAt1505 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:05:00+08:00',
        sources: baseSources({
          Ds058: { state: 'recovered', state_since: '2026-11-02T15:00:00+08:00' }
        }),
        polls: [
          {
            poll_id: 'poll-met-1450',
            source_kind: 'met_warning',
            source_id: 'met_warning',
            started_at: '2026-11-02T14:50:00+08:00',
            received_at: '2026-11-02T14:50:00+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 0
          },
          {
            poll_id: 'poll-fc-1500',
            source_kind: 'met_forecast',
            source_id: 'Ds058',
            started_at: '2026-11-02T15:00:10+08:00',
            received_at: '2026-11-02T15:00:14+08:00',
            http_status: 200,
            latency_ms: 90,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        previousIndicators: recSnap.indicatorRows
      })
    )
    expect(repeatAt1505.sourceStates.Ds058?.state).toBe('recovered')
    expect(repeatAt1505.sourceStates.Ds058?.stateSince).toBe('2026-11-02T15:00:00+08:00')

    const sourcesWithoutWarnings = baseSources({
      Ds058: { state: 'recovered', state_since: '2026-11-02T15:00:00+08:00' }
    }).filter((s) => s.source_id !== 'met_warning')
    const laterAt1510 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:10:00+08:00',
        sources: sourcesWithoutWarnings,
        polls: [
          {
            poll_id: 'poll-fc-1510',
            source_kind: 'met_forecast',
            source_id: 'Ds058',
            started_at: '2026-11-02T15:10:02+08:00',
            received_at: '2026-11-02T15:10:05+08:00',
            http_status: 200,
            latency_ms: 85,
            outcome: 'unchanged',
            new_rows: 0
          }
        ],
        previousIndicators: recSnap.indicatorRows.filter((r) => r.name !== 'age_min_met')
      })
    )
    expect(laterAt1510.sourceStates.Ds058?.state).toBe('fresh')
    expect(laterAt1510.sourceStates.Ds058?.stateSince).toBe('2026-11-02T15:10:00+08:00')
  })

  test('gauge error recovery requires a genuinely new observation: unchanged/revised 14:55 stays error, 15:00/15:05 batch is recovered, 15:10 is fresh', () => {
    const preErrorReadings = adaptJpsReadings({
      upToIso: '2026-11-02T14:55:00+08:00',
      pollId: 'p-1455',
      receivedAt: '2026-11-02T14:55:00+08:00'
    })
    const applyUpdates = (current: Row<'sources'>[], updates: SkySnapshot['sourceUpdates']): Row<'sources'>[] =>
      current.map((s) => {
        const u = updates.find((item) => item.source_id === s.source_id)
        return u ? { ...s, state: u.state, state_since: u.state_since } : s
      })

    const tick1Err = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        readings: preErrorReadings,
        polls: [
          {
            poll_id: 'p-1500-err',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:00:00+08:00',
            received_at: '2026-11-02T15:00:02+08:00',
            http_status: 503,
            latency_ms: 400,
            outcome: 'error',
            new_rows: 0
          }
        ]
      })
    )
    expect(tick1Err.inputs.gauge.state).toBe('error')
    expect(tick1Err.inputs.gauge.stateSince).toBe('2026-11-02T15:00:00+08:00')
    expect(findIndicator(tick1Err, 'site', 'age_min_gauge').observed_at).toBe('2026-11-02T14:55:00+08:00')

    const revised1455: Row<'readings'> = {
      ...preErrorReadings[preErrorReadings.length - 1]!,
      value: 12.0,
      revision: 2,
      poll_id: 'p-1505-unchanged',
      received_at: '2026-11-02T15:05:02+08:00'
    }
    const sourcesAt1505 = applyUpdates(baseSources(), tick1Err.sourceUpdates)
    const tick2Unconfirmed = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:05:00+08:00',
        sources: sourcesAt1505,
        readings: [...preErrorReadings, revised1455],
        polls: [
          {
            poll_id: 'p-1505-unchanged',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:05:00+08:00',
            received_at: '2026-11-02T15:05:02+08:00',
            http_status: 200,
            latency_ms: 85,
            outcome: 'unchanged',
            new_rows: 0
          }
        ],
        previousIndicators: tick1Err.indicatorRows
      })
    )
    expect(tick2Unconfirmed.inputs.gauge.state).toBe('error')
    expect(tick2Unconfirmed.inputs.gauge.stateSince).toBe('2026-11-02T15:00:00+08:00')

    const sourcesAt1510 = applyUpdates(sourcesAt1505, tick2Unconfirmed.sourceUpdates)
    const tick3Recovered = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:10:00+08:00',
        sources: sourcesAt1510,
        readings: adaptJpsReadings({
          upToIso: '2026-11-02T15:05:00+08:00',
          pollId: 'p-1510-ok',
          receivedAt: '2026-11-02T15:10:02+08:00'
        }),
        polls: [
          {
            poll_id: 'p-1510-ok',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:10:00+08:00',
            received_at: '2026-11-02T15:10:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 2
          }
        ],
        previousIndicators: [...tick1Err.indicatorRows, ...tick2Unconfirmed.indicatorRows]
      })
    )
    expect(tick3Recovered.inputs.gauge.state).toBe('recovered')
    expect(tick3Recovered.inputs.gauge.stateSince).toBe('2026-11-02T15:10:00+08:00')

    const sourcesAt1515 = applyUpdates(sourcesAt1510, tick3Recovered.sourceUpdates)
    const tick4Fresh = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:15:00+08:00',
        sources: sourcesAt1515,
        readings: adaptJpsReadings({
          upToIso: '2026-11-02T15:10:00+08:00',
          pollId: 'p-1515-ok',
          receivedAt: '2026-11-02T15:15:02+08:00'
        }),
        polls: [
          {
            poll_id: 'p-1515-ok',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:15:00+08:00',
            received_at: '2026-11-02T15:15:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        previousIndicators: [
          ...tick1Err.indicatorRows,
          ...tick2Unconfirmed.indicatorRows,
          ...tick3Recovered.indicatorRows
        ]
      })
    )
    expect(tick4Fresh.inputs.gauge.state).toBe('fresh')
    expect(tick4Fresh.inputs.gauge.stateSince).toBe('2026-11-02T15:15:00+08:00')
  })

  test('gauge error recovery without prior diagnostic checkpoint: unchanged and ok revision of 14:55 stay error, 15:05 batch becomes recovered, repeat stays recovered, 15:10 becomes fresh', () => {
    const preErrorReadings = adaptJpsReadings({
      upToIso: '2026-11-02T14:55:00+08:00',
      pollId: 'p-1455',
      receivedAt: '2026-11-02T14:55:00+08:00'
    })
    const errSources = baseSources({
      '0232901RF': { state: 'error', state_since: '2026-11-02T15:00:00+08:00' }
    })

    const unchangedAt1503 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:03:00+08:00',
        sources: errSources,
        readings: preErrorReadings,
        polls: [
          {
            poll_id: 'p-1503-unchanged',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:03:00+08:00',
            received_at: '2026-11-02T15:03:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'unchanged',
            new_rows: 0
          }
        ]
      })
    )
    expect(unchangedAt1503.inputs.gauge.state).toBe('error')
    expect(unchangedAt1503.inputs.gauge.stateSince).toBe('2026-11-02T15:00:00+08:00')

    const revised1455: Row<'readings'> = {
      ...preErrorReadings[preErrorReadings.length - 1]!,
      value: 12.0,
      revision: 2,
      poll_id: 'p-1505-rev-ok',
      received_at: '2026-11-02T15:05:02+08:00'
    }
    const revOkAt1505 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:05:00+08:00',
        sources: errSources,
        readings: [...preErrorReadings, revised1455],
        polls: [
          {
            poll_id: 'p-1505-rev-ok',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:05:00+08:00',
            received_at: '2026-11-02T15:05:02+08:00',
            http_status: 200,
            latency_ms: 85,
            outcome: 'ok',
            new_rows: 1
          }
        ]
      })
    )
    expect(revOkAt1505.inputs.gauge.state).toBe('error')
    expect(revOkAt1505.inputs.gauge.stateSince).toBe('2026-11-02T15:00:00+08:00')

    const readingsTo1505 = adaptJpsReadings({
      upToIso: '2026-11-02T15:05:00+08:00',
      pollId: 'p-1510-ok',
      receivedAt: '2026-11-02T15:10:02+08:00'
    })
    const recoveredAt1510 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:10:00+08:00',
        sources: errSources,
        readings: readingsTo1505,
        polls: [
          {
            poll_id: 'p-1510-ok',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:10:00+08:00',
            received_at: '2026-11-02T15:10:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 2
          }
        ]
      })
    )
    expect(recoveredAt1510.inputs.gauge.state).toBe('recovered')
    expect(recoveredAt1510.inputs.gauge.stateSince).toBe('2026-11-02T15:10:00+08:00')

    const recoveredSources = baseSources({
      '0232901RF': { state: 'recovered', state_since: '2026-11-02T15:10:00+08:00' }
    })
    const repeatAt1512 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:12:00+08:00',
        sources: recoveredSources,
        readings: readingsTo1505,
        polls: [
          {
            poll_id: 'p-1512-unchanged',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:12:00+08:00',
            received_at: '2026-11-02T15:12:02+08:00',
            http_status: 200,
            latency_ms: 75,
            outcome: 'unchanged',
            new_rows: 0
          }
        ],
        previousIndicators: recoveredAt1510.indicatorRows
      })
    )
    expect(repeatAt1512.inputs.gauge.state).toBe('recovered')
    expect(repeatAt1512.inputs.gauge.stateSince).toBe('2026-11-02T15:10:00+08:00')

    const freshAt1515 = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:15:00+08:00',
        sources: recoveredSources,
        readings: adaptJpsReadings({
          upToIso: '2026-11-02T15:10:00+08:00',
          pollId: 'p-1515-ok',
          receivedAt: '2026-11-02T15:15:02+08:00'
        }),
        polls: [
          {
            poll_id: 'p-1515-ok',
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: '2026-11-02T15:15:00+08:00',
            received_at: '2026-11-02T15:15:02+08:00',
            http_status: 200,
            latency_ms: 80,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        previousIndicators: recoveredAt1510.indicatorRows
      })
    )
    expect(freshAt1515.inputs.gauge.state).toBe('fresh')
    expect(freshAt1515.inputs.gauge.stateSince).toBe('2026-11-02T15:15:00+08:00')
  })

  test('missing bound sources do not fall back to other configured sources of the same kind', () => {
    const sampleReading = adaptJpsReadings({
      fromIso: '2026-11-02T15:00:00+08:00',
      upToIso: '2026-11-02T15:00:00+08:00',
      receivedAt: '2026-11-02T15:00:00+08:00'
    })[0]!
    const relabelledReading: Row<'readings'> = {
      ...sampleReading,
      source_id: 'other-gauge',
      reading_id: `other-gauge:rain_5m_mm:${String(sampleReading.observed_at)}`
    }
    const nonBoundSources = [
      ...baseSources().filter((s) => !['0232901RF', 'met_warning', 'Ds058'].includes(String(s.source_id))),
      {
        source_id: 'other-gauge',
        kind: 'jps_rain',
        name: 'Other Rain Gauge',
        cadence_min: 5,
        stale_after_min: 10,
        freshness: 'observed',
        state: 'fresh',
        state_since: '2026-11-02T00:00:00+08:00',
        probation: false
      },
      {
        source_id: 'other-warning',
        kind: 'met_warning',
        name: 'Other Warning Source',
        cadence_min: 10,
        stale_after_min: 20,
        freshness: 'polled',
        state: 'fresh',
        state_since: '2026-11-02T00:00:00+08:00',
        probation: false
      },
      {
        source_id: 'other-forecast',
        kind: 'met_forecast',
        name: 'Other Forecast Source',
        cadence_min: 360,
        stale_after_min: 720,
        freshness: 'polled',
        state: 'fresh',
        state_since: '2026-11-02T00:00:00+08:00',
        probation: false
      }
    ] satisfies Row<'sources'>[]

    const snap = computeSkySnapshot(
      makeInput({
        tEval: '2026-11-02T15:00:00+08:00',
        sources: nonBoundSources,
        readings: [relabelledReading],
        polls: [
          {
            poll_id: 'p-other-warn',
            source_kind: 'met_warning',
            source_id: 'other-warning',
            started_at: '2026-11-02T15:00:00+08:00',
            received_at: '2026-11-02T15:00:01+08:00',
            http_status: 200,
            latency_ms: 50,
            outcome: 'ok',
            new_rows: 1
          },
          {
            poll_id: 'p-other-fc',
            source_kind: 'met_forecast',
            source_id: 'other-forecast',
            started_at: '2026-11-02T15:00:00+08:00',
            received_at: '2026-11-02T15:00:01+08:00',
            http_status: 200,
            latency_ms: 50,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        forecast: [
          {
            date: '2026-11-02',
            location_id: 'other-forecast',
            first_seen_at: '2026-11-02T15:00:00+08:00',
            poll_id: 'p-other-fc',
            afternoon_thunderstorm: true
          }
        ],
        windows: [
          {
            window_id: 'w-missing',
            subscriber_id: 'sub-1',
            kind: 'commute_wave',
            date: '2026-11-02',
            start_myt: '2026-11-02T14:00:00+08:00',
            end_myt: '2026-11-02T15:15:00+08:00',
            status: 'active'
          }
        ]
      })
    )

    const winNow = findNow(snap, 'w-missing')
    expect(snap.inputs.gauge.state).toBeNull()
    expect(snap.inputs.met.state).toBeNull()
    expect(winNow.state_gauge).toBe('')
    expect(winNow.age_min_gauge).toBe('')
    expect(winNow['w.rain_max_60m_mm']).toBe('')
    expect(winNow.state_met).toBe('')
    expect(winNow['w.met_kl_warning_in_force']).toBe('')
    expect(winNow['site.met_afternoon_thunderstorm']).toBe('')
  })
})
