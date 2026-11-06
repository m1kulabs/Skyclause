import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  agreedClass,
  arrivalFromIso,
  assembleNight,
  baselineFor,
  exitToIso,
  forecastNight,
  isoFromDateAndClock,
  median,
  nightIdOf,
  quantileLinear,
  roundHalfUp,
  runBacktest,
  sameWeekdayNights,
  summarizeBacktest,
  upliftSamples,
  verdictFor,
  type DailyExits,
  type HistoryLabel,
  type NightListing
} from './crowd.ts'

const daily = JSON.parse(
  readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'rapidrail-sp17-daily.json'), 'utf8')
) as DailyExits

function label(date: string, cls: string): HistoryLabel {
  return { date, cls, labelA: cls, labelB: cls }
}

function listing(overrides: Partial<NightListing> = {}): NightListing {
  return {
    listing_id: 'L-20261104-stadium-the-weeknd',
    venue: 'stadium',
    show: 'The Weeknd',
    doors: '18:00',
    showTime: '20:30',
    showEnd: '22:30',
    singleSource: false,
    ...overrides
  }
}

describe('median and quantiles', () => {
  test('median of odd, even and empty samples', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })

  test('quantiles interpolate linearly', () => {
    const sorted = [100, 200, 300, 400]
    // pos = 3 * 0.1 = 0.3, so 100 + 100 * 0.3
    expect(quantileLinear(sorted, 0.1)).toBe(130)
    // pos = 3 * 0.9 = 2.7, so 300 + 100 * 0.7
    expect(quantileLinear(sorted, 0.9)).toBe(370)
    expect(quantileLinear([5], 0.9)).toBe(5)
    expect(quantileLinear([], 0.5)).toBeNull()
  })

  test('rounds halves up', () => {
    expect(roundHalfUp(3880.5)).toBe(3881)
    expect(roundHalfUp(3928)).toBe(3928)
  })
})

describe('baseline (SIG-7 replay)', () => {
  test('uses the 8 most recent same-weekday nights', () => {
    const nights = sameWeekdayNights(daily, '2026-11-04')
    expect(nights).toEqual([
      '2026-09-09',
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
      '2026-10-28'
    ])
  })

  test('the Wednesday baseline for 4 November 2026 is 3,928', () => {
    expect(baselineFor(daily, '2026-11-04')).toBe(3928)
  })

  test('5 November is 3,880.5, rounded half up to 3,881', () => {
    expect(baselineFor(daily, '2026-11-05')).toBe(3881)
  })

  test('no call with fewer than 8 such nights', () => {
    expect(baselineFor(daily, '2023-01-04')).toBeNull()
  })
})

