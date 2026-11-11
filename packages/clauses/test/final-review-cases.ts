import { canonicalHash, check, evaluate, snapshotAt } from '../src'
import type { Clause, IndicatorSnapshot, NightInput, ReadingHistory, Window } from '../src/types'
import { TEST_REGISTRY } from './test-helpers'

const at = '2026-11-02T07:05:00Z'
const iso = (time: string) => `2026-11-02T${time}:00Z`
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function clause(when: string, extra: Partial<Clause> = {}): Clause {
  return {
    key: 'review',
    name: 'Review',
    enabled: true,
    scope: 'site',
    requires: [],
    when,
    proposes: { mode: 'outdoor_limited' },
    wording: { en: 'Review' },
    ...extra
  }
}
function empty(): IndicatorSnapshot {
  return {
    projectId: 'p',
    pack: 'sky',
    tEval: at,
    inputs: [],
    site: {},
    series: {},
    nights: [],
    registryHash: 'r',
    hash: 's'
  }
}
function verdict(c: Clause, snapshot = empty(), windows: Window[] = [], t = at) {
  const checked = check({ pack: 'sky', clauses: [c] }, TEST_REGISTRY)
  equal(checked.ok, true)
  return evaluate(JSON.parse(JSON.stringify(checked.sheet)), JSON.parse(JSON.stringify(snapshot)), windows, t)
}
function reading(sourceId: string, metric: string, observedAt: string, value: number | null, receivedAt = observedAt) {
  return {
    id: `${sourceId}-${metric}-${observedAt}`,
    sourceId,
    metric,
    observedAt,
    receivedAt,
    value,
    valueText: null,
    valueJson: null as Record<string, unknown> | null,
    itemKey: observedAt,
    revision: 1
  }
}
const rainSource: ReadingHistory['sources'][number] = {
  id: 'rain',
  kind: 'jps_rain',
  cadenceS: 300,
  staleAfterS: 600,
  freshness: 'observed',
  probation: false,
  meta: {}
}
const window: Window = { id: 'w', startsAt: iso('07:00'), endsAt: iso('08:00'), kind: 'class', tz: 'UTC' }
function rainHistory(omit?: string): ReadingHistory {
  const readings = []
  // Explicit simulated zero measurements on every required five-minute slot.
  for (let ms = Date.parse(iso('03:05')); ms <= Date.parse(iso('07:00')); ms += 300000) {
    const observed = new Date(ms).toISOString().replace('.000Z', 'Z')
    if (observed !== omit) readings.push(reading('rain', 'rain_5m_mm', observed, 0))
  }
  return { sources: [rainSource], polls: [], readings }
}
function night(date: string, forecast = 7000): NightInput {
  return {
    id: `night-${date}`,
    date,
    baseline: 100,
    forecast,
    uplift: forecast - 100,
    band: null,
    doors: `${date}T12:00:00Z`,
    show: `${date}T13:00:00Z`,
    arrivalStart: `${date}T11:00:00Z`,
    arrivalEnd: `${date}T13:00:00Z`,
    exitStart: null,
    exitEnd: null,
    singleSource: true,
    forecastId: `forecast-${date}`,
    state: 'fresh'
  }
}
function apiHistory(): ReadingHistory {
  const sources: ReadingHistory['sources'] = ['a', 'b'].map((id) => ({
    ...rainSource,
    id,
    kind: 'apims',
    cadenceS: 3600,
    staleAfterS: 7200
  }))
  const readings = sources.flatMap(({ id }) => [
    reading(id, 'api', iso('06:00'), 50),
    reading(id, 'api', iso('07:00'), 50)
  ])
  for (const [index, morning] of ['2026-10-30T22:00:00Z', '2026-10-31T22:00:00Z', '2026-11-01T22:00:00Z'].entries()) {
    readings.push(reading('a', 'api', morning, 50))
    if (index < 2) readings.push(reading('b', 'api', morning, 200))
  }
  return { sources, readings, polls: [] }
}

