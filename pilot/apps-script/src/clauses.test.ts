import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import {
  defaultSkyClauseRows,
  evaluateSkyClauses,
  SKY_CLAUSE_KEYS,
  SKY_MODE_RANKS,
  type SkyClauseInput,
  type SkyClauseKey,
  type SkyVerdict
} from './clauses.ts'
import {
  BOUND_APIMS_STATION_IDS,
  computeSkySnapshot,
  type IndicatorEvidence,
  type ResolvedInputState,
  type SkySnapshot,
  type SkySnapshotInput,
  type SourceState
} from './indicators.ts'
import { type Cell, type Row, toRow } from './schema.ts'

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}

interface PrdSkyClauseHumanRow {
  Clause: string
  Reads: string
  'Fires when (default)': string
  Proposes: string
}

const DEFAULT_DAYLIGHT = { start: '07:15', end: '19:00' }
const jpsCapture = JSON.parse(
  readFileSync(resolve(import.meta.dir, '../../fixtures/rainfall-graph-75-20261105T1312Z.json'), 'utf8')
) as JpsCapture

function parsePrdSkyClausesTable(): PrdSkyClauseHumanRow[] {
  const markdown = readFileSync(resolve(import.meta.dir, '../../../docs/PRD.md'), 'utf8')
  const lines = markdown.split(/\r?\n/)
  const headerIndex = lines.findIndex(
    (line) =>
      line.includes('| Clause') &&
      line.includes('| Reads') &&
      line.includes('| Fires when (default)') &&
      line.includes('| Proposes')
  )
  if (headerIndex === -1) throw new Error('Missing Default Sky clauses table in docs/PRD.md')

  const rows: PrdSkyClauseHumanRow[] = []
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? ''
    if (!line.startsWith('|')) break
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    if (cells.length === 4) {
      rows.push({
        Clause: cells[0]!,
        Reads: cells[1]!,
        'Fires when (default)': cells[2]!,
        Proposes: cells[3]!
      })
    }
  }
  return rows
}

function baseSources(overrides: Partial<Record<string, Partial<Row<'sources'>>>> = {}): Row<'sources'>[] {
  const specs: Array<[string, string, number, number, string]> = [
    ['0232901RF', 'jps_rain', 5, 10, 'observed'],
    ['CA16W', 'apims', 60, 120, 'observed'],
    ['CA19B', 'apims', 60, 120, 'observed'],
    ['CA17W', 'apims', 60, 120, 'observed'],
    ['met_warning', 'met_warning', 10, 20, 'polled'],
    ['Ds058', 'met_forecast', 360, 720, 'polled'],
    ['cam_01', 'camera', 10, 20, 'observed']
  ]
  return specs.map(([source_id, kind, cadence_min, stale_after_min, freshness]) => ({
    source_id,
    kind,
    name: source_id,
    cadence_min,
    stale_after_min,
    freshness,
    state: 'fresh',
    state_since: '2026-10-29T00:00:00+08:00',
    probation: false,
    ...(overrides[source_id] ?? {})
  }))
}

function adaptJpsReadings(opts: { upToIso?: string; receivedAt?: string } = {}): Row<'readings'>[] {
  const receivedAt = opts.receivedAt ?? '2026-11-02T16:00:00+08:00'
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
        poll_id: 'poll-jps',
        revision: 1
      } satisfies Row<'readings'>
    })
    .filter((r) => !opts.upToIso || r.observed_at <= opts.upToIso)
}

function makeApimsReadingsAt(
  observedAt: string,
  values: Partial<Record<(typeof BOUND_APIMS_STATION_IDS)[number], number>>,
  receivedAt = observedAt
): Row<'readings'>[] {
  return BOUND_APIMS_STATION_IDS.map((id) => ({
    reading_id: `${id}:api:${observedAt}`,
    source_kind: 'apims',
    source_id: id,
    metric: 'api',
    observed_at: observedAt,
    received_at: receivedAt,
    value: values[id] ?? 55,
    unit: 'API',
    poll_id: 'poll-apims',
    revision: 1
  }))
}

function makeCameraFrames(frames: Array<[string, number]>, receivedAt?: string): Row<'readings'>[] {
  return frames.map(([observedAt, value]) => ({
    reading_id: `cam_01:contrast_far:${observedAt}`,
    source_kind: 'camera',
    source_id: 'cam_01',
    metric: 'contrast_far',
    observed_at: observedAt,
    received_at: receivedAt ?? observedAt,
    value,
    unit: 'ratio',
    poll_id: 'poll-cam',
    revision: 1
  }))
}

function makeGaugeReading(observedAt: string, value: number, receivedAt = observedAt): Row<'readings'> {
  return {
    reading_id: `0232901RF:rain_5m_mm:${observedAt}`,
    source_kind: 'jps_rain',
    source_id: '0232901RF',
    metric: 'rain_5m_mm',
    observed_at: observedAt,
    received_at: receivedAt,
    value,
    unit: 'mm',
    poll_id: 'poll-jps',
    revision: 1
  }
}

function freshPollsAt(
  tEval: string,
  outcomes: Partial<Record<'gauge' | 'apims' | 'met' | 'camera', string>> = {}
): Row<'polls'>[] {
  const entries: Array<[string, string, string, string]> = [
    ['poll-jps', 'jps_rain', '0232901RF', outcomes.gauge ?? 'ok'],
    ['poll-apims', 'apims', 'apims', outcomes.apims ?? 'ok'],
    ['poll-met', 'met_warning', 'met_warning', outcomes.met ?? 'ok'],
    ['poll-forecast', 'met_forecast', 'Ds058', 'ok'],
    ['poll-cam', 'camera', 'cam_01', outcomes.camera ?? 'ok']
  ]
  return entries.map(([poll_id, source_kind, source_id, outcome]) => ({
    poll_id,
    source_kind,
    source_id,
    started_at: tEval,
    received_at: tEval,
    http_status: outcome === 'ok' ? 200 : 500,
    latency_ms: 85,
    outcome,
    new_rows: 1
  }))
}

