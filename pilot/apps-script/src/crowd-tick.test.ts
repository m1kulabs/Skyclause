import { describe, expect, test } from 'bun:test'
import {
  dailyFromReadings,
  previousVerdicts,
  recordWeekndForecasts,
  runCrowdForecast,
  type CrowdTickStore
} from './crowd-tick.ts'
import type { Row } from './schema.ts'
import type { RawFile } from './sweep.ts'

function reading(date: string, value: number, revision = 1): Row<'readings'> {
  return {
    reading_id: `SP17:sp17_exits:${date}`,
    source_kind: 'rapidrail_od',
    source_id: 'SP17',
    metric: 'sp17_exits',
    observed_at: `${date}T00:00:00+08:00`,
    received_at: `${date}T12:00:00+08:00`,
    value,
    unit: 'exits',
    http_status: 200,
    latency_ms: 100,
    poll_id: `poll-${date}`,
    revision,
    note: '{}'
  }
}

function listing(night: string, overrides: Partial<Row<'listings'>> = {}): Row<'listings'> {
  return {
    listing_id: `L-${night.replaceAll('-', '')}-stadium-show`,
    night_date: night,
    venue: 'stadium',
    show: 'Show',
    class: 'stadium_concert',
    doors_myt: '18:00',
    show_myt: '20:30',
    show_end_myt: '22:30',
    sources: '["wikipedia"]',
    source_url: 'https://en.wikipedia.org/wiki/X',
    source_revision: '1',
    state: 'listed',
    single_source: false,
    ...overrides
  }
}

interface Seed {
  readings: Row<'readings'>[]
  polls: Row<'polls'>[]
  history: Row<'history'>[]
  listings: Row<'listings'>[]
  forecasts: Row<'forecasts'>[]
  clauses?: Pick<Row<'clauses'>, 'pack' | 'key' | 'threshold' | 'op' | 'enabled' | 'Proposes'>[]
  files: [string, string][]
}

function fakeStore(seed: Partial<Seed> = {}): CrowdTickStore & {
  forecasts: Row<'forecasts'>[]
  shadow: Row<'crowd_shadow'>[]
  files: Map<string, string>
} {
  const forecasts = seed.forecasts ?? []
  const shadow: Row<'crowd_shadow'>[] = []
  const files = new Map<string, string>(seed.files ?? [])
  return {
    forecasts,
    shadow,
    files,
    readReadings: () => seed.readings ?? [],
    readPolls: () => seed.polls ?? [],
    readHistory: () => seed.history ?? [],
    readListings: () => seed.listings ?? [],
    readForecasts: () => forecasts,
    readClauses: () =>
      seed.clauses ?? [
        { pack: 'crowd', key: 'surge_night', threshold: 5000, op: '>=', enabled: true, Proposes: 'Surge night' }
      ],
    appendForecast: (row) => void forecasts.push(row),
    replaceCrowdShadow: (rows) => void shadow.push(...rows),
    crowdFiles: () => [...files].map(([name, text]) => ({ id: name, name, text }) satisfies RawFile),
    writeCrowdFile: (name, text) => void files.set(name, text)
  }
}

// Eight Wednesdays at 3,900, one past Wednesday night at 27,016, and a fresh Monday:
// baseline 3,900 for 4 November 2026, uplift sample 23,116, newest reading 2 Nov.
// The history night sits inside the 730-day uplift window but before the backtest
// window, so the relerr band stays off and the uplift band applies.
function surgeReadings(): Row<'readings'>[] {
  const wednesdays = [
    '2024-09-11',
    '2024-09-18',
    '2024-09-25',
    '2024-10-02',
    '2024-10-09',
    '2024-10-16',
    '2024-10-23',
    '2024-10-30'
  ]
  const rows = wednesdays.map((date) => reading(date, 3900))
  rows.push(reading('2024-11-06', 27016))
  for (const date of [
    '2026-09-09',
    '2026-09-16',
    '2026-09-23',
    '2026-09-30',
    '2026-10-07',
    '2026-10-14',
    '2026-10-21',
    '2026-10-28'
  ])
    rows.push(reading(date, 3900))
  rows.push(reading('2026-11-02', 3700))
  return rows
}

function surgeHistory(): Row<'history'>[] {
  return [
    {
      night_date: '2024-11-06',
      venue: 'stadium',
      show: 'Show',
      class: '',
      source_url: 'u',
      source_revision: '1',
      label_a: 'stadium_concert',
      label_b: 'stadium_concert'
    }
  ]
}

