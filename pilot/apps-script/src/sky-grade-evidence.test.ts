import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseApimsHistory, type ApimsStationId } from './apims-parser.ts'
import { defaultSkyClauseRows } from './clauses.ts'
import { computeSkyObservedSnapshot } from './indicators.ts'
import { parseJpsRainfall } from './jps.ts'
import type { Row } from './schema.ts'
import {
  evaluateSkyGradeEvidence,
  parseSkyGradeWindow,
  type SkyGradeEvidenceInput,
  type SkyGradeWindow
} from './sky-grade-evidence.ts'

function fixture(file: string): unknown {
  return JSON.parse(readFileSync(resolve(import.meta.dir, '../../fixtures', file), 'utf8'))
}
const gauge = parseJpsRainfall(fixture('rainfall-graph-75-20261105T1312Z.json')).map((row) =>
  reading('0232901RF', 'rain_5m_mm', row.observedAt, row.value, '2026-11-05T21:12:00+08:00')
)
function reading(
  id: string,
  metric: string,
  observed: string,
  value: number,
  receipt = '2026-11-07T20:00:00+08:00'
): Row<'readings'> {
  return {
    source_id: id,
    source_kind: metric === 'api' ? 'apims' : metric === 'contrast_far' ? 'camera' : 'jps_rain',
    metric,
    observed_at: observed,
    received_at: receipt,
    value,
    revision: 1,
    reading_id: `${id}:${metric}:${observed}`,
    poll_id: 'capture'
  }
}
const manifest = fixture('apims/apitablehourly-20261107-capture-manifest.json') as {
  requests: Array<{
    file: string
    stationId: ApimsStationId
    stateId: 14 | 10 | 16
    requestedThroughMyt: string
    capturedAtUtc: string
    available: boolean
  }>
}
const apims = manifest.requests
  .filter((row) => row.available && row.requestedThroughMyt.startsWith('2026-11-0'))
  .flatMap((capture) =>
    parseApimsHistory(fixture(`apims/${capture.file}`), {
      stationId: capture.stationId,
      stateId: capture.stateId,
      end: `${capture.requestedThroughMyt}+08:00`
    }).readings.map((row) => reading(row.stationId, 'api', row.observedAt, row.value, capture.capturedAtUtc))
  )
const row: Row<'windows'> = {
  window_id: 'wave',
  date: '2026-11-02',
  start_myt: '14:00',
  end_myt: '15:30',
  status: 'active'
}
// Keep the actual fixture's missing 31 October morning visible; this is the ticket's labelled test-only fallback.
const hazeOffFixtureClauses = defaultSkyClauseRows().map((row) => ({
  ...row,
  enabled: !String(row.key).startsWith('haze_')
}))
function window(): SkyGradeWindow {
  return {
    windowId: 'wave',
    start: new Date('2026-11-02T14:00:00+08:00'),
    end: new Date('2026-11-02T15:30:00+08:00'),
    spanFrom: new Date('2026-11-02T15:00:00+08:00'),
    spanTo: new Date('2026-11-02T16:30:00+08:00'),
    row
  }
}
function input(overrides: Partial<SkyGradeEvidenceInput> = {}): SkyGradeEvidenceInput {
  return {
    spreadsheetId: 'workbook',
    knownAt: new Date('2026-11-08T00:00:00+08:00'),
    window: window(),
    version: {
      savedAt: '2026-11-01T00:00:00+08:00',
      hash: 'labelled-haze-off-fixture',
      clauses: hazeOffFixtureClauses
    },
    sources: [
      {
        source_id: '0232901RF',
        kind: 'jps_rain',
        freshness: 'observed',
        stale_after_min: 10,
        state: 'error',
        state_since: '2026-11-07T00:00:00+08:00'
      },
      ...['CA16W', 'CA19B', 'CA17W'].map((source_id) => ({
        source_id,
        kind: 'apims',
        freshness: 'observed',
        stale_after_min: 120,
        state: 'recovered'
      }))
    ],
    readings: [...gauge, ...apims],
    polls: [],
    warnings: [],
    daylight: null,
    cameraHistory: null,
    ...overrides
  }
}
function mode(overrides: Partial<SkyGradeEvidenceInput> = {}) {
  return evaluateSkyGradeEvidence(input(overrides))
}
function enabledHaze(days = 2): SkyGradeEvidenceInput['version'] {
  return {
    savedAt: '2026-11-01T00:00:00+08:00',
    hash: `test-days-${days}`,
    clauses: defaultSkyClauseRows().map((row) =>
      row.key === 'haze_severe' ? { ...row, threshold: JSON.stringify({ api_max: 180, api_0600: 150, days }) } : row
    )
  }
}

