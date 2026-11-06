// Tests for the Crowd D+1 grader (#70). Actuals come from the real capture in
// `pilot/fixtures/rapidrail-sp17-daily.json`; the metadata text is the #68
// capture. Test doubles stand in for the sheets, Drive and the fetcher.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  apeOf,
  arrivalStart,
  checkKillCriterion,
  finalGradeText,
  forecastBeforeDoors,
  formatCount,
  formatScored,
  gradeAgainstBaseline,
  gradeAgainstForecast,
  gradeFileName,
  gradeWithoutForecast,
  nightId,
  runCrowdGrading,
  scoreSurgeFlags,
  surgeThreshold,
  wilsonInterval,
  type CrowdGradePorts,
  type CrowdGradeStore
} from './crowd-grades.ts'
import type { Row } from './schema.ts'

const fixtures = join(import.meta.dir, '..', '..', 'fixtures')
const daily = JSON.parse(readFileSync(join(fixtures, 'rapidrail-sp17-daily.json'), 'utf8')) as Record<
  string,
  number | undefined
>
const metadataText = readFileSync(join(fixtures, 'ridership-od-rapidrail-daily-20261106T1456Z.json'), 'utf8')

const actual4 = daily['2026-11-04'] ?? -1
const actual3 = daily['2026-11-03'] ?? -1
const may23 = daily['2026-05-23'] ?? -1
const feb1 = daily['2026-02-01'] ?? -1

test('the captures hold the replay counts', () => {
  expect(actual4).toBe(33804)
  expect(actual3).toBe(4944)
  expect(may23).toBe(15447)
  expect(feb1).toBe(3467)
})

interface FakeStore {
  store: CrowdGradeStore
  appended: Row<'crowd_grades'>[]
  polls: Row<'polls'>[]
  files: { name: string; text: string }[]
}

function fakeStore(args: {
  readings?: Row<'readings'>[]
  forecasts?: Row<'forecasts'>[]
  listings?: Row<'listings'>[]
  clauses?: Row<'clauses'>[]
  grades?: Row<'crowd_grades'>[]
  baselines?: Record<string, number>
}): FakeStore {
  const appended: Row<'crowd_grades'>[] = []
  const polls: Row<'polls'>[] = []
  const files: { name: string; text: string }[] = []
  const grades = [...(args.grades ?? [])]
  const store: CrowdGradeStore = {
    readings: () => args.readings ?? [],
    forecasts: () => args.forecasts ?? [],
    listings: () => args.listings ?? [],
    clauses: () => args.clauses ?? [],
    grades: () => [...grades, ...appended],
    appendGrades: (rows) => void appended.push(...rows),
    appendPoll: (row) => void polls.push(row),
    saveGradeFile: (name, text) => {
      files.push({ name, text })
      return `file-${files.length}`
    },
    baselineFor: (nightDate) => args.baselines?.[nightDate] ?? null
  }
  return { store, appended, polls, files }
}

function ports(store: CrowdGradeStore, now = '2026-11-06T00:20:00+08:00'): CrowdGradePorts {
  return {
    store,
    fetchMetadata: () => ({ status: 200, text: metadataText }),
    now: () => new Date(now),
    newPollId: () => 'poll-1'
  }
}

function reading(date: string, value: number, runner: string): Row<'readings'> {
  return {
    reading_id: `SP17:sp17_exits:${date}`,
    source_kind: 'rapidrail_od',
    source_id: 'SP17',
    metric: 'sp17_exits',
    observed_at: `${date}T00:00:00+08:00`,
    received_at: '2026-11-06T00:10:00+08:00',
    value,
    unit: 'exits',
    http_status: 200,
    latency_ms: 1,
    poll_id: 'poll-0',
    revision: 1,
    note: JSON.stringify({
      runner,
      device_time: '2026-11-05T22:00:00+08:00',
      posted_at: '2026-11-06T00:10:00+08:00',
      header_age_s: 60,
      data_as_of: '2026-11-05 23:59'
    })
  }
}

