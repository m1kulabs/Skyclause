import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  defaultSkyClauseRows,
  evaluateSkyClauses,
  type SkyClauseKey,
  type SkyVerdict,
  type SkyVerdictValue
} from './clauses.ts'
import {
  type PlannedSkyCrossingFile,
  planSkyCrossings,
  type SkyCrossingChange,
  type SkyCrossingDocument,
  type SkyCrossingInput,
  type SkyCrossingInputEvidence,
  type SkyCrossingPlan,
  type SkyCrossingWindowMeta
} from './crossings.ts'
import { BOUND_APIMS_STATION_IDS, computeSkySnapshot, type SkySnapshot, type SkySnapshotInput } from './indicators.ts'
import { type Row, toRow } from './schema.ts'

interface JpsCapture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}

const DEFAULT_DAYLIGHT = { start: '07:15', end: '19:00' }
const REPLAY_MISSING_APIMS_NOTICE = 'haze clauses off: no APIMS record for 2 Nov'
const jpsCapture = JSON.parse(
  readFileSync(resolve(import.meta.dir, '../../fixtures/rainfall-graph-75-20261105T1312Z.json'), 'utf8')
) as JpsCapture

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

function findStateRow(stateRows: readonly Row<'shadow_state'>[], scope: string): Row<'shadow_state'> {
  const found = stateRows.find((r) => r.scope === scope)
  if (!found) throw new Error(`Missing shadow_state row for scope ${scope}`)
  return found
}

function findChange(doc: SkyCrossingDocument, scope: string): SkyCrossingChange {
  const found = doc.changes.find((c) => c.scope === scope)
  if (!found) throw new Error(`Missing crossing change for scope ${scope}`)
  return found
}