describe('dailyFromReadings', () => {
  test('latest revision wins, future and foreign rows lose', () => {
    const rows = [
      reading('2026-11-02', 3700, 1),
      reading('2026-11-02', 3701, 2),
      reading('2026-11-03', 100, 1),
      { ...reading('2026-11-02', 9999), metric: 'api' },
      { ...reading('2026-11-02', 9999), source_id: 'OTHER' }
    ]
    // tEval before the 3 Nov reading: only 2 Nov counts, at revision 2.
    expect(dailyFromReadings(rows, '2026-11-02T12:00:00+08:00')).toEqual({ '2026-11-02': 3701 })
  })
})

describe('previousVerdicts', () => {
  test('newest file wins, other packs and broken files lose', () => {
    const file = (tEval: string, changes: unknown): RawFile => ({
      id: tEval,
      name: `${tEval}.json`,
      text: JSON.stringify({ pack: 'crowd', t_eval: tEval, crossing_id: `X-${tEval}`, changes })
    })
    const verdicts = previousVerdicts([
      file('2026-11-03T10:00:00+08:00', [{ scope: 'N-20261104', to: 'normal' }]),
      file('2026-11-03T11:00:00+08:00', [{ scope: 'N-20261104', to: 'surge_night' }]),
      { id: 'x', name: 'x', text: 'not json' },
      { id: 'y', name: 'y', text: JSON.stringify({ pack: 'sky', t_eval: 't', changes: [] }) }
    ])
    expect(verdicts).toEqual({ 'N-20261104': 'surge_night' })
  })
})

describe('the surge tick', () => {
  function surgeSeed(): Seed {
    return {
      readings: surgeReadings(),
      polls: [],
      history: surgeHistory(),
      listings: [listing('2026-11-04')],
      forecasts: [],
      files: []
    }
  }

  test('an uplift reaching 5,000 writes one crossing file', () => {
    const store = fakeStore(surgeSeed())
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.forecastsAppended).toEqual(['N-20261104'])
    expect(report.verdicts).toEqual({ 'N-20261104': 'surge_night' })
    expect(report.crossingFile).toBe('crossing-20261103-1000-01.json')

    const forecast = store.forecasts[0]!
    expect(forecast.night_id).toBe('N-20261104')
    expect(forecast.baseline).toBe(3900)
    expect(forecast.uplift).toBe(23116)
    expect(forecast.forecast).toBe(27016)
    expect(forecast.band_low).toBe(27016)
    expect(forecast.band_high).toBe(27016)
    expect(forecast.band_method).toBe('uplift_p10_p90')
    expect(forecast.listing_ids).toBe('["L-20261104-stadium-show"]')

    const file = JSON.parse(store.files.get('crossing-20261103-1000-01.json') ?? '') as {
      crossing_id: string
      pack: string
      replay: boolean
      changes: {
        scope: string
        from: string
        to: string
        fired: string[]
        blocked: string[]
        inputs: { name: string }[]
        night: { night_id: string; listing_ids: string[] }
      }[]
    }
    expect(file.pack).toBe('crowd')
    expect(file.replay).toBe(false)
    expect(file.changes).toHaveLength(1)
    const change = file.changes[0]!
    expect(change.scope).toBe('N-20261104')
    expect(change.from).toBe('normal')
    expect(change.to).toBe('surge_night')
    expect(change.fired).toEqual(['surge_night'])
    expect(change.blocked).toEqual([])
    expect(change.inputs.map((input) => input.name)).toEqual([
      'site.night.baseline',
      'site.night.uplift',
      'site.night.forecast',
      'site.night.band_low',
      'site.night.band_high',
      'site.night.arrival_from',
      'site.night.exit_to'
    ])
    expect(change.night.listing_ids).toEqual(['L-20261104-stadium-show'])

    expect(store.shadow).toHaveLength(1)
    expect(store.shadow[0]).toMatchObject({ scope: 'N-20261104', verdict: 'surge_night' })
  })

  test('an unchanged verdict writes nothing', () => {
    const store = fakeStore(surgeSeed())
    runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    const report = runCrowdForecast(store, new Date('2026-11-03T11:00:00+08:00'))
    expect(report.forecastsAppended).toEqual([])
    expect(report.crossingFile).toBeNull()
    expect(store.files.size).toBe(1)
  })

  test('a changed listing_ids array writes a new forecast row', () => {
    const store = fakeStore(surgeSeed())
    runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    const seed = surgeSeed()
    seed.listings = [
      listing('2026-11-04'),
      listing('2026-11-04', { listing_id: 'L-20261104-arena-show', venue: 'arena', class: 'arena_show' })
    ]
    seed.forecasts = store.forecasts
    seed.files = [...store.files]
    const second = fakeStore(seed)
    const report = runCrowdForecast(second, new Date('2026-11-03T11:00:00+08:00'))
    expect(report.forecastsAppended).toEqual(['N-20261104'])
    // The arena class has no history, so the verdict flips to No call: a crossing.
    expect(report.verdicts).toEqual({ 'N-20261104': 'no_call' })
    expect(report.crossingFile).toBe('crossing-20261103-1100-01.json')
  })

  test('no row is written after the arrival period starts', () => {
    const store = fakeStore(surgeSeed())
    const first = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(first.crossingFile).not.toBeNull()
    // 19:00 MYT on the night: doors were at 18:00.
    const report = runCrowdForecast(store, new Date('2026-11-04T19:00:00+08:00'))
    expect(report.forecastsAppended).toEqual([])
    expect(report.crossingFile).toBeNull()
    expect(report.verdicts).toEqual({ 'N-20261104': 'surge_night' })
  })

  test('a stale newest night is No call naming rapidrail_od', () => {
    const seed = surgeSeed()
    seed.readings = surgeReadings().filter((row) => String(row.observed_at) < '2026-10-01T00:00:00+08:00')
    const store = fakeStore(seed)
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.verdicts).toEqual({ 'N-20261104': 'no_call' })
    const file = JSON.parse([...store.files.values()][0] ?? '') as { changes: { blocked: string[] }[] }
    expect(file.changes[0]!.blocked).toEqual(['rapidrail_od'])
  })

  test('a newer error poll is No call naming rapidrail_od', () => {
    const seed = surgeSeed()
    seed.polls = [
      {
        poll_id: 'p-err',
        source_kind: 'rapidrail_od',
        source_id: 'SP17',
        started_at: '2026-11-03T09:00:00+08:00',
        received_at: '2026-11-03T09:30:00+08:00',
        http_status: 500,
        latency_ms: 1,
        outcome: 'error',
        new_rows: 0,
        error: 'bad gateway',
        raw_file_id: ''
      }
    ]
    const store = fakeStore(seed)
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.verdicts).toEqual({ 'N-20261104': 'no_call' })
    expect(store.shadow[0]!.silent_input).toBe('fired')
  })

  test('other gives No call with an uplift-free forecast row', () => {
    const seed = surgeSeed()
    seed.listings = [listing('2026-11-04', { class: 'other' })]
    const store = fakeStore(seed)
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.verdicts).toEqual({ 'N-20261104': 'no_call' })
    expect(store.forecasts[0]).toMatchObject({ night_id: 'N-20261104', uplift: '', forecast: '' })
    const shadow = store.shadow[0]!
    expect(shadow.surge_night).toBe('blocked:uplift')
    expect(JSON.parse(String(shadow.blocked_inputs))).toEqual(['uplift'])
  })

  test('only listed listings drive the tick', () => {
    const seed = surgeSeed()
    seed.listings = [listing('2026-11-04', { state: 'proposed' })]
    const store = fakeStore(seed)
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.verdicts).toEqual({})
    expect(report.shadowRows).toBe(0)
    expect(report.crossingFile).toBeNull()
  })

  test('the clause threshold decides the verdict', () => {
    const seed = surgeSeed()
    seed.clauses = [
      { pack: 'crowd', key: 'surge_night', threshold: 30000, op: '>=', enabled: true, Proposes: 'Surge night' }
    ]
    const store = fakeStore(seed)
    const report = runCrowdForecast(store, new Date('2026-11-03T10:00:00+08:00'))
    expect(report.verdicts).toEqual({ 'N-20261104': 'normal' })
  })
})