function listing(id: string, date: string): Row<'listings'> {
  return {
    listing_id: id,
    night_date: date,
    venue: 'Bukit Jalil National Stadium',
    show: 'The Weeknd',
    class: 'stadium concert',
    doors_myt: '19:00',
    show_myt: '20:00',
    state: 'listed'
  }
}

function forecast(
  id: string,
  night: string,
  createdAt: string,
  point: number,
  low: number,
  high: number,
  baseline: number
): Row<'forecasts'> {
  return {
    forecast_id: id,
    night_id: night,
    listing_ids: 'L-weeknd',
    baseline,
    uplift: point - baseline,
    forecast: point,
    band_low: low,
    band_high: high,
    band_method: 'backtest p10-p90',
    created_at: createdAt,
    provenance: 'fanfall'
  }
}

const surgeClauses: Row<'clauses'>[] = [
  { pack: 'crowd', Clause: 'Surge night', key: 'surge_night', threshold: 5000, op: '>=', enabled: true }
]

describe('wilsonInterval', () => {
  test('matches the hand-computed intervals', () => {
    expect(wilsonInterval(40, 50)).toEqual({ low: 0.67, high: 0.89 })
    expect(wilsonInterval(7, 8)).toEqual({ low: 0.53, high: 0.98 })
    expect(wilsonInterval(7, 21)).toEqual({ low: 0.17, high: 0.55 })
  })
  test('is null with n = 0', () => {
    expect(wilsonInterval(0, 0)).toBeNull()
  })
})

describe('grade outcomes', () => {
  test('a forecast night is in band inside the band and out outside it', () => {
    expect(gradeAgainstForecast(27044, 27044, 19315, 32100).outcome).toBe('in_band')
    expect(gradeAgainstForecast(19315, 27044, 19315, 32100).outcome).toBe('in_band')
    expect(gradeAgainstForecast(32100, 27044, 19315, 32100).outcome).toBe('in_band')
    expect(gradeAgainstForecast(33804, 27044, 19315, 32100)).toEqual({ outcome: 'out_of_band', ape: 0.2 })
    expect(apeOf(33804, 27044)).toBe(0.2)
  })
  test('an unlisted night surges at 5,000 over baseline', () => {
    expect(gradeAgainstBaseline(may23, 2423, 5000)).toBe('unlisted_surge')
    expect(gradeAgainstBaseline(feb1, 1836, 5000)).toBe('no_surge')
  })
  test('a listed night with no forecast before doors keeps an empty ape', () => {
    expect(gradeWithoutForecast(33804, 3928, 5000)).toEqual({ outcome: 'out_of_band' })
    expect(gradeWithoutForecast(4944, 4000, 5000)).toEqual({ outcome: 'no_surge' })
  })
  test('formats counts and the grade text', () => {
    expect(formatCount(33804)).toBe('33,804')
    expect(
      finalGradeText({
        outcome: 'out_of_band',
        actual: 33804,
        forecast: 27044,
        bandLow: 19315,
        bandHigh: 32100,
        ape: 0.2
      })
    ).toBe('Out of band: 33,804 exits against 27,044 (band 19,315–32,100), APE 20.0%')
    expect(finalGradeText({ outcome: 'unlisted_surge', actual: 15447, baseline: 2423 })).toBe(
      'Unlisted surge: 15,447 exits against a 2,423 baseline'
    )
    expect(finalGradeText({ outcome: 'no_surge', actual: 3467, baseline: 1836 })).toBe(
      'No surge: 3,467 exits against a 1,836 baseline'
    )
  })
  test('night IDs and grade file names', () => {
    expect(nightId('2026-11-04')).toBe('N-20261104')
    expect(gradeFileName('2026-11-04', '2026-11-06T00:20:00+08:00')).toBe('grade-20261104-20261106-0020.json')
  })
  test('arrival starts at doors, else show time, else 16:00', () => {
    expect(arrivalStart('2026-11-04', [{ doors_myt: '19:00', show_myt: '20:00' }])).toBe('2026-11-04T19:00:00+08:00')
    expect(arrivalStart('2026-11-04', [{ doors_myt: '', show_myt: '20:00' }])).toBe('2026-11-04T20:00:00+08:00')
    expect(arrivalStart('2026-11-04', [])).toBe('2026-11-04T16:00:00+08:00')
  })
  test('the forecast is the latest row written before the arrival period', () => {
    const rows = [
      forecast('F-old', 'N-20261104', '2026-11-03T10:00:00+08:00', 26000, 19000, 31000, 3928),
      forecast('F-new', 'N-20261104', '2026-11-04T01:07:00+08:00', 27044, 19315, 32100, 3928),
      forecast('F-late', 'N-20261104', '2026-11-04T20:00:00+08:00', 30000, 20000, 34000, 3928)
    ]
    expect(forecastBeforeDoors(rows, 'N-20261104', '2026-11-04T19:00:00+08:00')?.forecast_id).toBe('F-new')
  })
  test('the Surge night threshold comes from the enabled crowd row', () => {
    expect(surgeThreshold(surgeClauses)).toBe(5000)
    expect(surgeThreshold([])).toBeNull()
    expect(surgeThreshold([{ ...surgeClauses[0], enabled: false } as Row<'clauses'>])).toBeNull()
  })
})