function replayReleaseWaves(): Row<'windows'>[] {
  return ['14:30', '15:00', '15:30', '15:45'].map((clock) => ({
    window_id: `w-${clock.replace(':', '')}`,
    subscriber_id: 'sub-team',
    kind: 'commute_wave',
    date: '2026-11-02',
    start_myt: `2026-11-02T${clock}:00+08:00`,
    end_myt: `2026-11-02T${clock}:00+08:00`,
    language: 'en',
    status: 'active',
    declared_at: '2026-11-02T08:00:00+08:00',
    title: 'Replay (2 Nov 2026) release wave'
  }))
}

function makeSnapshot(overrides: Partial<SkySnapshotInput> & { tEval: string }): SkySnapshot {
  return computeSkySnapshot({
    tEval: overrides.tEval,
    sources: overrides.sources ?? baseSources(),
    readings: overrides.readings ?? [],
    polls: overrides.polls ?? freshPollsAt(overrides.tEval),
    warnings: overrides.warnings ?? [],
    forecast: overrides.forecast ?? [],
    windows: overrides.windows ?? [],
    previousIndicators: overrides.previousIndicators ?? [],
    daylight: overrides.daylight ?? DEFAULT_DAYLIGHT
  })
}

function findVerdict(verdicts: readonly SkyVerdict[], scope: string): SkyVerdict {
  const found = verdicts.find((v) => v.scope === scope)
  if (!found) throw new Error(`Missing verdict for scope ${scope}`)
  return found
}