// Test-only version keeps actual APIMS capture gaps visible while exercising its current-hour branch.
function apiOnlyFixtureVersion(): SkyGradeEvidenceInput['version'] {
  return {
    ...enabledHaze(3),
    hash: 'labelled-api-only-fixture',
    clauses: defaultSkyClauseRows().map((row) => (row.key === 'haze_severe' ? { ...row, enabled: false } : row))
  }
}
// Independent controlled inputs for complete three-morning semantics; never appended to real captures.
function syntheticApims(): Row<'readings'>[] {
  return ['CA16W', 'CA19B', 'CA17W'].flatMap((id) =>
    [
      '2026-11-02T16:00:00+08:00',
      '2026-11-02T06:00:00+08:00',
      '2026-11-01T06:00:00+08:00',
      '2026-10-31T06:00:00+08:00'
    ].map((stamp) => reading(id, 'api', stamp, 50))
  )
}

describe('complete historical Sky evidence', () => {
  test('real 15:30 wave has 66 required gauge stamps, original receipts, and labelled haze-off commute disruption', () => {
    const stamps = gauge.filter(
      (r) =>
        String(r.observed_at) >= '2026-11-02T11:05:00+08:00' && String(r.observed_at) <= '2026-11-02T16:30:00+08:00'
    )
    expect(stamps).toHaveLength(66)
    expect(new Set(stamps.map((r) => r.received_at))).toEqual(new Set(['2026-11-05T21:12:00+08:00']))
    expect(mode()).toEqual({ observedMode: 'commute_disruption', problems: [] })
  })
  test('actual APIMS 7 November captures keep missing 31 October 06:00 explicit', () => {
    expect(
      apims
        .filter((r) => r.observed_at === '2026-11-02T16:00:00+08:00')
        .map((r) => r.value)
        .sort()
    ).toEqual([69, 77, 80])
    expect(apims.every((r) => String(r.received_at).startsWith('2026-11-07'))).toBe(true)
    const result = mode({ version: enabledHaze(3) })
    expect(result.observedMode).toBe('no_call')
    expect(result.problems.join(' ')).toContain('2026-10-31T06:00:00+08:00')
    expect(mode({ version: apiOnlyFixtureVersion() }).observedMode).toBe('commute_disruption')
    expect(mode({ version: enabledHaze(1) }).observedMode).toBe('no_call')
    expect(mode({ version: enabledHaze(2) }).observedMode).toBe('no_call')
  })
  test('missing 15:00–16:00 gauge blocks even a fired rank-three haze clause', () => {
    const readings = [
      ...gauge.filter(
        (r) =>
          String(r.observed_at) < '2026-11-02T15:00:00+08:00' || String(r.observed_at) > '2026-11-02T16:00:00+08:00'
      ),
      ...syntheticApims(),
      reading('CA16W', 'api', '2026-11-02T16:00:00+08:00', 200)
    ]
    expect(mode({ readings, version: enabledHaze(2) }).observedMode).toBe('no_call')
    expect(
      mode({
        readings: [...gauge, ...syntheticApims(), reading('CA16W', 'api', '2026-11-02T16:00:00+08:00', 200)],
        version: enabledHaze(2)
      }).observedMode
    ).toBe('hybrid_recommended')
  })
  test.each(['2026-11-02T11:05:00+08:00', '2026-11-02T12:00:00+08:00', '2026-11-02T16:30:00+08:00'])(
    'requires the whole rolling union including %s',
    (stamp) => {
      expect(mode({ readings: gauge.filter((r) => r.observed_at !== stamp) }).observedMode).toBe('no_call')
    }
  )
  test('zero is evidence; newer revisions dominate and invalid replacements are not silently discarded', () => {
    const zero = gauge.map((r) => ({ ...r, value: 0 }))
    expect(mode({ readings: zero }).observedMode).toBe('normal')
    for (const value of ['', 'invalid', -1, false, Infinity]) {
      expect(
        mode({
          readings: [
            ...zero,
            { ...zero.find((r) => r.observed_at === '2026-11-02T12:00:00+08:00')!, value, revision: 2 }
          ]
        }).observedMode
      ).toBe('no_call')
    }
    expect(
      mode({
        readings: [
          ...zero,
          { ...zero.find((r) => r.observed_at === '2026-11-02T15:30:00+08:00')!, value: 40, revision: 2 }
        ]
      }).observedMode
    ).toBe('commute_disruption')
  })
  test('off-grid facts in the required union are ambiguity, not extra rain', () => {
    expect(
      mode({ readings: [...gauge, reading('0232901RF', 'rain_5m_mm', '2026-11-02T12:01:00+08:00', 4)] }).observedMode
    ).toBe('no_call')
  })
  test('non-aligned edges use first/last aligned stamps, not fractional invented samples', () => {
    const win = window()
    win.end = new Date('2026-11-02T15:32:00+08:00')
    win.spanFrom = new Date('2026-11-02T15:02:00+08:00')
    win.spanTo = new Date('2026-11-02T16:32:00+08:00')
    win.row = { ...row, end_myt: '15:32' }
    const readings = gauge.filter(
      (r) =>
        String(r.observed_at) >= '2026-11-02T11:10:00+08:00' && String(r.observed_at) <= '2026-11-02T16:30:00+08:00'
    )
    expect(mode({ window: win, readings }).observedMode).toBe('commute_disruption')
    expect(mode({ window: win, readings: readings.slice(1) }).observedMode).toBe('no_call')
  })
  test('each expected APIMS floor-hour and every required morning is mandatory', () => {
    expect(mode({ version: enabledHaze(2), readings: [...gauge, ...syntheticApims()] }).observedMode).toBe(
      'commute_disruption'
    )
    for (const id of ['CA16W', 'CA19B', 'CA17W']) {
      for (const stamp of [
        '2026-11-02T16:00:00+08:00',
        '2026-11-02T06:00:00+08:00',
        '2026-11-01T06:00:00+08:00',
        '2026-10-31T06:00:00+08:00'
      ]) {
        expect(
          mode({
            version: enabledHaze(2),
            readings: [...gauge, ...syntheticApims().filter((r) => !(r.source_id === id && r.observed_at === stamp))]
          }).observedMode
        ).toBe('no_call')
      }
    }
  })
  test('facts received after knownAt cannot prove the past', () => {
    expect(mode({ knownAt: new Date('2026-11-04T00:00:00+08:00') }).observedMode).toBe('no_call')
    expect(
      mode({ version: apiOnlyFixtureVersion(), knownAt: new Date('2026-11-06T00:00:00+08:00') }).observedMode
    ).toBe('no_call')
    expect(
      mode({
        version: apiOnlyFixtureVersion(),
        readings: [...gauge, ...apims, reading('CA16W', 'api', '2026-11-09T16:00:00+08:00', 999)]
      }).observedMode
    ).toBe('commute_disruption')
  })
  test('unsupported enabled clause gives an explicit problem and no_call', () => {
    const version = apiOnlyFixtureVersion()
    version.clauses.push({ pack: 'sky', key: 'unsupported', enabled: true })
    const result = mode({ version })
    expect(result.observedMode).toBe('no_call')
    expect(result.problems.join(' ')).toContain('unsupported')
  })
  test('unclosed span is not observed ground truth', () => {
    expect(mode({ knownAt: window().spanTo }).observedMode).toBe('no_call')
  })
})