describe('uplift', () => {
  test('only rows whose two labels agree count', () => {
    const history: HistoryLabel[] = [
      { date: '2026-09-30', cls: 'stadium_concert', labelA: 'stadium_concert', labelB: 'stadium_concert' },
      { date: '2026-10-07', cls: 'stadium_concert', labelA: 'stadium_concert', labelB: 'arena_show' },
      { date: '2026-10-14', cls: 'stadium_concert', labelA: '', labelB: '' }
    ]
    const samples = upliftSamples(daily, history, '2026-11-04', 'stadium_concert')
    expect(samples).toHaveLength(1)
    expect(samples[0]).toBe(daily['2026-09-30']! - baselineFor(daily, '2026-09-30')!)
  })

  test('other gives no uplift', () => {
    const computed = forecastNight(daily, [label('2026-09-30', 'other')], ['other'], '2026-11-04', null)
    expect(computed.uplift).toBeNull()
    expect(computed.forecast).toBeNull()
    expect(verdictFor(computed.uplift, [], 5000)).toBe('no_call')
  })

  test('a class with no history gives no uplift', () => {
    const computed = forecastNight(daily, [], ['arena_show'], '2026-11-04', null)
    expect(computed.uplift).toBeNull()
    expect(computed.forecast).toBeNull()
  })

  test('a shared night counts one baseline plus each class uplift', () => {
    const history: HistoryLabel[] = [label('2026-09-30', 'stadium_concert'), label('2026-10-01', 'arena_show')]
    const computed = forecastNight(daily, history, ['stadium_concert', 'arena_show'], '2026-11-04', null)
    const baseline = baselineFor(daily, '2026-11-04')
    const stadium = upliftSamples(daily, history, '2026-11-04', 'stadium_concert')
    const arena = upliftSamples(daily, history, '2026-11-04', 'arena_show')
    expect(stadium).toHaveLength(1)
    expect(arena).toHaveLength(1)
    expect(computed.baseline).toBe(baseline)
    expect(computed.uplift).toBe(roundHalfUp(stadium[0]! + arena[0]!))
    expect(computed.forecast).toBe(baseline! + computed.uplift!)
  })

  test('a repeated class counts once', () => {
    const history: HistoryLabel[] = [label('2026-09-30', 'stadium_concert')]
    const single = forecastNight(daily, history, ['stadium_concert'], '2026-11-04', null)
    const doubled = forecastNight(daily, history, ['stadium_concert', 'stadium_concert'], '2026-11-04', null)
    expect(doubled.uplift).toBe(single.uplift)
    expect(doubled.forecast).toBe(single.forecast)
  })
})

describe('bands match hand arithmetic', () => {
  const history: HistoryLabel[] = [
    label('2026-09-09', 'stadium_concert'),
    label('2026-09-16', 'stadium_concert'),
    label('2026-09-23', 'stadium_concert'),
    label('2026-09-30', 'stadium_concert')
  ]
  const classes = ['stadium_concert'] as const

  test('uplift_p10_p90 is baseline plus the sample p10 and p90', () => {
    const samples = upliftSamples(daily, history, '2026-11-04', 'stadium_concert').sort((a, b) => a - b)
    expect(samples).toHaveLength(4)
    const p10 = quantileLinear(samples, 0.1)!
    const p90 = quantileLinear(samples, 0.9)!
    const computed = forecastNight(daily, history, [...classes], '2026-11-04', null)
    expect(computed.bandMethod).toBe('uplift_p10_p90')
    expect(computed.bandLow).toBe(roundHalfUp(computed.baseline! + p10))
    expect(computed.bandHigh).toBe(roundHalfUp(computed.baseline! + p90))
  })

  test('relerr_p10_p90_v1 is forecast times one plus the relerr p10 and p90', () => {
    const relErr = { p10: -0.04, p90: 0.17 }
    const computed = forecastNight(daily, history, [...classes], '2026-11-04', relErr)
    expect(computed.bandMethod).toBe('relerr_p10_p90_v1')
    expect(computed.bandLow).toBe(roundHalfUp(computed.forecast! * 0.96))
    expect(computed.bandHigh).toBe(roundHalfUp(computed.forecast! * 1.17))
  })
})

describe('verdicts', () => {
  test('surge at or above 5,000, normal below', () => {
    expect(verdictFor(5000, [])).toBe('surge_night')
    expect(verdictFor(23116, [])).toBe('surge_night')
    expect(verdictFor(4999, [])).toBe('normal')
  })

  test('any blocked input is No call', () => {
    expect(verdictFor(23116, ['rapidrail_od'])).toBe('no_call')
    expect(verdictFor(null, [])).toBe('no_call')
  })

  test('agreedClass needs two equal non-empty labels', () => {
    expect(agreedClass(label('2026-09-30', 'arena_show'))).toBe('arena_show')
    expect(agreedClass({ date: '2026-09-30', cls: 'x', labelA: 'arena_show', labelB: 'other' })).toBeNull()
    expect(agreedClass({ date: '2026-09-30', cls: '', labelA: '', labelB: '' })).toBeNull()
  })
})