export const finalReviewCases: Array<{ name: string; run: () => void }> = [
  ...['timestamp("2026-11-02T07:00:00Z")', 'duration("1h")'].map((arg) => ({
    name: `reject unsupported double(${arg})`,
    run() {
      const checked = check({ pack: 'sky', clauses: [clause(`double(${arg}) > 0.0`)] }, [])
      equal(checked.ok, false)
      equal(checked.publishable, false)
    }
  })),
  {
    name: 'supported numeric and temporal integer casts evaluate',
    run() {
      equal(
        verdict(
          clause(
            'double(1) == 1.0 && double(1u) == 1.0 && double("1.5") == 1.5 && int(duration("1h")) == 3600 && int(timestamp("1970-01-01T00:00:01Z")) == 1'
          )
        ).site[0]?.clauses[0]?.result,
        'fired'
      )
    }
  },
  ...['absent', 'stale', 'error', 'null'].map((state) => ({
    name: `optional nested has false when night ${state}`,
    run() {
      const snapshot = empty()
      if (state !== 'absent')
        snapshot.nights.push({
          ...night('2026-11-02'),
          state: state === 'error' ? 'error' : state === 'stale' ? 'stale' : 'fresh',
          forecast: state === 'null' ? null : 7000
        })
      equal(
        verdict(clause('has(site.night.forecast)', { optional: ['site.night.forecast'] }), snapshot).site[0]?.clauses[0]
          ?.result,
        'not_fired'
      )
    }
  })),
  ...[iso('06:50'), iso('06:05'), iso('03:05')].map((missing) => ({
    name: `missing rain slot ${missing} remains unknown`,
    run() {
      const snapshot = snapshotAt(rainHistory(missing), TEST_REGISTRY, 'p', 'sky', at)
      const indicator = missing === iso('03:05') ? 'w.rain_max_4h_mm' : 'w.rain_max_60m_mm'
      const v = verdict(
        clause(`${indicator} >= 31.0`, {
          scope: 'window',
          requires: [indicator],
          span: { from: 'start', to: 'start+1m' },
          proposes: { mode: 'commute_disruption' }
        }),
        snapshot,
        [window]
      ).windows[0]!
      equal(v.mode, null)
      equal(v.clauses[0]?.result, 'blocked')
      equal(v.clauses[0]?.inputs[0]?.value, null)
      if (missing !== iso('03:05')) {
        equal(snapshot.site['site.rain_60m_mm']?.value, null)
        equal(snapshot.site['site.rain_60m_mm']?.state, 'stale')
      }
    }
  })),
  {
    name: 'complete rain grid is genuine known zero',
    run() {
      const snapshot = snapshotAt(rainHistory(), TEST_REGISTRY, 'p', 'sky', at)
      equal(snapshot.site['site.rain_60m_mm']?.value, 0)
      equal(
        verdict(
          clause('w.rain_max_60m_mm >= 31.0', {
            scope: 'window',
            requires: ['w.rain_max_60m_mm'],
            span: { from: 'start', to: 'start+1m' }
          }),
          snapshot,
          [window]
        ).windows[0]?.mode,
        'normal'
      )
    }
  },
  {
    name: 'early received rain sample affects the endpoint immediately',
    run() {
      const h = rainHistory()
      h.readings[h.readings.length - 1]!.value = 40
      const early = iso('07:00')
      const snapshot = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', early)
      equal(
        verdict(
          clause('w.rain_max_60m_mm >= 31.0', {
            scope: 'window',
            requires: ['w.rain_max_60m_mm'],
            span: { from: 'start', to: 'start+1m' }
          }),
          snapshot,
          [window],
          early
        ).windows[0]?.clauses[0]?.result,
        'fired'
      )
    }
  },
  ...[true, false].map((normalized) => ({
    name: `MET validity ${normalized ? 'normalized UTC wins' : 'raw MYT alone is insufficient'}`,
    run() {
      const wr = reading('met', 'warning', iso('06:30'), null)
      wr.valueJson = {
        text_en: 'Thunderstorms in Kuala Lumpur',
        valid_from: normalized ? '2026-11-02T16:00:00' : '2026-11-02T14:00:00',
        valid_to: normalized ? '2026-11-02T18:00:00' : '2026-11-02T16:00:00',
        ...(normalized ? { valid_from_utc: iso('06:00'), valid_to_utc: iso('08:00') } : {})
      }
      const h: ReadingHistory = {
        warningAreaTerms: ['Kuala Lumpur'],
        sources: [{ ...rainSource, id: 'met', kind: 'met_warning', freshness: 'polled', staleAfterS: 1200 }],
        polls: [{ id: 'poll', sourceId: 'met', startedAt: at, outcome: 'ok', httpStatus: 200 }],
        readings: [wr]
      }
      const s = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', at)
      equal(s.site['site.met_warning_in_force']?.value, normalized)
      if (!normalized) {
        equal(s.warningObservations, {})
        return
      }
      const meta = JSON.parse(JSON.stringify(s)).warningObservations[wr.id]
      equal([meta.validFrom, meta.validTo, meta.observedAt], [iso('06:00'), iso('08:00'), iso('06:30')])
    }
  })),
  ...[
    ['UTC', '2026-11-02T07:00:00Z', '2026-11-02T08:00:00Z', 420, 480],
    ['America/New_York', '2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', 90, 90],
    ['America/New_York', '2026-03-08T06:30:00Z', '2026-03-08T07:30:00Z', 90, 210]
  ].map(([tz, startsAt, endsAt, startMin, endMin]) => ({
    name: `window timezone ${tz} ${startsAt}`,
    run() {
      equal(
        verdict(
          clause(`w.start_local_min == ${startMin} && w.end_local_min == ${endMin} && w.duration == duration("1h")`, {
            scope: 'window',
            requires: ['w.start_local_min', 'w.end_local_min', 'w.duration']
          }),
          empty(),
          [{ ...window, tz: tz as string, startsAt: startsAt as string, endsAt: endsAt as string }]
        ).windows[0]?.clauses[0]?.result,
        'fired'
      )
    }
  })),
  {
    name: 'all bound APIMS stations require three mornings',
    run() {
      const h = apiHistory()
      const snapshot = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', at)
      const c = clause('site.api_0600_min_last3_max > 150', {
        requires: ['site.api_0600_min_last3_max'],
        proposes: { mode: 'hybrid_recommended' },
        wording: { en: "Teaching mode is the lecturer's and the university's decision" }
      })
      equal(snapshot.site['site.api_0600_min_last3_max']?.value, null)
      equal(snapshot.site['site.api_0600_min_last3_max']?.state, 'stale')
      equal(snapshot.site['site.api_0600_min_last3_max']?.ageS, 32700)
      const v = verdict(c, snapshot).site[0]!
      equal(v.mode, null)
      equal(v.noCall?.inputs[0]?.sourceId, 'b')
      h.readings.push(reading('b', 'api', '2026-11-01T22:00:00Z', 200))
      equal(verdict(c, snapshotAt(h, TEST_REGISTRY, 'p', 'sky', at)).site[0]?.mode, 'hybrid_recommended')
    }
  },
  {
    name: 'unmatched night stays blocked regardless of array order',
    run() {
      const snapshot = { ...empty(), nights: [night('2026-11-03'), night('2026-11-04', 50)] }
      const c = clause('site.night.forecast >= 5000', { scope: 'window', requires: ['site.night.forecast'] })
      for (const nights of [snapshot.nights, [...snapshot.nights].reverse()]) {
        const v = verdict(c, { ...snapshot, nights }, [window]).windows[0]!
        equal(v.mode, null)
        equal(v.clauses[0]?.result, 'blocked')
        equal(v.clauses[0]?.inputs[0]?.readingIds, [])
      }
    }
  },
  ...[
    ['UTC', '2026-11-02T23:30:00Z', '2026-11-02'],
    ['America/New_York', '2026-11-02T00:30:00Z', '2026-11-01']
  ].map(([tz, startsAt, date]) => ({
    name: `night selection uses ${tz} local date`,
    run() {
      const snapshot = { ...empty(), nights: [night('2026-11-03', 1), night(date!)] }
      const v = verdict(
        clause('site.night.forecast >= 5000', { scope: 'window', requires: ['site.night.forecast'] }),
        snapshot,
        [{ ...window, tz: tz!, startsAt: startsAt!, endsAt: startsAt! }]
      ).windows[0]!
      equal(v.clauses[0]?.result, 'fired')
      equal(v.clauses[0]?.inputs[0]?.readingIds, [`forecast-${date}`])
    }
  })),
  {
    name: 'equivalent multi-source histories produce the same snapshot hash',
    run() {
      const h = apiHistory()
      const a = snapshotAt(h, TEST_REGISTRY, 'p', 'sky', at)
      const b = snapshotAt(
        { ...h, sources: [...h.sources].reverse(), readings: [...h.readings].reverse() },
        TEST_REGISTRY,
        'p',
        'sky',
        at
      )
      equal(a.hash, b.hash)
      equal(canonicalHash(a), canonicalHash(b))
    }
  },
  ...['site . unknown > 0', '"😀" == "😀" && site . unknown > 0'].map((when) => ({
    name: `original dotted source range ${when}`,
    run() {
      const checked = check({ pack: 'sky', clauses: [clause(when)] }, [])
      const issue = checked.issues.find((i) => i.message.includes('Unknown indicator'))!
      equal(when.slice(issue.offset, issue.offset + issue.length), 'site . unknown')
    }
  }))
]
// Completed/historical periods keep their own endpoint; only a live right edge
// may carry the latest already observed total while the next sample is pending.
export const terminalRainCases = [
  {
    name: 'completed missing terminal stays unknown with zero supplied rain',
    missing: '07:00',
    outside: 0,
    burst: 0,
    result: 'blocked'
  },
  {
    name: 'completed missing terminal cannot borrow 40mm outside the requested hour',
    missing: '07:00',
    outside: 40,
    burst: 0,
    result: 'blocked'
  },
  {
    name: 'completed missing leading bucket remains unknown',
    missing: '06:05',
    outside: 40,
    burst: 0,
    result: 'blocked'
  },
  {
    name: 'completed missing internal bucket remains unknown',
    missing: '06:50',
    outside: 40,
    burst: 0,
    result: 'blocked'
  },
  {
    name: 'present terminal excludes an earlier outside 40mm sample',
    missing: '',
    outside: 40,
    burst: 0,
    result: 'not_fired'
  },
  {
    name: 'present terminal includes its own early-received 40mm sample',
    missing: '',
    outside: 0,
    burst: 40,
    result: 'fired'
  },
  {
    name: 'an open right edge can carry the last complete available period',
    missing: '07:00',
    outside: 0,
    burst: 0,
    result: 'not_fired',
    open: true,
    at: '07:04'
  },
  {
    name: 'an open span still detects a historical terminal gap once later samples exist',
    missing: '07:00',
    outside: 40,
    burst: 0,
    result: 'blocked',
    open: true
  },
  {
    name: 'the exact closing edge holds a complete in-span period',
    missing: '07:05',
    outside: 40,
    burst: 0,
    result: 'not_fired',
    at: '07:06',
    to: 'start+6m'
  },
  {
    name: 'just after closing the missing terminal becomes unavailable',
    missing: '07:05',
    outside: 40,
    burst: 0,
    result: 'blocked',
    at: '07:07',
    to: 'start+6m'
  },
  {
    name: 'the exact closing instant cannot borrow a pre-span hour',
    missing: '07:00',
    outside: 40,
    burst: 0,
    result: 'blocked',
    at: '07:01'
  },
  {
    name: 'a completed span cannot retarget even before a later receipt arrives',
    missing: '07:00',
    outside: 40,
    burst: 0,
    result: 'blocked',
    at: '07:02'
  }
].map((scenario) => ({
  name: scenario.name,
  run() {
    const tEval = iso(scenario.at ?? '07:10')
    const history: ReadingHistory = { sources: [rainSource], polls: [], readings: [] }
    for (let ms = Date.parse(iso('06:00')); ms <= Date.parse(iso('07:10')); ms += 300000) {
      const observedAt = new Date(ms).toISOString().replace('.000Z', 'Z')
      if (observedAt !== (scenario.missing ? iso(scenario.missing) : '')) {
        history.readings.push(
          reading(
            'rain',
            'rain_5m_mm',
            observedAt,
            observedAt === iso('06:00') ? scenario.outside : observedAt === iso('07:00') ? scenario.burst : 0
          )
        )
      }
    }
    const snapshot = snapshotAt(history, TEST_REGISTRY, 'p', 'sky', tEval)
    equal(snapshot.inputs.find((input) => input.name === 'w.rain_max_60m_mm')?.state, 'fresh')
    const v = verdict(
      clause('w.rain_max_60m_mm >= 31.0', {
        scope: 'window',
        requires: ['w.rain_max_60m_mm'],
        span: { from: 'start', to: scenario.to ?? (scenario.open ? 'start+1h' : 'start+1m') },
        proposes: { mode: 'commute_disruption' }
      }),
      snapshot,
      [window],
      tEval
    ).windows[0]!
    const result = v.clauses[0]!
    equal(result.result, scenario.result)
    equal(result.span?.complete, !scenario.open)
    if (scenario.result === 'blocked') {
      equal(v.mode, null)
      equal(v.noCall?.inputs[0]?.name, 'w.rain_max_60m_mm')
      equal(result.inputs[0]?.value, null)
      equal(result.inputs[0]?.state, 'stale')
      equal(result.inputs[0]?.readingIds, [])
      equal(result.inputs[0]?.observedAt, null)
    } else {
      equal(v.noCall, null)
      equal(v.mode, scenario.result === 'fired' ? 'commute_disruption' : 'normal')
      equal(result.inputs[0]?.value, scenario.burst)
      if (scenario.open) equal(result.inputs[0]?.observedAt, iso('06:55'))
      else equal(result.inputs[0]?.readingIds.includes('rain-rain_5m_mm-' + iso('06:00')), false)
    }
  }
}))

export function runFinalReviewCases(): number {
  for (const entry of [...finalReviewCases, ...terminalRainCases]) {
    try {
      entry.run()
    } catch (error) {
      throw new Error(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return finalReviewCases.length + terminalRainCases.length
}