function errorPoll(id: string, kind: string, start: string, end: string): Row<'polls'> {
  return { source_id: id, source_kind: kind, started_at: start, received_at: end, outcome: 'error', poll_id: 'failed' }
}
describe('actual poll intervals', () => {
  test('overlapping gauge errors survive a later successful poll', () => {
    const error = errorPoll('0232901RF', 'jps_rain', '2026-11-02T11:04:00+08:00', '2026-11-02T11:06:00+08:00')
    expect(
      mode({
        polls: [
          error,
          { ...error, started_at: '2026-11-02T16:30:00+08:00', received_at: '2026-11-02T16:30:01+08:00', outcome: 'ok' }
        ]
      }).observedMode
    ).toBe('no_call')
  })
  test('old errors and later backfill errors do not overlap past required evidence', () => {
    expect(
      mode({
        polls: [
          errorPoll('0232901RF', 'jps_rain', '2026-11-01T11:00:00+08:00', '2026-11-01T11:01:00+08:00'),
          errorPoll('0232901RF', 'jps_rain', '2026-11-05T11:00:00+08:00', '2026-11-05T11:01:00+08:00')
        ]
      }).observedMode
    ).toBe('commute_disruption')
  })
  test.each(['apims', 'apims:backfill:14:actual', 'CA19B'])(
    'shared/bound APIMS errors map to required hours: %s',
    (id) => {
      expect(
        mode({
          version: enabledHaze(2),
          readings: [...gauge, ...syntheticApims()],
          polls: [errorPoll(id, 'apims', '2026-11-02T16:05:00+08:00', '2026-11-02T16:06:00+08:00')]
        }).observedMode
      ).toBe('no_call')
      expect(
        mode({
          version: enabledHaze(2),
          readings: [...gauge, ...syntheticApims()],
          polls: [errorPoll(id, 'apims', '2026-11-01T06:45:00+08:00', '2026-11-01T06:46:00+08:00')]
        }).observedMode
      ).toBe('no_call')
    }
  )
  test('one usable endpoint identifies an instant; unusable timing is an explicit problem', () => {
    expect(mode({ polls: [errorPoll('0232901RF', 'jps_rain', '', '2026-11-02T12:00:00+08:00')] }).observedMode).toBe(
      'no_call'
    )
    const result = mode({ polls: [errorPoll('0232901RF', 'jps_rain', '', '')] })
    expect(result.observedMode).toBe('no_call')
    expect(result.problems.join(' ')).toContain('timing')
  })
  test('future receipt does not constitute a known error', () => {
    expect(
      mode({ polls: [errorPoll('0232901RF', 'jps_rain', '2026-11-02T12:00:00+08:00', '2026-11-09T12:00:00+08:00')] })
        .observedMode
    ).toBe('commute_disruption')
  })
})