describe('nights and times', () => {
  test('night IDs follow N-YYYYMMDD', () => {
    expect(nightIdOf('2026-11-04')).toBe('N-20261104')
  })

  test('arrival prefers doors, then show time, then 16:00', () => {
    const base = listing()
    expect(arrivalFromIso([base], '2026-11-04')).toBe('2026-11-04T18:00:00+08:00')
    expect(arrivalFromIso([{ ...base, doors: '' }], '2026-11-04')).toBe('2026-11-04T20:30:00+08:00')
    expect(arrivalFromIso([{ ...base, doors: '', showTime: '' }], '2026-11-04')).toBe('2026-11-04T16:00:00+08:00')
  })

  test('exit is show end plus 90 minutes, latest listing wins', () => {
    // 22:30 + 90 min = midnight, which carries the next date.
    expect(exitToIso([listing()], '2026-11-04')).toBe('2026-11-05T00:00:00+08:00')
    expect(exitToIso([{ ...listing(), showEnd: '' }], '2026-11-04')).toBeNull()
  })

  test('ISO stamps pass through as written', () => {
    expect(isoFromDateAndClock('2026-11-04', '2026-11-05T00:00:00+08:00')).toBe('2026-11-05T00:00:00+08:00')
    expect(isoFromDateAndClock('2026-11-04', 'not a time')).toBeNull()
  })

  test('shared nights join shows and venues with " and "', () => {
    const night = assembleNight(
      [listing(), listing({ listing_id: 'L-20261104-arena-5sos', venue: 'arena', show: '5SOS', doors: '17:00' })],
      '2026-11-04'
    )
    expect(night.nightId).toBe('N-20261104')
    expect(night.venue).toBe('stadium and arena')
    expect(night.show).toBe('The Weeknd and 5SOS')
    expect(night.listingIds).toEqual(['L-20261104-stadium-the-weeknd', 'L-20261104-arena-5sos'])
    expect(night.arrivalFrom).toBe('2026-11-04T17:00:00+08:00')
  })
})

describe('backtest', () => {
  const history: HistoryLabel[] = [
    label('2024-06-05', 'stadium_concert'),
    label('2025-02-05', 'stadium_concert'),
    label('2025-03-05', 'stadium_concert')
  ]

  test('replays listed nights from earlier data only', () => {
    const nights = runBacktest(daily, history, '2025-01-01', '2025-12-31')
    expect(nights.map((night) => night.night)).toEqual(['2025-02-05', '2025-03-05'])
    // The March forecast sees the February night and the 2024 night, but not itself.
    const expected = upliftSamples(daily, history, '2025-03-05', 'stadium_concert')
    expect(expected).toHaveLength(2)
    const march = nights.find((night) => night.night === '2025-03-05')!
    expect(march.uplift).toBe(roundHalfUp((expected[0]! + expected[1]!) / 2))
    expect(march.actual).toBe(daily['2025-03-05']!)
    expect(march.relErr).toBe((march.actual! - march.forecast!) / march.forecast!)
  })

  test('summarizes n, errors and the relerr band inputs', () => {
    const nights = runBacktest(daily, history, '2025-01-01', '2025-12-31')
    const summary = summarizeBacktest(nights)
    expect(summary.n).toBe(2)
    const errors = nights.map((night) => Math.abs(night.relErr!)).sort((a, b) => a - b)
    expect(summary.medianAe).toBe((errors[0]! + errors[1]!) / 2)
    expect(summary.meanAe).toBe((errors[0]! + errors[1]!) / 2)
    expect(summary.inBand).toBe(nights.filter((night) => night.inBand).length)
    const relErrs = nights.map((night) => night.relErr!).sort((a, b) => a - b)
    // Two samples: p10 and p90 interpolate between them.
    expect(summary.relP10).toBe(relErrs[0]! + (relErrs[1]! - relErrs[0]!) * 0.1)
    expect(summary.relP90).toBe(relErrs[0]! + (relErrs[1]! - relErrs[0]!) * 0.9)
  })
})