describe('recordWeekndForecasts', () => {
  test('writes both rows with their written-at times and provenance', () => {
    const store = fakeStore()
    const report = recordWeekndForecasts(store)
    expect(report).toEqual({ appended: ['N-20261104', 'N-20261105'], skipped: [] })
    expect(store.forecasts).toHaveLength(2)
    expect(store.forecasts[0]).toMatchObject({
      night_id: 'N-20261104',
      listing_ids: '["L-20261104-stadium-the-weeknd"]',
      baseline: 3928,
      uplift: 23116,
      forecast: 27044,
      band_low: 19315,
      band_high: 32100,
      band_method: 'uplift_p10_p90',
      created_at: '2026-11-04T01:07:00+08:00',
      provenance: 'Fanfall source idea, entered 2026-11-04'
    })
    expect(store.forecasts[1]).toMatchObject({
      night_id: 'N-20261105',
      listing_ids: '["L-20261105-stadium-the-weeknd"]',
      baseline: 3881,
      uplift: 23116,
      forecast: 26997,
      band_low: 19268,
      band_high: 32053,
      band_method: 'uplift_p10_p90',
      created_at: '2026-11-05T07:25:00+08:00',
      provenance: 'Fanfall source idea, entered 2026-11-05'
    })
    expect(store.files.size).toBe(0)
  })

  test('a rerun adds nothing', () => {
    const store = fakeStore()
    recordWeekndForecasts(store)
    const report = recordWeekndForecasts(store)
    expect(report).toEqual({ appended: [], skipped: ['N-20261104', 'N-20261105'] })
    expect(store.forecasts).toHaveLength(2)
  })
})