describe('public window validation', () => {
  test('parses exact times and cross-midnight span close without today fallback', () => {
    expect(parseSkyGradeWindow(row).window?.spanTo.toISOString()).toBe('2026-11-02T08:30:00.000Z')
    expect(parseSkyGradeWindow({ ...row, start_myt: '22:00', end_myt: '23:30' }).window?.spanTo.toISOString()).toBe(
      '2026-11-02T16:30:00.000Z'
    )
  })
  test.each([
    { date: '' },
    { date: '2026-02-30' },
    { date: '2026-13-02' },
    { start_myt: '24:00' },
    { end_myt: '15:30:99' },
    { start_myt: '2026-11-02T14:00:00' },
    { end_myt: '2026-02-30T15:30:00+08:00' },
    { end_myt: '13:00' },
    { window_id: '' },
    { status: 'cancelled' }
  ])('rejects invalid public window %j', (change) => {
    const parsed = parseSkyGradeWindow({ ...row, ...change })
    expect(parsed.window).toBeNull()
    expect(parsed.problem).toBeTruthy()
  })
})

function cameraInput(): SkyGradeEvidenceInput {
  const current = input({
    version: apiOnlyFixtureVersion(),
    readings: [
      ...gauge.map((r) => ({ ...r, value: 0 })),
      ...apims,
      ...['16:10', '16:20', '16:30'].map((time) =>
        reading('cam', 'contrast_far', `2026-11-02T${time}:00+08:00`, 0.2, `2026-11-02T${time}:00+08:00`)
      )
    ],
    daylight: { start: '07:15', end: '19:00' },
    cameraHistory: {
      version: 1,
      spreadsheetId: 'workbook',
      decisions: [{ sourceId: 'cam', passed: true, at: '2026-11-02T08:10:00.000Z' }]
    }
  })
  current.sources = [
    ...current.sources,
    { source_id: 'cam', kind: 'camera', stale_after_min: 20, freshness: 'observed', probation: false }
  ]
  return current
}
describe('recorded camera eligibility', () => {
  test('first known pass boundary includes equal capture/receipt timestamps', () => {
    expect(evaluateSkyGradeEvidence(cameraInput()).observedMode).toBe('outdoor_limited')
  })
  test('unknown older frames, buffered pre-pass frames, and receipts after failure cannot contribute', () => {
    for (const scenario of ['unknown', 'pre-pass', 'receipt-failure']) {
      const current = cameraInput()
      if (scenario === 'unknown') current.cameraHistory = null
      if (scenario === 'pre-pass') current.cameraHistory!.decisions[0]!.at = '2026-11-02T08:11:00.000Z'
      if (scenario === 'receipt-failure') {
        current.cameraHistory!.decisions.push({ sourceId: 'cam', passed: false, at: '2026-11-02T09:00:00.000Z' })
        current.sources = current.sources.map((s) => (s.kind === 'camera' ? { ...s, probation: true } : s))
        current.readings = current.readings.map((r) =>
          r.source_id === 'cam' ? { ...r, received_at: '2026-11-02T17:00:00+08:00' } : r
        )
      }
      expect(evaluateSkyGradeEvidence(current).observedMode).toBe('normal')
    }
  })
  test('later genuine fail does not erase previously passed frames; equal-time append order controls lookup', () => {
    const current = cameraInput()
    current.cameraHistory!.decisions.push({ sourceId: 'cam', passed: false, at: '2026-11-03T00:00:00.000Z' })
    current.sources = current.sources.map((s) => (s.kind === 'camera' ? { ...s, probation: true } : s))
    expect(evaluateSkyGradeEvidence(current).observedMode).toBe('outdoor_limited')
    current.cameraHistory!.decisions.splice(1, 0, { sourceId: 'cam', passed: false, at: '2026-11-02T08:10:00.000Z' })
    expect(evaluateSkyGradeEvidence(current).observedMode).toBe('normal')
  })
  test.each(['wrong-book', 'wrong-source', 'mirror', 'future', 'malformed', 'boundary-problem'])(
    'unavailable camera remains optional: %s',
    (problem) => {
      const current = cameraInput()
      if (problem === 'wrong-book') current.cameraHistory!.spreadsheetId = 'different'
      if (problem === 'wrong-source') current.cameraHistory!.decisions[0]!.sourceId = 'other'
      if (problem === 'mirror')
        current.sources = current.sources.map((s) => (s.kind === 'camera' ? { ...s, probation: true } : s))
      if (problem === 'future') current.cameraHistory!.decisions[0]!.at = '2026-11-09T00:00:00.000Z'
      if (problem === 'malformed') current.cameraHistory!.decisions[0]!.at = 'bad'
      if (problem === 'boundary-problem') current.cameraHistoryProblem = 'camera_history_read_failed'
      const result = evaluateSkyGradeEvidence(current)
      expect(result.observedMode).toBe('normal')
      expect(result.problems.length).toBeGreaterThan(0)
    }
  )
  test('missing/invalid hours exclude camera with explicit problem, never block complete rain/APIMS', () => {
    for (const daylight of [
      null,
      { start: '25:00', end: '19:00' },
      { start: '19:00', end: '07:15' },
      { start: '07:15:99', end: '19:00' }
    ]) {
      const current = cameraInput()
      current.daylight = daylight
      const result = evaluateSkyGradeEvidence(current)
      expect(result.observedMode).toBe('normal')
      expect(result.problems.join(' ')).toContain('daylight')
    }
  })
  test('camera snapshot has no fabricated source updates or forecast evidence', () => {
    const current = cameraInput()
    const snapshot = computeSkyObservedSnapshot({
      ...current,
      tEval: current.window.spanTo.toISOString(),
      knownAt: current.knownAt.toISOString(),
      windows: [row],
      cameraEligibility: 'passed'
    })
    expect(snapshot).not.toHaveProperty('sourceUpdates')
    expect(snapshot.nowRows[0]!['site.met_afternoon_thunderstorm']).toBe('')
  })
})