describe('Task 3 #55 stage 2: planSkyCrossings pure crossing planner', () => {
  test('unknown edited clause keys survive evaluator-to-crossing diagnostics without invented inputs', () => {
    const tEval = '2026-11-02T12:05:00+08:00'
    const snapshot = makeSnapshot({
      tEval,
      readings: makeApimsReadingsAt('2026-11-02T12:00:00+08:00', { CA16W: 50, CA19B: 50, CA17W: 50 })
    })
    const defaults = defaultSkyClauseRows()
    const clauses = [...defaults, { ...defaults.find((row) => row.key === 'haze_severe')!, key: 'haze_sever_typo' }]
    const verdicts = evaluateSkyClauses({ tEval, snapshot, clauses, clauseVersion: 2 })
    const site = verdicts.find((verdict) => verdict.scope === 'site')!
    expect(site.verdict).toBe('no_call')
    expect(site.blockedDetails).toEqual([
      { input: 'clauses', state: 'malformed', stateSince: tEval, clauses: ['haze_sever_typo'] }
    ])
    expect(site.blockedClauses).toEqual([])
    expect(site.clauses.haze_severe.status).toBe('not')
    const plan = planSkyCrossings({
      tEval,
      verdicts,
      previousState: [],
      ledgerSourceRefs: [],
      windows: [],
      sequence: 1
    })
    expect(plan.crossing).not.toBeNull()
    const change = findChange(plan.crossing!.document, 'site')
    expect(change.to).toBe('no_call')
    expect(change.blocked).toEqual(['haze_sever_typo'])
    expect(change.fired).toEqual([])
    expect(change.inputs).toEqual([])
  })

  test('(1) unchanged Normal and watch-only evaluations emit no crossing file and preserve prior since, last_crossing_id, and retained state rows', () => {
    const tEval = '2026-11-02T14:15:00+08:00'
    const windowRow: Row<'windows'> = {
      window_id: 'w-1430',
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
        ...makeApimsReadingsAt('2026-11-02T14:00:00+08:00', { CA16W: 52 }, tEval)
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
          text_en: 'Thunderstorm expected over W.P. Kuala Lumpur.',
          text_bm: 'Ribut petir di W.P. Kuala Lumpur.',
          first_seen_at: '2026-11-02T13:35:00+08:00',
          last_seen_at: tEval,
          poll_id: 'poll-met',
          http_status: 200,
          latency_ms: 80,
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
    expect(verdicts.find((v) => v.scope === 'w-1430')?.watch).toBe(true)
    expect(verdicts.find((v) => v.scope === 'w-1430')?.verdict).toBe('normal')

    const previousState: Row<'shadow_state'>[] = [
      { scope: 'site', verdict: 'normal', since: '2026-11-02T08:00:00+08:00', last_crossing_id: '' },
      {
        scope: 'w-1430',
        verdict: 'normal',
        since: '2026-11-02T14:00:00+08:00',
        last_crossing_id: 'X-20261102-1350-01'
      },
      {
        scope: 'w-0900-archived',
        verdict: 'normal',
        since: '2026-11-02T09:30:00+08:00',
        last_crossing_id: 'X-20261102-0905-01'
      }
    ]

    const plan: SkyCrossingPlan = planSkyCrossings({
      tEval,
      verdicts,
      previousState,
      ledgerSourceRefs: [],
      windows: [windowRow],
      sequence: 1
    })

    expect(plan.crossing).toBeNull()
    expect(plan.shadowRows.length).toBe(2)
    for (const row of plan.shadowRows) {
      expect(toRow('shadow', row).length).toBe(12)
    }

    expect(findStateRow(plan.stateRows, 'site')).toEqual(previousState[0]!)
    expect(findStateRow(plan.stateRows, 'w-1430')).toEqual(previousState[1]!)
    expect(findStateRow(plan.stateRows, 'w-0900-archived')).toEqual(previousState[2]!)
  })

  test('(2) & (3) CLS-4 real 2 Nov replay at 15:00, 15:05, and 15:20: one file at 15:05 for first 3 waves with rain 39.0 age 5, and fourth wave crosses at 15:20', () => {
    const waves = replayReleaseWaves()
    const clausesHazeOff = defaultSkyClauseRows().map((row) =>
      row.key === 'haze_watch' || row.key === 'haze_severe' ? { ...row, enabled: false } : row
    )

    const evalReplayTick = (
      tEval: string,
      seenUpTo: string,
      previousState: readonly Row<'shadow_state'>[],
      sequence = 1
    ): SkyCrossingPlan => {
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
      const verdicts = evaluateSkyClauses({
        tEval,
        snapshot: snap,
        clauses: clausesHazeOff,
        windows: waves,
        clauseVersion: 1
      })
      return planSkyCrossings({
        tEval,
        verdicts,
        previousState,
        ledgerSourceRefs: [],
        windows: waves,
        sequence,
        replay: true,
        replayNotice: REPLAY_MISSING_APIMS_NOTICE
      })
    }

    // 15:00 tick (29.5 mm): no crossing file
    const plan1500 = evalReplayTick('2026-11-02T15:00:00+08:00', '2026-11-02T14:55:00+08:00', [])
    expect(plan1500.crossing).toBeNull()
    expect(findStateRow(plan1500.stateRows, 'w-1530').verdict).toBe('normal')
    expect(findStateRow(plan1500.stateRows, 'w-1530').last_crossing_id).toBe('')

    // 15:05 tick (39.0 mm observed 15:00, age 5): writes crossing-20261102-1505-01.json covering first 3 waves
    const plan1505 = evalReplayTick('2026-11-02T15:05:00+08:00', '2026-11-02T15:00:00+08:00', plan1500.stateRows)
    expect(plan1505.crossing).not.toBeNull()
    const crossing1505: PlannedSkyCrossingFile = plan1505.crossing!
    expect(crossing1505.filename).toBe('crossing-20261102-1505-01.json')
    expect(crossing1505.document.crossing_id).toBe('X-20261102-1505-01')
    expect(crossing1505.document.pack).toBe('sky')
    expect(crossing1505.document.replay).toBe(true)
    expect(crossing1505.document.replay_notice).toBe(REPLAY_MISSING_APIMS_NOTICE)
    expect(crossing1505.document.t_eval).toBe('2026-11-02T15:05:00+08:00')
    expect(crossing1505.document.snapshot_id).toBe('2026-11-02T15:05:00+08:00')
    expect(crossing1505.document.clause_version).toBe(1)

    expect(crossing1505.document.changes.map((c) => c.scope)).toEqual(['w-1430', 'w-1500', 'w-1530'])

    const change1530 = findChange(crossing1505.document, 'w-1530')
    const expectedWindowMeta: SkyCrossingWindowMeta = {
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '15:30',
      end_myt: '15:30'
    }
    expect(change1530.window).toEqual(expectedWindowMeta)
    expect(change1530.from).toBe('normal')
    expect(change1530.to).toBe('commute_disruption')
    expect(change1530.fired).toEqual(['storm_confirmed'])
    expect(change1530.blocked).toEqual(['storm_watch'])

    const rainInput = change1530.inputs.find((i) => i.name === 'w.rain_max_60m_mm')!
    expect(rainInput.value).toBe(39)
    expect(rainInput.unit).toBe('mm')
    expect(rainInput.source_id).toBe('0232901RF')
    expect(rainInput.source_ids).toEqual(['0232901RF'])
    expect(rainInput.observed_at).toBe('2026-11-02T15:00:00+08:00')
    expect(rainInput.age_min).toBe(5)
    expect(rainInput.state).toBe('fresh')
    expect(rainInput.reading_ids.length).toBeGreaterThan(0)

    const metInput = change1530.inputs.find((i) => i.name === 'w.met_kl_warning_in_force')!
    expect(metInput.source_id).toBe('met_warning')
    expect(metInput.observed_at).toBeNull()
    expect(metInput.age_min).toBeNull()
    expect(metInput.state).toBe('stale')
    expect(metInput.value).toBeNull()

    for (const waveId of ['w-1430', 'w-1500', 'w-1530']) {
      const st = findStateRow(plan1505.stateRows, waveId)
      expect(st.verdict).toBe('commute_disruption')
      expect(st.since).toBe('2026-11-02T15:05:00+08:00')
      expect(st.last_crossing_id).toBe('X-20261102-1505-01')
    }
    expect(findStateRow(plan1505.stateRows, 'w-1545').verdict).toBe('normal')
    expect(findStateRow(plan1505.stateRows, 'w-1545').last_crossing_id).toBe('')

    // 15:15 tick (readings through 15:10): no new crossing
    const plan1515 = evalReplayTick('2026-11-02T15:15:00+08:00', '2026-11-02T15:10:00+08:00', plan1505.stateRows)
    expect(plan1515.crossing).toBeNull()

    // 15:20 tick (readings through 15:15 = 54.0 mm): fourth wave w-1545 crosses alone
    const plan1520 = evalReplayTick('2026-11-02T15:20:00+08:00', '2026-11-02T15:15:00+08:00', plan1515.stateRows)
    expect(plan1520.crossing).not.toBeNull()
    expect(plan1520.crossing!.filename).toBe('crossing-20261102-1520-01.json')
    expect(plan1520.crossing!.document.crossing_id).toBe('X-20261102-1520-01')
    expect(plan1520.crossing!.document.changes.map((c) => c.scope)).toEqual(['w-1545'])
    const change1545 = findChange(plan1520.crossing!.document, 'w-1545')
    expect(change1545.window).toEqual({
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '15:45',
      end_myt: '15:45'
    })
    expect(change1545.inputs.find((i) => i.name === 'w.rain_max_60m_mm')?.value).toBe(54)
    expect(findStateRow(plan1520.stateRows, 'w-1545').last_crossing_id).toBe('X-20261102-1520-01')
    expect(findStateRow(plan1520.stateRows, 'w-1530').last_crossing_id).toBe('X-20261102-1505-01')
  })

  test('(4) no_call inside an open computed span is eligible, whereas no_call outside an open span updates shadow_state only', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const waves = replayReleaseWaves()
    const snap = makeSnapshot({
      tEval,
      readings: adaptJpsReadings({ upToIso: '2026-11-02T14:55:00+08:00', receivedAt: tEval }),
      polls: freshPollsAt(tEval, { apims: 'http_500' }),
      windows: waves
    })
    const verdicts = evaluateSkyClauses({
      tEval,
      snapshot: snap,
      clauses: defaultSkyClauseRows(),
      windows: waves,
      clauseVersion: 1
    })

    // Suppose site and w-1430/w-1500 were already no_call at 14:55, while w-1530 (open at 15:00) and w-1545 (opens at 15:15) were normal
    const previousState: Row<'shadow_state'>[] = [
      { scope: 'site', verdict: 'no_call', since: '2026-11-02T14:55:00+08:00', last_crossing_id: 'X-20261102-1455-01' },
      {
        scope: 'w-1430',
        verdict: 'no_call',
        since: '2026-11-02T14:55:00+08:00',
        last_crossing_id: 'X-20261102-1455-01'
      },
      {
        scope: 'w-1500',
        verdict: 'no_call',
        since: '2026-11-02T14:55:00+08:00',
        last_crossing_id: 'X-20261102-1455-01'
      },
      { scope: 'w-1530', verdict: 'normal', since: '2026-11-02T14:00:00+08:00', last_crossing_id: '' },
      { scope: 'w-1545', verdict: 'normal', since: '2026-11-02T14:00:00+08:00', last_crossing_id: '' }
    ]

    const plan = planSkyCrossings({
      tEval,
      verdicts,
      previousState,
      ledgerSourceRefs: [],
      windows: waves,
      sequence: 1
    })

    expect(plan.crossing).not.toBeNull()
    // w-1530 span [15:00, 16:30] is open at 15:05 -> eligible; w-1545 span [15:15, 16:45] is NOT open at 15:05 -> state-only
    expect(plan.crossing!.document.changes.map((c) => c.scope)).toEqual(['w-1530'])
    expect(findStateRow(plan.stateRows, 'w-1530')).toEqual({
      scope: 'w-1530',
      verdict: 'no_call',
      since: tEval,
      last_crossing_id: 'X-20261102-1505-01'
    })
    expect(findStateRow(plan.stateRows, 'w-1545')).toEqual({
      scope: 'w-1545',
      verdict: 'no_call',
      since: tEval,
      last_crossing_id: ''
    })

    // When only an unopened window changes to no_call, crossing is null
    const planOnlyUnopened = planSkyCrossings({
      tEval,
      verdicts,
      previousState: previousState.map((r) => (r.scope === 'w-1530' ? { ...r, verdict: 'no_call' } : r)),
      ledgerSourceRefs: [],
      windows: waves,
      sequence: 1
    })
    expect(planOnlyUnopened.crossing).toBeNull()
    expect(findStateRow(planOnlyUnopened.stateRows, 'w-1545').verdict).toBe('no_call')
    expect(findStateRow(planOnlyUnopened.stateRows, 'w-1545').last_crossing_id).toBe('')

    // A No call verdict outside the span stays state-only even when its fired mode is above Normal.
    const modeSnapshot = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:00:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 101 }, tEval)
      ],
      windows: waves
    })
    const modeVerdicts = evaluateSkyClauses({
      tEval,
      snapshot: modeSnapshot,
      windows: waves,
      clauseVersion: 1,
      clauses: defaultSkyClauseRows().map((row) => (row.key === 'haze_severe' ? { ...row, op: 'unsupported' } : row))
    })
    const future = modeVerdicts.find((v) => v.scope === 'w-1545')!
    expect(future.mode).toBe('outdoor_limited')
    expect(future.verdict).toBe('no_call')
    const outsideModePlan = planSkyCrossings({
      tEval,
      verdicts: modeVerdicts,
      windows: waves,
      ledgerSourceRefs: [],
      sequence: 1,
      previousState: modeVerdicts.map((v) => ({
        scope: v.scope,
        verdict: v.scope === 'w-1545' ? 'normal' : v.verdict,
        since: '2026-11-02T14:55:00+08:00',
        last_crossing_id: ''
      }))
    })
    expect(outsideModePlan.crossing).toBeNull()
  })

  test('(5) & (6) any site change (including return to normal) is eligible with window:null; window return to normal is eligible iff prior last_crossing_id is absent from ledgerSourceRefs', () => {
    const tEval = '2026-11-02T16:15:00+08:00'
    const windowRow: Row<'windows'> = {
      window_id: 'w-1530',
      subscriber_id: 'sub-1',
      kind: 'commute_wave',
      date: '2026-11-02',
      start_myt: '15:30',
      end_myt: '15:30',
      status: 'active'
    }
    const snapNormal = makeSnapshot({
      tEval,
      readings: [
        {
          reading_id: '0232901RF:rain_5m_mm:2026-11-02T16:10:00+08:00',
          source_kind: 'jps_rain',
          source_id: '0232901RF',
          metric: 'rain_5m_mm',
          observed_at: '2026-11-02T16:10:00+08:00',
          received_at: tEval,
          value: 0,
          unit: 'mm'
        },
        ...makeApimsReadingsAt('2026-11-02T16:00:00+08:00', { CA16W: 55 }, tEval)
      ],
      windows: [windowRow]
    })
    const verdictsNormal = evaluateSkyClauses({
      tEval,
      snapshot: snapNormal,
      clauses: defaultSkyClauseRows(),
      windows: [windowRow],
      clauseVersion: 1
    })

    // 1. Site returning from outdoor_limited to normal is eligible even if its prior crossing is in ledgerSourceRefs
    const siteReturnPlan = planSkyCrossings({
      tEval,
      verdicts: verdictsNormal,
      previousState: [
        {
          scope: 'site',
          verdict: 'outdoor_limited',
          since: '2026-11-02T15:00:00+08:00',
          last_crossing_id: 'X-20261102-1500-01'
        },
        { scope: 'w-1530', verdict: 'normal', since: '2026-11-02T15:00:00+08:00', last_crossing_id: '' }
      ],
      ledgerSourceRefs: ['X-20261102-1500-01'],
      windows: [windowRow],
      sequence: 1
    })
    expect(siteReturnPlan.crossing).not.toBeNull()
    const siteChange = findChange(siteReturnPlan.crossing!.document, 'site')
    expect(siteChange.window).toBeNull()
    expect(siteChange.from).toBe('outdoor_limited')
    expect(siteChange.to).toBe('normal')
    expect(findStateRow(siteReturnPlan.stateRows, 'site').last_crossing_id).toBe('X-20261102-1615-01')

    // 2. Window returning to normal while last_crossing_id has NO ledger row -> eligible
    const winReturnUnapproved = planSkyCrossings({
      tEval,
      verdicts: verdictsNormal,
      previousState: [
        { scope: 'site', verdict: 'normal', since: '2026-11-02T15:00:00+08:00', last_crossing_id: '' },
        {
          scope: 'w-1530',
          verdict: 'commute_disruption',
          since: '2026-11-02T15:05:00+08:00',
          last_crossing_id: 'X-20261102-1505-01'
        }
      ],
      ledgerSourceRefs: ['X-20261102-other'],
      windows: [windowRow],
      sequence: 1
    })
    expect(winReturnUnapproved.crossing).not.toBeNull()
    const winChange = findChange(winReturnUnapproved.crossing!.document, 'w-1530')
    expect(winChange.from).toBe('commute_disruption')
    expect(winChange.to).toBe('normal')
    expect(findStateRow(winReturnUnapproved.stateRows, 'w-1530').last_crossing_id).toBe('X-20261102-1615-01')

    // 3. Window returning to normal when last_crossing_id IS in ledgerSourceRefs -> state-only (no crossing file)
    const winReturnApproved = planSkyCrossings({
      tEval,
      verdicts: verdictsNormal,
      previousState: [
        { scope: 'site', verdict: 'normal', since: '2026-11-02T15:00:00+08:00', last_crossing_id: '' },
        {
          scope: 'w-1530',
          verdict: 'commute_disruption',
          since: '2026-11-02T15:05:00+08:00',
          last_crossing_id: 'X-20261102-1505-01'
        }
      ],
      ledgerSourceRefs: ['X-20261102-1505-01'],
      windows: [windowRow],
      sequence: 1
    })
    expect(winReturnApproved.crossing).toBeNull()
    expect(findStateRow(winReturnApproved.stateRows, 'w-1530')).toEqual({
      scope: 'w-1530',
      verdict: 'normal',
      since: tEval,
      last_crossing_id: 'X-20261102-1505-01'
    })
    const noPreviousFile = planSkyCrossings({
      tEval,
      verdicts: verdictsNormal,
      windows: [windowRow],
      ledgerSourceRefs: [],
      sequence: 1,
      previousState: [
        { scope: 'site', verdict: 'normal', since: tEval, last_crossing_id: '' },
        { scope: 'w-1530', verdict: 'no_call', since: '2026-11-02T16:00:00+08:00', last_crossing_id: '' }
      ]
    })
    expect(noPreviousFile.crossing).toBeNull()
    expect(findStateRow(noPreviousFile.stateRows, 'w-1530').verdict).toBe('normal')
  })

  test('(7), (8), (9) & (10) aggregates multiple eligible scopes into one file, does not tag ineligible changed scopes with new crossing ID, formats sequence 2 without mutating inputs, omits replay_notice on live runs, and preserves aggregate/missing input provenance', () => {
    const tEval = '2026-11-02T15:05:00+08:00'
    const waves = replayReleaseWaves()
    const snap = makeSnapshot({
      tEval,
      readings: [
        ...adaptJpsReadings({ upToIso: '2026-11-02T15:00:00+08:00', receivedAt: tEval }),
        ...makeApimsReadingsAt('2026-10-31T06:00:00+08:00', { CA16W: 155, CA19B: 70, CA17W: 65 }, tEval),
        ...makeApimsReadingsAt('2026-11-01T06:00:00+08:00', { CA16W: 160, CA19B: 70, CA17W: 65 }, tEval),
        ...makeApimsReadingsAt('2026-11-02T06:00:00+08:00', { CA16W: 165, CA19B: 70, CA17W: 65 }, tEval),
        ...makeApimsReadingsAt('2026-11-02T15:00:00+08:00', { CA16W: 90, CA19B: 70, CA17W: 65 }, tEval)
      ],
      polls: freshPollsAt(tEval, { met: 'timeout' }),
      windows: waves
    })

    const rawVerdicts = evaluateSkyClauses({
      tEval,
      snapshot: snap,
      clauses: defaultSkyClauseRows(),
      windows: waves,
      clauseVersion: 'v3'
    })

    // Override w-1430 verdict to 'normal' to test an ineligible return-to-normal (approved in ledger) alongside eligible site & w-1530 changes
    const verdicts: SkyVerdict[] = rawVerdicts.map((v) =>
      v.scope === 'w-1430'
        ? {
            ...v,
            mode: 'normal',
            verdict: 'normal' as SkyVerdictValue,
            firedClauses: [] as SkyClauseKey[],
            blockedClauses: [] as SkyClauseKey[]
          }
        : v
    )

    const previousState: Row<'shadow_state'>[] = [
      { scope: 'site', verdict: 'normal', since: '2026-11-02T14:00:00+08:00', last_crossing_id: '' },
      {
        scope: 'w-1430',
        verdict: 'commute_disruption',
        since: '2026-11-02T14:10:00+08:00',
        last_crossing_id: 'X-20261102-1410-01'
      },
      {
        scope: 'w-1500',
        verdict: 'hybrid_recommended',
        since: '2026-11-02T14:35:00+08:00',
        last_crossing_id: 'X-20261102-1435-01'
      },
      { scope: 'w-1530', verdict: 'normal', since: '2026-11-02T14:00:00+08:00', last_crossing_id: '' },
      { scope: 'w-1545', verdict: 'normal', since: '2026-11-02T14:00:00+08:00', last_crossing_id: '' }
    ]

    const input: SkyCrossingInput = {
      tEval,
      verdicts,
      previousState,
      ledgerSourceRefs: ['X-20261102-1410-01'],
      windows: waves,
      sequence: 2,
      replay: false
    }
    const inputClone = structuredClone(input)
    expect(() => planSkyCrossings({ ...input, replayNotice: REPLAY_MISSING_APIMS_NOTICE })).toThrow()

    const plan = planSkyCrossings(input)
    expect(input).toEqual(inputClone)
    expect(plan.crossing).not.toBeNull()

    const doc = plan.crossing!.document
    expect(plan.crossing!.filename).toBe('crossing-20261102-1505-02.json')
    expect(doc.crossing_id).toBe('X-20261102-1505-02')
    expect(doc.replay).toBe(false)
    expect('replay_notice' in doc).toBe(false)
    expect(doc.clause_version).toBe('v3')

    // Eligible scopes: site (normal -> hybrid_recommended), w-1530 (normal -> hybrid_recommended), w-1545 (normal -> hybrid_recommended via site haze_severe)
    // Ineligible: w-1430 (return to normal with approved ref X-20261102-1410-01), w-1500 (unchanged hybrid_recommended)
    expect(doc.changes.map((c) => c.scope)).toEqual(['site', 'w-1530', 'w-1545'])
    expect(findChange(doc, 'site').window).toBeNull()

    // Check w-1430 updated its verdict & since, but kept its prior last_crossing_id (not tagged with X-20261102-1505-02)
    expect(findStateRow(plan.stateRows, 'w-1430')).toEqual({
      scope: 'w-1430',
      verdict: 'normal',
      since: tEval,
      last_crossing_id: 'X-20261102-1410-01'
    })
    // Check w-1500 preserved prior since and prior last_crossing_id
    expect(findStateRow(plan.stateRows, 'w-1500')).toEqual(previousState[2]!)
    // Check eligible scopes received X-20261102-1505-02
    expect(findStateRow(plan.stateRows, 'site').last_crossing_id).toBe('X-20261102-1505-02')
    expect(findStateRow(plan.stateRows, 'w-1530').last_crossing_id).toBe('X-20261102-1505-02')

    // (10) Provenance: aggregate 3-station site.api_0600 has source_id: null and all 3 source_ids; single-station site.api_max has source_id: 'CA16W'; erroring met has state_since and null observed_at/age_min
    const w1530Inputs: SkyCrossingInputEvidence[] = findChange(doc, 'w-1530').inputs
    const api0600Input = w1530Inputs.find((i) => i.name === 'site.api_0600')!
    expect(api0600Input.source_id).toBeNull()
    expect(api0600Input.source_ids).toEqual(['CA16W', 'CA19B', 'CA17W'])
    expect(api0600Input.reading_ids.length).toBe(9)

    const apiMaxInput = w1530Inputs.find((i) => i.name === 'site.api_max')!
    expect(apiMaxInput.source_id).toBe('CA16W')
    expect(apiMaxInput.source_ids).toEqual(['CA16W'])

    const metBlockedInput = w1530Inputs.find((i) => i.name === 'w.met_kl_warning_in_force')!
    expect(metBlockedInput.source_id).toBe('met_warning')
    expect(metBlockedInput.state).toBe('error')
    expect(metBlockedInput.value).toBeNull()
    expect(metBlockedInput.state_since).toBe(tEval)
    expect(metBlockedInput.observed_at).toBeNull()
    expect(metBlockedInput.age_min).toBeNull()

    // Validation guards: non-positive integer sequence or mismatched snapshotId / clauseVersion across verdicts
    expect(() => planSkyCrossings({ ...input, sequence: 0 })).toThrow()
    expect(() =>
      planSkyCrossings({
        ...input,
        verdicts: verdicts.map((v, idx) => (idx === 0 ? { ...v, clauseVersion: 'v-other' } : v))
      })
    ).toThrow()
  })
})