describe('runCrowdGrading on the 6 November live check', () => {
  function live(): FakeStore {
    return fakeStore({
      readings: [reading('2026-11-03', actual3, 'pi'), reading('2026-11-04', actual4, 'actions')],
      forecasts: [
        forecast('F-20261104', 'N-20261104', '2026-11-04T01:07:00+08:00', 27044, 19315, 32100, 3928),
        forecast('F-20261105', 'N-20261105', '2026-11-05T07:25:00+08:00', 26997, 19268, 32053, 3881)
      ],
      listings: [listing('L-weeknd-4', '2026-11-04'), listing('L-weeknd-5', '2026-11-05')],
      clauses: surgeClauses,
      baselines: { '2026-11-03': 4000 }
    })
  }

  test('grades 4 November out of band at APE 0.200 and pends 5 November', () => {
    const fake = live()
    const run = runCrowdGrading(ports(fake.store))
    expect(run.error).toBeNull()
    expect(run.final).toEqual(['N-20261103', 'N-20261104'])
    expect(run.pending).toEqual(['N-20261105'])
    expect(run.files).toEqual([
      'grade-20261103-20261106-0020.json',
      'grade-20261104-20261106-0020.json',
      'grade-20261105-20261106-0020.json'
    ])

    const four = fake.appended.find((row) => row.night_id === 'N-20261104')
    expect(four).toMatchObject({ forecast_id: 'F-20261104', actual: 33804, outcome: 'out_of_band', ape: 0.2 })
    const three = fake.appended.find((row) => row.night_id === 'N-20261103')
    expect(three).toMatchObject({ actual: 4944, outcome: 'no_surge', ape: '' })
    const five = fake.appended.find((row) => row.night_id === 'N-20261105')
    expect(five).toMatchObject({ actual: '', outcome: 'pending', ape: '', next_update: '2026-11-07 22:00' })

    const texts = Object.fromEntries(
      fake.files.map((file) => [file.name, (JSON.parse(file.text) as { text: string }).text])
    )
    expect(texts['grade-20261104-20261106-0020.json']).toBe(
      'Out of band: 33,804 exits against 27,044 (band 19,315–32,100), APE 20.0%'
    )
    expect(texts['grade-20261105-20261106-0020.json']).toBe('Pending until 22:00')

    expect(fake.polls).toHaveLength(1)
    expect(fake.polls[0]).toMatchObject({ source_id: 'SP17', outcome: 'ok', new_rows: 3 })
    expect(run.kill.ready).toBe(false)
    expect(run.kill.fired).toBe(false)
  })

  test('a second run appends no grade row and keeps one poll per fetch', () => {
    const fake = live()
    runCrowdGrading(ports(fake.store))
    const second = runCrowdGrading(ports(fake.store))
    expect(second.appended).toBe(0)
    expect(second.files).toEqual([])
    expect(fake.polls).toHaveLength(2)
  })

  test('a failed fetch writes an error poll row and no grade row', () => {
    const fake = live()
    const run = runCrowdGrading({
      ...ports(fake.store),
      fetchMetadata: () => {
        throw new Error('the metadata fetch failed: socket hang up')
      }
    })
    expect(run.error).toBe('fetch failed')
    expect(fake.appended).toHaveLength(0)
    expect(fake.polls).toHaveLength(1)
    expect(fake.polls[0]).toMatchObject({ outcome: 'error' })
  })

  test('an HTTP error writes an error poll row and no grade row', () => {
    const fake = live()
    const run = runCrowdGrading({
      ...ports(fake.store),
      fetchMetadata: () => ({ status: 500, text: 'boom' })
    })
    expect(run.error).toBe('HTTP 500')
    expect(fake.appended).toHaveLength(0)
    expect(fake.polls[0]).toMatchObject({ outcome: 'error', http_status: 500 })
  })

  test('an unlisted night with no baseline is skipped', () => {
    const fake = fakeStore({
      readings: [
        reading('2026-11-03', actual3, 'pi'),
        reading('2026-11-04', actual4, 'pi'),
        reading('2026-11-05', daily['2026-11-05'] ?? -1, 'pi')
      ],
      listings: [],
      clauses: surgeClauses,
      baselines: {}
    })
    const run = runCrowdGrading(ports(fake.store))
    expect(run.appended).toBe(0)
    expect(run.error).toBeNull()
  })
})