describe('historical boundary regressions', () => {
  test('blank and case-insensitive Sky packs consume the same APIMS requirements as the evaluator', () => {
    for (const pack of ['', ' SKY ']) {
      const version = enabledHaze(3)
      version.clauses = version.clauses.map((r) => ({ ...r, pack }))
      expect(mode({ version }).observedMode).toBe('no_call')
    }
  })
  test('blank-space values and invalid off-grid facts cannot masquerade as complete evidence', () => {
    expect(
      mode({
        readings: [
          ...gauge,
          { ...gauge.find((r) => r.observed_at === '2026-11-02T12:00:00+08:00')!, value: ' ', revision: 2 }
        ]
      }).observedMode
    ).toBe('no_call')
    expect(
      mode({
        readings: [
          ...gauge,
          { ...reading('0232901RF', 'rain_5m_mm', '2026-11-02T12:01:00+08:00', 1), value: 'invalid' }
        ]
      }).observedMode
    ).toBe('no_call')
  })
  test('a revision sharing an eligible camera identity must itself satisfy receipt eligibility', () => {
    const current = cameraInput()
    current.cameraHistory!.decisions.push({ sourceId: 'cam', passed: false, at: '2026-11-03T00:00:00.000Z' })
    current.sources = current.sources.map((s) => (s.kind === 'camera' ? { ...s, probation: true } : s))
    // The later revision is post-failure; selecting it by reading ID alone would erase the valid earlier frame.
    const frame = current.readings.find((r) => r.source_id === 'cam')!
    current.readings = [
      ...current.readings,
      { ...frame, value: 0.9, revision: 2, received_at: '2026-11-04T00:00:00+08:00' }
    ]
    expect(evaluateSkyGradeEvidence(current).observedMode).toBe('outdoor_limited')
  })
  test('ISO midnight rollover is rejected as an invalid public clock', () => {
    expect(parseSkyGradeWindow({ ...row, end_myt: '2026-11-02T24:00:00+08:00' }).window).toBeNull()
  })
})