describe('Task 3 #55 stage 1: defaultSkyClauseRows and pure evaluateSkyClauses', () => {
  test('CLS-1: defaultSkyClauseRows matches all six PRD Sky rows verbatim and encodes bound P0 machine columns', () => {
    const prdRows = parsePrdSkyClausesTable()
    expect(prdRows.length).toBe(6)

    const defaults = defaultSkyClauseRows()
    expect(defaults.length).toBe(6)

    expect(
      defaults.map((row) => ({
        Clause: String(row.Clause ?? ''),
        Reads: String(row.Reads ?? ''),
        'Fires when (default)': String(row['Fires when (default)'] ?? ''),
        Proposes: String(row.Proposes ?? '')
      }))
    ).toEqual(prdRows)

    for (const row of defaults) {
      expect(row.pack).toBe('sky')
      expect(row.enabled).toBe(true)
      expect(toRow('clauses', row).length).toBe(15)
    }

    const byKey = new Map(defaults.map((row) => [String(row.key), row]))
    expect(Array.from(byKey.keys())).toEqual([...SKY_CLAUSE_KEYS])

    const hazeWatch = byKey.get('haze_watch')!
    expect(JSON.parse(String(hazeWatch.requires))).toEqual(['site.api_max'])
    expect(hazeWatch.span_from).toBe('')
    expect(hazeWatch.span_to).toBe('')
    expect(JSON.parse(String(hazeWatch.threshold))).toEqual({
      api_max: 101,
      camera_far_ratio: 0.5,
      gauge_rain_last3frames_mm: 0
    })
    expect(JSON.parse(String(hazeWatch.op))).toEqual({
      api_max: '>=',
      camera_far_ratio: '<',
      gauge_rain_last3frames_mm: '==',
      join: 'or'
    })
    expect(hazeWatch.proposes_key).toBe('outdoor_limited')
    expect(hazeWatch.rank).toBe(1)
    expect(hazeWatch.wording_en).toBe('Limit outdoor activity for the window')

    const hazeSevere = byKey.get('haze_severe')!
    expect(JSON.parse(String(hazeSevere.requires))).toEqual(['site.api_max', 'site.api_0600'])
    expect(hazeSevere.span_from).toBe('')
    expect(hazeSevere.span_to).toBe('')
    expect(JSON.parse(String(hazeSevere.threshold))).toEqual({ api_max: 180, api_0600: 150, days: 3 })
    expect(JSON.parse(String(hazeSevere.op))).toEqual({ api_max: '>', api_0600: '>', join: 'or' })
    expect(hazeSevere.proposes_key).toBe('hybrid_recommended')
    expect(hazeSevere.rank).toBe(3)
    expect(hazeSevere.wording_en).toBe(
      "Hybrid is recommended; teaching mode is the lecturer's and the university's decision"
    )

    const stormWatch = byKey.get('storm_watch')!
    expect(JSON.parse(String(stormWatch.requires))).toEqual(['w.met_kl_warning_in_force'])
    expect(stormWatch.span_from).toBe('start')
    expect(stormWatch.span_to).toBe('end')
    expect(stormWatch.proposes_key).toBe('watch')
    expect(stormWatch.rank).toBe('')

    const stormConfirmed = byKey.get('storm_confirmed')!
    expect(JSON.parse(String(stormConfirmed.requires))).toEqual(['w.rain_max_60m_mm'])
    expect(stormConfirmed.span_from).toBe('end-30m')
    expect(stormConfirmed.span_to).toBe('end+60m')
    expect(Number(stormConfirmed.threshold)).toBe(31)
    expect(stormConfirmed.op).toBe('>=')
    expect(stormConfirmed.proposes_key).toBe('commute_disruption')
    expect(stormConfirmed.rank).toBe(2)
    expect(stormConfirmed.wording_en).toBe('Storm confirmed at the JPS gauge (Lebat class)')

    const flashFlood = byKey.get('flash_flood_risk')!
    expect(JSON.parse(String(flashFlood.requires))).toEqual(['w.rain_max_4h_mm'])
    expect(flashFlood.span_from).toBe('end-30m')
    expect(flashFlood.span_to).toBe('end+60m')
    expect(Number(flashFlood.threshold)).toBe(60)
    expect(flashFlood.op).toBe('>')
    expect(flashFlood.proposes_key).toBe('commute_disruption')
    expect(flashFlood.rank).toBe(2)
    expect(flashFlood.wording_en).toBe('Expect disruption getting to or leaving the window')

    const silentInput = byKey.get('silent_input')!
    expect(silentInput.proposes_key).toBe('no_call')
    expect(silentInput.rank).toBe('')
  })

  test('haze_watch and haze_severe API boundaries, including 3 consecutive local calendar days at one station vs non-consecutive rows', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const clauses = defaultSkyClauseRows()

    const evalSite = (apiReadings: Row<'readings'>[]): SkyVerdict => {
      const snap = makeSnapshot({
        tEval,
        readings: [makeGaugeReading('2026-11-02T15:00:00+08:00', 0, tEval), ...apiReadings]
      })
      return findVerdict(evaluateSkyClauses({ tEval, snapshot: snap, clauses, clauseVersion: 1 }), 'site')
    }

    const belowWatch = evalSite(makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 100 }, tEval))
    expect(belowWatch.clauses.haze_watch.status).toBe('not')
    expect(belowWatch.verdict).toBe('normal')

    const atWatch101 = evalSite(makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 101 }, tEval))
    expect(atWatch101.clauses.haze_watch.status).toBe('fired')
    expect(atWatch101.clauses.haze_severe.status).toBe('not')
    expect(atWatch101.verdict).toBe('outdoor_limited')

    const atSevere180 = evalSite(makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 180 }, tEval))
    expect(atSevere180.clauses.haze_watch.status).toBe('fired')
    expect(atSevere180.clauses.haze_severe.status).toBe('not')
    expect(atSevere180.verdict).toBe('outdoor_limited')

    const aboveSevere181 = evalSite(makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 181 }, tEval))
    expect(aboveSevere181.clauses.haze_watch.status).toBe('fired')
    expect(aboveSevere181.clauses.haze_severe.status).toBe('fired')
    expect(aboveSevere181.verdict).toBe('hybrid_recommended')
    expect(aboveSevere181.firedClauses).toEqual(['haze_watch', 'haze_severe'])

    const threeConsecutiveDays = evalSite([
      ...makeApimsReadingsAt('2026-10-31T06:00:00+08:00', { CA16W: 151 }, tEval),
      ...makeApimsReadingsAt('2026-11-01T06:00:00+08:00', { CA16W: 155 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T06:00:00+08:00', { CA16W: 160 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 90 }, tEval)
    ])
    expect(threeConsecutiveDays.clauses.haze_watch.status).toBe('not')
    expect(threeConsecutiveDays.clauses.haze_severe.status).toBe('fired')
    expect(threeConsecutiveDays.verdict).toBe('hybrid_recommended')

    const boundary150OnOneDay = evalSite([
      ...makeApimsReadingsAt('2026-10-31T06:00:00+08:00', { CA16W: 155 }, tEval),
      ...makeApimsReadingsAt('2026-11-01T06:00:00+08:00', { CA16W: 150 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T06:00:00+08:00', { CA16W: 160 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 90 }, tEval)
    ])
    expect(boundary150OnOneDay.clauses.haze_severe.status).toBe('not')

    const nonConsecutiveGapDay = evalSite([
      ...makeApimsReadingsAt('2026-10-29T06:00:00+08:00', { CA16W: 165 }, tEval),
      ...makeApimsReadingsAt('2026-10-31T06:00:00+08:00', { CA16W: 165 }, tEval),
      ...makeApimsReadingsAt('2026-11-01T06:00:00+08:00', { CA16W: 165 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 90 }, tEval)
    ])
    expect(nonConsecutiveGapDay.clauses.haze_severe.status).toBe('not')

    const splitStations = evalSite([
      ...makeApimsReadingsAt('2026-10-31T06:00:00+08:00', { CA16W: 165, CA19B: 70, CA17W: 70 }, tEval),
      ...makeApimsReadingsAt('2026-11-01T06:00:00+08:00', { CA16W: 70, CA19B: 165, CA17W: 70 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T06:00:00+08:00', { CA16W: 70, CA19B: 70, CA17W: 165 }, tEval),
      ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 90, CA19B: 90, CA17W: 90 }, tEval)
    ])
    expect(splitStations.clauses.haze_severe.status).toBe('not')
  })

  test('haze_watch camera branch (#60): fires on 3 fresh daylight frames < 0.5 with 0 mm fresh gauge rain even when API < 101; respects boundaries and optional camera states', () => {
    const tEval = '2026-11-02T12:00:00+08:00'
    const clauses = defaultSkyClauseRows()
    const apiNormal = makeApimsReadingsAt('2026-11-02T11:00:00+08:00', { CA16W: 65, CA19B: 60, CA17W: 58 }, tEval)
    const threeObscuredFrames = makeCameraFrames(
      [
        ['2026-11-02T11:35:00+08:00', 0.42],
        ['2026-11-02T11:45:00+08:00', 0.38],
        ['2026-11-02T11:55:00+08:00', 0.49]
      ],
      tEval
    )
    const dryGauge = [
      makeGaugeReading('2026-11-02T11:40:00+08:00', 0, tEval),
      makeGaugeReading('2026-11-02T11:55:00+08:00', 0, tEval)
    ]

    // 1. Camera-only haze_watch fires when API < 101, 3 fresh daylight frames < 0.5, and fresh gauge rain == 0
    const snapCameraFired = makeSnapshot({
      tEval,
      readings: [...apiNormal, ...threeObscuredFrames, ...dryGauge]
    })
    const vCameraFired = findVerdict(
      evaluateSkyClauses({ tEval, snapshot: snapCameraFired, clauses, clauseVersion: 1 }),
      'site'
    )
    expect(vCameraFired.clauses.haze_watch.status).toBe('fired')
    expect(vCameraFired.mode).toBe('outdoor_limited')
    expect(vCameraFired.verdict).toBe('outdoor_limited')

    // 2. Boundary 0.5 is NOT obscured (< 0.5 required)
    const snapBoundary05 = makeSnapshot({
      tEval,
      readings: [
        ...apiNormal,
        ...makeCameraFrames(
          [
            ['2026-11-02T11:35:00+08:00', 0.42],
            ['2026-11-02T11:45:00+08:00', 0.5],
            ['2026-11-02T11:55:00+08:00', 0.41]
          ],
          tEval
        ),
        ...dryGauge
      ]
    })
    expect(
      findVerdict(evaluateSkyClauses({ tEval, snapshot: snapBoundary05, clauses }), 'site').clauses.haze_watch.status
    ).toBe('not')

    // 3. Any one clear frame (>= 0.5) does not fire
    const snapOneClear = makeSnapshot({
      tEval,
      readings: [
        ...apiNormal,
        ...makeCameraFrames(
          [
            ['2026-11-02T11:35:00+08:00', 0.31],
            ['2026-11-02T11:45:00+08:00', 0.75],
            ['2026-11-02T11:55:00+08:00', 0.35]
          ],
          tEval
        ),
        ...dryGauge
      ]
    })
    expect(
      findVerdict(evaluateSkyClauses({ tEval, snapshot: snapOneClear, clauses }), 'site').clauses.haze_watch.status
    ).toBe('not')

    // 4. Positive gauge rain over the 3 frames prevents camera firing
    const snapWetGauge = makeSnapshot({
      tEval,
      readings: [
        ...apiNormal,
        ...threeObscuredFrames,
        makeGaugeReading('2026-11-02T11:45:00+08:00', 0.5, tEval),
        makeGaugeReading('2026-11-02T11:55:00+08:00', 0, tEval)
      ]
    })
    expect(
      findVerdict(evaluateSkyClauses({ tEval, snapshot: snapWetGauge, clauses }), 'site').clauses.haze_watch.status
    ).toBe('not')

    // 5. Stale/error/blank gauge prevents camera firing without blocking haze_watch when APIMS is fresh
    const snapStaleGauge = makeSnapshot({
      tEval,
      readings: [...apiNormal, ...threeObscuredFrames],
      polls: freshPollsAt(tEval, { gauge: 'http_500' })
    })
    const vStaleGauge = findVerdict(evaluateSkyClauses({ tEval, snapshot: snapStaleGauge, clauses }), 'site')
    expect(vStaleGauge.clauses.haze_watch.status).toBe('not')
    expect(vStaleGauge.verdict).toBe('normal')

    // 6. Camera in probation, off_hours, or missing does not camera-fire and never blocks API evaluation
    const snapProbation = makeSnapshot({
      tEval,
      sources: baseSources({ cam_01: { probation: true } }),
      readings: [...apiNormal, ...threeObscuredFrames, ...dryGauge]
    })
    expect(snapProbation.inputs.camera.state).toBe('probation')
    const vProbation = findVerdict(evaluateSkyClauses({ tEval, snapshot: snapProbation, clauses }), 'site')
    expect(vProbation.clauses.haze_watch.status).toBe('not')
    expect(vProbation.blockedInputs).toEqual([])
    expect(vProbation.verdict).toBe('normal')

    const snapProbationWithHighApi = makeSnapshot({
      tEval,
      sources: baseSources({ cam_01: { probation: true } }),
      readings: [
        ...makeApimsReadingsAt('2026-11-02T11:00:00+08:00', { CA16W: 115 }, tEval),
        ...threeObscuredFrames,
        ...dryGauge
      ]
    })
    expect(
      findVerdict(evaluateSkyClauses({ tEval, snapshot: snapProbationWithHighApi, clauses }), 'site').clauses.haze_watch
        .status
    ).toBe('fired')

    const tEvalNight = '2026-11-02T20:00:00+08:00'
    const snapOffHours = makeSnapshot({
      tEval: tEvalNight,
      readings: [
        ...makeApimsReadingsAt('2026-11-02T19:00:00+08:00', { CA16W: 60 }, tEvalNight),
        makeGaugeReading('2026-11-02T19:55:00+08:00', 0, tEvalNight)
      ]
    })
    expect(snapOffHours.inputs.camera.state).toBe('off_hours')
    const vOffHours = findVerdict(evaluateSkyClauses({ tEval: tEvalNight, snapshot: snapOffHours, clauses }), 'site')
    expect(vOffHours.clauses.haze_watch.status).toBe('not')
    expect(vOffHours.blockedInputs).toEqual([])
    expect(vOffHours.verdict).toBe('normal')
  })

  test('storm_watch sets only watch=true with mode=normal and verdict=normal when firing alone', () => {
    const tEval = '2026-11-02T14:15:00+08:00'
    const windowRow: Row<'windows'> = {
      window_id: 'w-watch-only',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '2026-11-02T14:00:00+08:00',
      end_myt: '2026-11-02T14:30:00+08:00',
      status: 'active'
    }
    const snap = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T14:10:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-11-02T14:00:00+08:00', { CA16W: 50 }, tEval)
      ],
      warnings: [
        {
          warning_key: 'met:2026-11-02T13:30:00+08:00:0',
          issued: '2026-11-02T13:30:00+08:00',
          title_en: 'Thunderstorm Warning',
          title_bm: 'Amaran Ribut Petir',
          valid_from: '2026-11-02T13:30:00+08:00',
          valid_to: '2026-11-02T16:00:00+08:00',
          heading_en: 'Thunderstorm warning for W.P. Kuala Lumpur',
          text_en: 'Heavy rain expected over W.P. Kuala Lumpur.',
          text_bm: 'Ribut petir di W.P. Kuala Lumpur.',
          first_seen_at: '2026-11-02T13:35:00+08:00',
          last_seen_at: tEval,
          poll_id: 'poll-met',
          http_status: 200,
          latency_ms: 90,
          names_kl: true
        }
      ],
      windows: [windowRow]
    })

    const verdicts = evaluateSkyClauses({
      tEval,
      snapshot: snap,
      clauses: defaultSkyClauseRows(),
      windows: [windowRow],
      clauseVersion: 1
    })

    const siteVerdict = findVerdict(verdicts, 'site')
    expect(siteVerdict.clauses.storm_watch.status).toBe('not')
    expect(siteVerdict.watch).toBe(false)

    const winVerdict = findVerdict(verdicts, 'w-watch-only')
    expect(winVerdict.clauses.storm_watch.status).toBe('fired')
    expect(winVerdict.watch).toBe(true)
    expect(winVerdict.mode).toBe('normal')
    expect(winVerdict.verdict).toBe('normal')
    expect(winVerdict.firedClauses).toEqual(['storm_watch'])
  })

  test('storm_confirmed (>= 31) and flash_flood_risk (> 60) boundaries on real 2 Nov JPS capture with non-future APIMS', () => {
    const windowRow: Row<'windows'> = {
      window_id: 'w-rain-bounds',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '2026-11-02T14:00:00+08:00',
      end_myt: '2026-11-02T15:15:00+08:00',
      status: 'active'
    }
    const clauses = defaultSkyClauseRows()

    const evalAt = (tEval: string): SkyVerdict => {
      const snap = makeSnapshot({
        tEval,
        readings: [
          ...adaptJpsReadings({ upToIso: tEval, receivedAt: tEval }),
          ...makeApimsReadingsAt('2026-11-02T14:00:00+08:00', { CA16W: 55, CA19B: 50, CA17W: 52 }, tEval)
        ],
        windows: [windowRow]
      })
      expect(snap.inputs.apims.state).toBe('fresh')
      return findVerdict(
        evaluateSkyClauses({ tEval, snapshot: snap, clauses, windows: [windowRow], clauseVersion: 1 }),
        'w-rain-bounds'
      )
    }

    const at1455 = evalAt('2026-11-02T14:55:00+08:00')
    expect(at1455.clauses.storm_confirmed.status).toBe('not')
    expect(at1455.clauses.flash_flood_risk.status).toBe('not')
    expect(at1455.verdict).toBe('normal')

    const at1500 = evalAt('2026-11-02T15:00:00+08:00')
    expect(at1500.clauses.storm_confirmed.status).toBe('fired')
    expect(at1500.clauses.flash_flood_risk.status).toBe('not')
    expect(at1500.verdict).toBe('commute_disruption')
    expect(at1500.firedClauses).toEqual(['storm_confirmed'])

    const at1535Boundary60 = evalAt('2026-11-02T15:35:00+08:00')
    expect(at1535Boundary60.clauses.storm_confirmed.status).toBe('fired')
    expect(at1535Boundary60.clauses.flash_flood_risk.status).toBe('not')
    expect(at1535Boundary60.verdict).toBe('commute_disruption')

    const at1540Above60 = evalAt('2026-11-02T15:40:00+08:00')
    expect(at1540Above60.clauses.storm_confirmed.status).toBe('fired')
    expect(at1540Above60.clauses.flash_flood_risk.status).toBe('fired')
    expect(at1540Above60.verdict).toBe('commute_disruption')
    expect(at1540Above60.firedClauses).toEqual(['storm_confirmed', 'flash_flood_risk'])
  })

  test('CLS-2 and CLS-3: Haze watch + Storm confirmed lists both; APIMS error at 15:05 blocks both haze clauses and forces no_call', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const waves = replayReleaseWaves()
    const clauses = defaultSkyClauseRows()

    // CLS-2: API 101 + 39.0 mm rain -> commute_disruption listing both
    const snapCls2 = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:00:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 101, CA19B: 75, CA17W: 80 }, tEval)
      ],
      windows: waves
    })
    const w1530Cls2 = findVerdict(
      evaluateSkyClauses({ tEval, snapshot: snapCls2, clauses, windows: waves, clauseVersion: 1 }),
      'w-1530'
    )
    expect(w1530Cls2.clauses.haze_watch.status).toBe('fired')
    expect(w1530Cls2.clauses.storm_confirmed.status).toBe('fired')
    expect(w1530Cls2.mode).toBe('commute_disruption')
    expect(w1530Cls2.verdict).toBe('commute_disruption')
    expect(w1530Cls2.firedClauses).toEqual(['haze_watch', 'storm_confirmed'])
    expect(w1530Cls2.clauses.storm_confirmed.evidence.find((e) => e.name === 'w.rain_max_60m_mm')?.value).toBe(39)

    // CLS-3: APIMS erroring + fresh gauge -> storm_confirmed fired, both haze clauses blocked:apims, verdict no_call
    const snapCls3 = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:00:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-11-02T14:00:00+08:00', { CA16W: 60 }, '2026-11-02T14:05:00+08:00')
      ],
      polls: freshPollsAt(tEval, { apims: 'http_500' }),
      windows: waves
    })
    const verdictsCls3 = evaluateSkyClauses({ tEval, snapshot: snapCls3, clauses, windows: waves, clauseVersion: 1 })
    for (const waveId of ['w-1430', 'w-1500', 'w-1530']) {
      const v = findVerdict(verdictsCls3, waveId)
      expect(v.clauses.storm_confirmed.status).toBe('fired')
      expect(v.clauses.haze_watch.status).toBe('blocked:apims')
      expect(v.clauses.haze_severe.status).toBe('blocked:apims')
      expect(v.clauses.haze_severe.stateSince).toBe(tEval)
      expect(v.clauses.silent_input.status).toBe('fired')
      expect(v.mode).toBe('commute_disruption')
      expect(v.verdict).toBe('no_call')
      expect(v.blockedInputs).toContain('apims')
    }

    // Precedence when blocked clauses propose <= highest fired mode (haze_severe rank 3 > blocked:gauge rank 2)
    const snapSevereWins = makeSnapshot({
      tEval,
      readings: makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 195 }, tEval),
      polls: freshPollsAt(tEval, { gauge: 'http_502', met: 'timeout' }),
      windows: waves
    })
    const w1530Severe = findVerdict(
      evaluateSkyClauses({ tEval, snapshot: snapSevereWins, clauses, windows: waves, clauseVersion: 1 }),
      'w-1530'
    )
    expect(w1530Severe.clauses.haze_severe.status).toBe('fired')
    expect(w1530Severe.clauses.storm_confirmed.status).toBe('blocked:gauge')
    expect(w1530Severe.clauses.storm_watch.status).toBe('blocked:met')
    expect(w1530Severe.verdict).toBe('hybrid_recommended')
    expect([...w1530Severe.blockedInputs].sort()).toEqual(['gauge', 'met'])
  })

  test('CLS-4 worked example spans: active evaluation uses computed pack window span while storm_watch predicate checks declared window overlap', () => {
    const waves = replayReleaseWaves()
    const clausesWithHazeDisabled = defaultSkyClauseRows().map((row) =>
      row.key === 'haze_watch' || row.key === 'haze_severe' ? { ...row, enabled: false } : row
    )

    const evalReplayTick = (tEval: string, seenUpTo: string): SkyVerdict[] => {
      const snap = computeSkySnapshot({
        tEval,
        sources: baseSources(),
        readings: adaptJpsReadings({ upToIso: seenUpTo, receivedAt: tEval }),
        polls: [
          {
            poll_id: `poll-${tEval}`,
            source_kind: 'jps_rain',
            source_id: '0232901RF',
            started_at: tEval,
            received_at: tEval,
            http_status: 200,
            latency_ms: 85,
            outcome: 'ok',
            new_rows: 1
          }
        ],
        warnings: [],
        forecast: [],
        windows: waves,
        daylight: DEFAULT_DAYLIGHT
      })
      return evaluateSkyClauses({
        tEval,
        snapshot: snap,
        clauses: clausesWithHazeDisabled,
        windows: waves,
        clauseVersion: 1
      })
    }

    // 15:00 tick (readings through 14:55 = 29.5 mm): w-1430/1500/1530 computed spans open; w-1545 [15:15,16:45] not open
    const at1500 = evalReplayTick('2026-11-02T15:00:00+08:00', '2026-11-02T14:55:00+08:00')
    for (const waveId of ['w-1430', 'w-1500', 'w-1530']) {
      const v = findVerdict(at1500, waveId)
      expect(v.clauses.storm_confirmed.status).toBe('not')
      expect(v.clauses.storm_watch.status).toBe('blocked:met')
      expect(v.verdict).toBe('normal')
    }
    const w1545At1500 = findVerdict(at1500, 'w-1545')
    expect(w1545At1500.clauses.storm_watch.status).toBe('not')
    expect(w1545At1500.clauses.storm_confirmed.status).toBe('not')
    expect(w1545At1500.blockedInputs).toEqual([])
    expect(w1545At1500.verdict).toBe('normal')

    // 15:05 tick (readings through 15:00 = 39.0 mm): w-1430, w-1500, and future w-1530 cross with blocked storm_watch; w-1545 still not open
    const at1505 = evalReplayTick('2026-11-02T15:05:00+08:00', '2026-11-02T15:00:00+08:00')
    for (const waveId of ['w-1430', 'w-1500', 'w-1530']) {
      const v = findVerdict(at1505, waveId)
      expect(v.clauses.storm_confirmed.status).toBe('fired')
      expect(v.clauses.storm_watch.status).toBe('blocked:met')
      expect(v.verdict).toBe('commute_disruption')
    }
    expect(findVerdict(at1505, 'w-1545').clauses.storm_watch.status).toBe('not')
    expect(findVerdict(at1505, 'w-1545').clauses.storm_confirmed.status).toBe('not')

    // 15:15 tick (readings through 15:10): w-1545 span [15:15, 16:45] opens, fresh gauge has no stamp in span -> storm_confirmed is not
    const at1515 = evalReplayTick('2026-11-02T15:15:00+08:00', '2026-11-02T15:10:00+08:00')
    const w1545At1515 = findVerdict(at1515, 'w-1545')
    expect(w1545At1515.clauses.storm_watch.status).toBe('blocked:met')
    expect(w1545At1515.clauses.storm_confirmed.status).toBe('not')
    expect(w1545At1515.verdict).toBe('normal')

    // In-memory tamper check: fresh gauge with indicator observedAt (15:10) preceding open span [15:15, 16:45] stays 'not'
    const baseSnap1515 = makeSnapshot({
      tEval: '2026-11-02T15:15:00+08:00',
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:10:00+08:00', receivedAt: '2026-11-02T15:15:00+08:00' }),
        ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 50 }, '2026-11-02T15:15:00+08:00')
      ],
      windows: waves
    })
    baseSnap1515.evidenceByScope['w-1545']!['w.rain_max_60m_mm'] = {
      ...baseSnap1515.evidenceByScope['w-1545']!['w.rain_max_60m_mm']!,
      value: 48,
      observedAt: '2026-11-02T15:10:00+08:00',
      state: 'fresh'
    }
    const tampered1545 = findVerdict(
      evaluateSkyClauses({
        tEval: '2026-11-02T15:15:00+08:00',
        snapshot: baseSnap1515,
        clauses: defaultSkyClauseRows(),
        windows: waves
      }),
      'w-1545'
    )
    expect(tampered1545.clauses.storm_confirmed.status).toBe('not')

    // 15:20 tick (readings through 15:15 = 54.0 mm): w-1545 crosses to commute_disruption
    const at1520 = evalReplayTick('2026-11-02T15:20:00+08:00', '2026-11-02T15:15:00+08:00')
    expect(findVerdict(at1520, 'w-1545').clauses.storm_confirmed.status).toBe('fired')
    expect(findVerdict(at1520, 'w-1545').verdict).toBe('commute_disruption')
  })

  test('malformed or unsupported edited clause rows produce blocked:clauses and follow rank precedence for verdict vs no_call', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const waves = replayReleaseWaves()
    // At 15:05 on w-1530, storm_confirmed (rank 2) fires; on site, no clause fires (mode = normal, rank 0)
    const snap = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:00:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 60 }, tEval)
      ],
      windows: waves
    })

    const evalEdited = (
      mutate: (rows: Row<'clauses'>[]) => Row<'clauses'>[]
    ): { site: SkyVerdict; w1530: SkyVerdict } => {
      const verdicts = evaluateSkyClauses({
        tEval,
        snapshot: snap,
        clauses: mutate(defaultSkyClauseRows()),
        windows: waves,
        clauseVersion: 2
      })
      return { site: findVerdict(verdicts, 'site'), w1530: findVerdict(verdicts, 'w-1530') }
    }

    // 1. Malformed haze_watch (rank 1): blocked:clauses; on site (rank 0) -> no_call; on w-1530 (storm_confirmed rank 2 fired) -> commute_disruption
    const badHazeWatch = evalEdited((rows) =>
      rows.map((r) => (r.key === 'haze_watch' ? { ...r, threshold: '{not-json' } : r))
    )
    expect(badHazeWatch.site.clauses.haze_watch.status).toBe('blocked:clauses')
    expect(badHazeWatch.site.verdict).toBe('no_call')
    expect(badHazeWatch.w1530.clauses.haze_watch.status).toBe('blocked:clauses')
    expect(badHazeWatch.w1530.blockedInputs).toContain('clauses')
    expect(badHazeWatch.w1530.verdict).toBe('commute_disruption')

    // 2. Malformed flash_flood_risk (rank 2) when storm_confirmed (rank 2) fires: tied rank 2 <= 2 does NOT force no_call
    const badFlashFlood = evalEdited((rows) =>
      rows.map((r) => (r.key === 'flash_flood_risk' ? { ...r, requires: '["w.non_existent_metric"]' } : r))
    )
    expect(badFlashFlood.w1530.clauses.flash_flood_risk.status).toBe('blocked:clauses')
    expect(badFlashFlood.w1530.blockedInputs).toContain('clauses')
    expect(badFlashFlood.w1530.verdict).toBe('commute_disruption')

    // 3. Malformed haze_severe (rank 3 > rank 2): forces no_call even when storm_confirmed (rank 2) fires
    const badHazeSevere = evalEdited((rows) =>
      rows.map((r) => (r.key === 'haze_severe' ? { ...r, op: '{"api_max":"=~"}' } : r))
    )
    expect(badHazeSevere.w1530.clauses.haze_severe.status).toBe('blocked:clauses')
    expect(badHazeSevere.w1530.verdict).toBe('no_call')

    // 4. Malformed storm_confirmed (rank 2): cannot fire, so mode is normal (rank 0) and blocked rank 2 > 0 forces no_call
    const badStormConfirmed = evalEdited((rows) =>
      rows.map((r) => (r.key === 'storm_confirmed' ? { ...r, op: 'rain_max_60m_mm >= 31 && true' } : r))
    )
    expect(badStormConfirmed.w1530.clauses.storm_confirmed.status).toBe('blocked:clauses')
    expect(badStormConfirmed.w1530.mode).toBe('normal')
    expect(badStormConfirmed.w1530.verdict).toBe('no_call')

    // 5. Unsupported span or unknown clause key/proposes_key: conservative blocked:clauses forcing no_call
    const badSpan = evalEdited((rows) =>
      rows.map((r) => (r.key === 'storm_confirmed' ? { ...r, span_from: 'start-999m' } : r))
    )
    expect(badSpan.w1530.clauses.storm_confirmed.status).toBe('blocked:clauses')
    expect(badSpan.w1530.verdict).toBe('no_call')

    const unknownKeyRow = evalEdited((rows) => [
      ...rows,
      {
        ...rows[0]!,
        key: 'custom_cel_clause',
        requires: '["site.api_max"]',
        threshold: 50,
        op: '>=',
        proposes_key: 'hybrid_recommended',
        rank: 3,
        enabled: true
      }
    ])
    expect(unknownKeyRow.w1530.blockedInputs).toContain('clauses')
    expect(unknownKeyRow.w1530.verdict).toBe('no_call')
  })

  test('fast-check properties: determinism, monotonicity with fixed availability, precedence, and No call', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const windowRow: Row<'windows'> = {
      window_id: 'w-prop',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '2026-11-02T15:00:00+08:00',
      end_myt: '2026-11-02T15:30:00+08:00',
      status: 'active'
    }
    const clauses = defaultSkyClauseRows()

    interface SyntheticCase {
      apiMax: number
      api0600: [number, number, number]
      rain60m: number
      rain4h: number
      warningInForce: boolean
      gaugeState: SourceState
      apimsState: SourceState
      metState: SourceState
    }

    const mkInput = (state: SourceState, id: string): ResolvedInputState => ({
      state,
      stateSince: '2026-11-02T14:40:00+08:00',
      ageMin: state === 'fresh' ? 5 : 45,
      sourceIds: [id],
      readingIds: [`${id}:r1`],
      observedAt: '2026-11-02T15:00:00+08:00'
    })

    const mkEv = (
      scope: string,
      name: string,
      val: Cell,
      unit: string,
      base: ResolvedInputState
    ): IndicatorEvidence => ({
      ...base,
      scope,
      name,
      value: base.state === 'fresh' ? val : '',
      unit
    })

    const buildSyntheticSnapshot = (c: SyntheticCase): SkySnapshot => {
      const gauge = mkInput(c.gaugeState, '0232901RF')
      const apimsStation = mkInput(c.apimsState, 'CA16W')
      const apims = {
        ...apimsStation,
        sourceIds: [...BOUND_APIMS_STATION_IDS],
        stations: { CA16W: apimsStation, CA19B: apimsStation, CA17W: apimsStation }
      }
      const met = mkInput(c.metState, 'met_warning')
      const camera = mkInput('off_hours', 'cam_01')
      const api0600Json = JSON.stringify({
        CA16W: [
          { date: '2026-11-02', value: c.api0600[2] },
          { date: '2026-11-01', value: c.api0600[1] },
          { date: '2026-10-31', value: c.api0600[0] }
        ],
        CA19B: [],
        CA17W: []
      })

      const siteEv: Record<string, IndicatorEvidence> = {
        'site.api_max': mkEv('site', 'site.api_max', c.apiMax, 'API', apims),
        'site.api_max_station': mkEv('site', 'site.api_max_station', 'CA16W', 'API', apims),
        'site.api_0600': mkEv('site', 'site.api_0600', api0600Json, 'API', apims),
        'site.camera_far_ratio_last3': mkEv('site', 'site.camera_far_ratio_last3', '', 'ratio', camera),
        'site.gauge_rain_last3frames_mm': mkEv('site', 'site.gauge_rain_last3frames_mm', '', 'mm', gauge)
      }
      const winEv: Record<string, IndicatorEvidence> = {
        ...siteEv,
        'w.rain_max_60m_mm': mkEv('w-prop', 'w.rain_max_60m_mm', c.rain60m, 'mm', gauge),
        'w.rain_max_4h_mm': mkEv('w-prop', 'w.rain_max_4h_mm', c.rain4h, 'mm', gauge),
        'w.met_kl_warning_in_force': mkEv('w-prop', 'w.met_kl_warning_in_force', c.warningInForce, 'bool', met),
        'w.met_warning_keys': mkEv('w-prop', 'w.met_warning_keys', c.warningInForce ? '["w1"]' : '[]', 'json', met)
      }

      const baseNow: Row<'now'> = {
        snapshot_id: tEval,
        'site.api_max': siteEv['site.api_max']!.value,
        'site.api_max_station': siteEv['site.api_max_station']!.value,
        'site.api_0600': siteEv['site.api_0600']!.value,
        state_gauge: c.gaugeState,
        state_apims: c.apimsState,
        state_met: c.metState,
        state_camera: 'off_hours'
      }

      return {
        nowRows: [
          { ...baseNow, scope: 'site', span_from: '', span_to: '' },
          {
            ...baseNow,
            scope: 'w-prop',
            span_from: '2026-11-02T15:00:00+08:00',
            span_to: '2026-11-02T16:30:00+08:00',
            'w.rain_max_60m_mm': winEv['w.rain_max_60m_mm']!.value,
            'w.rain_max_4h_mm': winEv['w.rain_max_4h_mm']!.value,
            'w.met_kl_warning_in_force': winEv['w.met_kl_warning_in_force']!.value
          }
        ],
        indicatorRows: [],
        sourceUpdates: [],
        inputs: { gauge, apims, met, camera },
        sourceStates: { '0232901RF': gauge, CA16W: apimsStation, met_warning: met, cam_01: camera },
        evidenceByScope: { site: siteEv, 'w-prop': winEv }
      }
    }

    const stateArb = fc.constantFrom<SourceState>('fresh', 'stale', 'error')
    const caseArb: fc.Arbitrary<SyntheticCase> = fc.record({
      apiMax: fc.integer({ min: 0, max: 250 }),
      api0600: fc.tuple(
        fc.integer({ min: 0, max: 220 }),
        fc.integer({ min: 0, max: 220 }),
        fc.integer({ min: 0, max: 220 })
      ),
      rain60m: fc.double({ min: 0, max: 100, noNaN: true }),
      rain4h: fc.double({ min: 0, max: 120, noNaN: true }),
      warningInForce: fc.boolean(),
      gaugeState: stateArb,
      apimsState: stateArb,
      metState: stateArb
    })

    fc.assert(
      fc.property(caseArb, (c) => {
        const input: SkyClauseInput = {
          tEval,
          snapshot: buildSyntheticSnapshot(c),
          clauses,
          windows: [windowRow],
          clauseVersion: 1
        }
        const first = evaluateSkyClauses(input)
        const second = evaluateSkyClauses(input)
        expect(first).toEqual(second)

        const win = findVerdict(first, 'w-prop')
        const ranks: Array<[SkyClauseKey, number]> = [
          ['haze_watch', 1],
          ['storm_confirmed', 2],
          ['flash_flood_risk', 2],
          ['haze_severe', 3]
        ]
        let maxFired = 0
        let maxBlocked = 0
        for (const [k, r] of ranks) {
          const st = win.clauses[k].status
          if (st === 'fired' && r > maxFired) maxFired = r
          if (st.startsWith('blocked:') && r > maxBlocked) maxBlocked = r
        }

        expect(SKY_MODE_RANKS[win.mode]).toBe(maxFired)
        expect(win.watch).toBe(win.clauses.storm_watch.status === 'fired')
        expect(win.verdict).toBe(maxBlocked > maxFired ? 'no_call' : win.mode)
      }),
      { numRuns: 100 }
    )

    const deltaArb = fc.record({
      dApi: fc.integer({ min: 0, max: 100 }),
      d0600: fc.tuple(
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 0, max: 80 })
      ),
      dRain60: fc.double({ min: 0, max: 50, noNaN: true }),
      dRain4h: fc.double({ min: 0, max: 60, noNaN: true }),
      addWarn: fc.boolean()
    })

    fc.assert(
      fc.property(caseArb, deltaArb, (low, d) => {
        const high: SyntheticCase = {
          ...low,
          apiMax: low.apiMax + d.dApi,
          api0600: [low.api0600[0] + d.d0600[0], low.api0600[1] + d.d0600[1], low.api0600[2] + d.d0600[2]],
          rain60m: low.rain60m + d.dRain60,
          rain4h: low.rain4h + d.dRain4h,
          warningInForce: low.warningInForce || d.addWarn
        }
        const vLow = findVerdict(
          evaluateSkyClauses({ tEval, snapshot: buildSyntheticSnapshot(low), clauses, windows: [windowRow] }),
          'w-prop'
        )
        const vHigh = findVerdict(
          evaluateSkyClauses({ tEval, snapshot: buildSyntheticSnapshot(high), clauses, windows: [windowRow] }),
          'w-prop'
        )

        expect(SKY_MODE_RANKS[vHigh.mode]).toBeGreaterThanOrEqual(SKY_MODE_RANKS[vLow.mode])
        if (vLow.watch) expect(vHigh.watch).toBe(true)
        for (const k of ['haze_watch', 'haze_severe', 'storm_watch', 'storm_confirmed', 'flash_flood_risk'] as const) {
          if (vLow.clauses[k].status === 'fired') expect(vHigh.clauses[k].status).toBe('fired')
        }
      }),
      { numRuns: 100 }
    )
  })
})