describe('checkKillCriterion', () => {
  const final = (night: string, outcome: string, ape: number | ''): Row<'crowd_grades'> => ({
    grade_id: `CG-${night}-x`,
    night_id: night,
    forecast_id: 'F-x',
    actual: 30000,
    outcome,
    ape,
    next_update: '',
    graded_at: '2026-11-06T00:20:00+08:00'
  })
  test('needs both Weeknd nights final', () => {
    expect(checkKillCriterion([final('N-20261104', 'out_of_band', 0.5)]).ready).toBe(false)
  })
  test('fires only when both are outside the band above 40%', () => {
    expect(
      checkKillCriterion([final('N-20261104', 'out_of_band', 0.5), final('N-20261105', 'out_of_band', 0.5)])
    ).toEqual({
      ready: true,
      fired: true,
      apes: { first: 0.5, second: 0.5 }
    })
    expect(
      checkKillCriterion([final('N-20261104', 'out_of_band', 0.2), final('N-20261105', 'out_of_band', 0.5)]).fired
    ).toBe(false)
    expect(
      checkKillCriterion([final('N-20261104', 'in_band', 0.01), final('N-20261105', 'out_of_band', 0.5)]).fired
    ).toBe(false)
  })
})

describe('scoreSurgeFlags', () => {
  test('scores precision and recall with Wilson intervals', () => {
    const scored = scoreSurgeFlags([
      { predicted: true, observed: true },
      { predicted: true, observed: false },
      { predicted: false, observed: true }
    ])
    expect(scored.n).toBe(3)
    expect(scored.precision.x).toBe(1)
    expect(scored.precision.n).toBe(2)
    expect(scored.precision.interval).toEqual(wilsonInterval(1, 2))
    expect(scored.recall).toMatchObject({ x: 1, n: 2 })
    expect(formatScored('precision', { x: 7, n: 8, interval: wilsonInterval(7, 8) })).toBe(
      'precision: 7 of 8 (95% 0.53–0.98)'
    )
    expect(formatScored('recall', { x: 7, n: 21, interval: wilsonInterval(7, 21) })).toBe(
      'recall: 7 of 21 (95% 0.17–0.55)'
    )
    expect(formatScored('precision', { x: 0, n: 0, interval: null })).toBe('precision: n=0')
  })
})