describe('strict observed clocks and midnight evaluation', () => {
  test.each(['2026-11-07', '2026-02-30T00:00:00+08:00', 'not-a-time'])(
    'invalid receipt cannot prove a required reading: %s',
    (received_at) => {
      const readings = gauge.map((r) => (r.observed_at === '2026-11-02T12:00:00+08:00' ? { ...r, received_at } : r))
      expect(mode({ readings }).observedMode).toBe('no_call')
    }
  )
  test('a malformed error endpoint is not normalized into an unrelated historical instant', () => {
    const result = mode({ polls: [errorPoll('0232901RF', 'jps_rain', '2026-02-30T00:00:00+08:00', '')] })
    expect(result.observedMode).toBe('no_call')
    expect(result.problems.join(' ')).toContain('timing')
  })
  test('grades at the actual next-day close and consumes prior mornings before 06:00', () => {
    const parsed = parseSkyGradeWindow({ ...row, start_myt: '22:00', end_myt: '23:30' }).window!
    const readings: Row<'readings'>[] = []
    for (let stamp = parsed.spanFrom.getTime() - 235 * 60_000; stamp <= parsed.spanTo.getTime(); stamp += 5 * 60_000)
      readings.push(reading('0232901RF', 'rain_5m_mm', new Date(stamp).toISOString(), 0))
    for (const id of ['CA16W', 'CA19B', 'CA17W']) {
      readings.push(
        reading(id, 'api', '2026-11-03T00:00:00+08:00', 50),
        reading(id, 'api', '2026-11-02T06:00:00+08:00', 50),
        reading(id, 'api', '2026-11-01T06:00:00+08:00', 50),
        reading(id, 'api', '2026-10-31T06:00:00+08:00', 50)
      )
    }
    expect(mode({ window: parsed, readings, version: enabledHaze(2) }).observedMode).toBe('normal')
  })
  test('valid fractional-second explicit-offset receipts remain real evidence', () => {
    expect(
      mode({ readings: gauge.map((r) => ({ ...r, received_at: '2026-11-05T21:12:59.999+08:00' })) }).observedMode
    ).toBe('commute_disruption')
  })
})

test('off-grid input just outside aligned union cannot change rolling sums or replace the APIMS floor-hour', () => {
  const win = parseSkyGradeWindow({ ...row, end_myt: '15:32' }).window!
  for (const stamp of ['2026-11-02T11:06:00+08:00', '2026-11-02T16:31:00+08:00']) {
    expect(
      mode({ window: win, readings: [...gauge, reading('0232901RF', 'rain_5m_mm', stamp, 40)] }).observedMode
    ).toBe('no_call')
  }
  expect(
    mode({
      version: apiOnlyFixtureVersion(),
      readings: [...gauge, ...apims, reading('CA16W', 'api', '2026-11-02T16:01:00+08:00', 200)]
    }).observedMode
  ).toBe('no_call')
})

describe('root-confirmed historical consumption rules', () => {
  test('a failure before close disables still-fresh frames passed at capture and receipt', () => {
    const current = cameraInput()
    current.readings = current.readings
      .filter((r) => r.source_id !== 'cam')
      .concat(
        ['16:05', '16:10', '16:20'].map((time) =>
          reading('cam', 'contrast_far', `2026-11-02T${time}:00+08:00`, 0.2, `2026-11-02T${time}:00+08:00`)
        )
      )
    current.cameraHistory!.decisions[0]!.at = '2026-11-02T08:00:00.000Z'
    current.cameraHistory!.decisions.push({ sourceId: 'cam', passed: false, at: '2026-11-02T08:25:00.000Z' })
    current.sources = current.sources.map((s) => (s.kind === 'camera' ? { ...s, probation: true } : s))
    expect(evaluateSkyGradeEvidence(current).observedMode).toBe('normal')
  })
  test.each([1, 2])('days=%s retains the three-morning indicator horizon and its older qualifying streak', (days) => {
    const readings = [
      ...gauge.map((r) => ({ ...r, value: 0 })),
      ...syntheticApims(),
      reading('CA16W', 'api', '2026-10-31T06:00:00+08:00', 200),
      reading('CA16W', 'api', '2026-11-01T06:00:00+08:00', 200)
    ]
    expect(mode({ readings, version: enabledHaze(days) }).observedMode).toBe('hybrid_recommended')
    const olderOnly = [
      ...gauge.map((r) => ({ ...r, value: 0 })),
      ...syntheticApims(),
      reading('CA16W', 'api', '2026-10-30T06:00:00+08:00', 200),
      reading('CA16W', 'api', '2026-10-29T06:00:00+08:00', 200)
    ]
    expect(mode({ readings: olderOnly, version: enabledHaze(days) }).observedMode).toBe('normal')
    expect(
      mode({
        readings: readings.filter((r) => !(r.source_id === 'CA16W' && r.observed_at === '2026-11-02T06:00:00+08:00')),
        version: enabledHaze(days)
      }).observedMode
    ).toBe('no_call')
  })
})
