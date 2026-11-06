// The Crowd forecast engine (#69): baseline, uplift, forecast, band and verdict per night.
// Pure functions only. The hourly tick in crowd-tick.ts reads the sheets and calls these;
// Apps Script and Drive stay in gas.ts, tests use fakes and the committed SP17 fixture.
import { toMytIso } from '../../shared/time.ts'

// The classes a history row can settle to, from the #47 spec "Workbook" table.
export const HISTORY_CLASSES = ['stadium_concert', 'stadium_football', 'arena_show', 'other'] as const
export type HistoryClass = (typeof HISTORY_CLASSES)[number]

// Surge night fires at this many exits above baseline (PRD Crowd clauses, CLS-2).
export const SURGE_THRESHOLD = 5000

// The labelled replay window the relerr band is computed over (#69 "Backtest").
export const BACKTEST_FROM = '2025-01-01'
export const BACKTEST_TO = '2026-11-02'

// One night's exits, keyed by `YYYY-MM-DD`.
export type DailyExits = Record<string, number>

// A history row as the engine sees it: labels decide whether the class counts.
export interface HistoryLabel {
  date: string
  cls: string
  labelA: string
  labelB: string
}

// A listed listing as the engine sees it. Times are the raw cells (`HH:mm` or ISO
// with an offset); singleSource covers both the TRUE boolean and the "TRUE" string.
export interface NightListing {
  listing_id: string
  venue: string
  show: string
  doors: string
  showTime: string
  showEnd: string
  singleSource: boolean
}

export type NightVerdict = 'surge_night' | 'normal' | 'no_call'

// Median of any length; null when empty.
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const lo = sorted[mid - 1] ?? null
  const hi = sorted[mid] ?? null
  if (lo === null || hi === null) return null
  return (lo + hi) / 2
}

// A percentile of an ascending-sorted sample by linear interpolation (#69 "Band").
export function quantileLinear(sortedAsc: readonly number[], q: number): number | null {
  if (sortedAsc.length === 0) return null
  const first = sortedAsc[0]
  const last = sortedAsc[sortedAsc.length - 1]
  if (first === undefined || last === undefined) return null
  if (sortedAsc.length === 1) return first
  const pos = (sortedAsc.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const loVal = sortedAsc[lo] ?? first
  const hiVal = sortedAsc[hi] ?? last
  return loVal + (hiVal - loVal) * (pos - lo)
}

// Round halves up: 3,880.5 becomes 3,881 (#69 "Baseline"). Exits are non-negative.
export function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5)
}

// Weekday of a `YYYY-MM-DD` date in UTC, 0 for Sunday. Date-only strings parse as
// UTC midnight, so no time zone can shift the day.
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

function minusDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10)
}

// The 8 most recent same-weekday nights strictly before D, ascending (#69 G5).
export function sameWeekdayNights(daily: DailyExits, dateD: string): string[] {
  const target = weekdayOf(dateD)
  return Object.keys(daily)
    .filter((date) => date < dateD && weekdayOf(date) === target)
    .sort()
    .slice(-8)
}

// Plain median of SP17 exits on those nights, rounded half up; null with fewer than 8.
export function baselineFor(daily: DailyExits, dateD: string): number | null {
  const nights = sameWeekdayNights(daily, dateD)
  if (nights.length < 8) return null
  const exits = nights.map((night) => daily[night]).filter((value) => typeof value === 'number')
  if (exits.length < 8) return null
  const middle = median(exits)
  return middle === null ? null : roundHalfUp(middle)
}

// The settled class of a history row: set only when both labels agree non-empty (#69 "History").
export function agreedClass(row: HistoryLabel): HistoryClass | null {
  const label = row.labelA.trim()
  if (!label || label !== row.labelB.trim()) return null
  return (HISTORY_CLASSES as readonly string[]).includes(label) ? (label as HistoryClass) : null
}

// Median of (actual minus baseline) over the class's agreeing history nights in the
// 730 days before D (#69 G6). `other` never has an uplift.
export function upliftSamples(
  daily: DailyExits,
  history: readonly HistoryLabel[],
  dateD: string,
  cls: HistoryClass
): number[] {
  if (cls === 'other') return []
  const earliest = minusDays(dateD, 730)
  const samples: number[] = []
  for (const row of history) {
    if (agreedClass(row) !== cls) continue
    if (row.date < earliest || row.date >= dateD) continue
    const actual = daily[row.date]
    if (typeof actual !== 'number') continue
    const baseline = baselineFor(daily, row.date)
    if (baseline === null) continue
    samples.push(actual - baseline)
  }
  return samples
}

export interface ClassUplift {
  cls: HistoryClass
  uplift: number | null
  samples: number[]
}

function upliftOfSamples(samples: number[]): number | null {
  const middle = median(samples)
  return middle === null ? null : roundHalfUp(middle)
}

export interface NightForecast {
  baseline: number | null
  classUplifts: ClassUplift[]
  uplift: number | null
  forecast: number | null
  bandLow: number | null
  bandHigh: number | null
  bandMethod: 'uplift_p10_p90' | 'relerr_p10_p90_v1'
}

export interface RelErrBand {
  p10: number
  p90: number
}

// One night's forecast: one baseline plus the sum of the distinct class uplifts
// (#69 G8). Band is baseline plus the uplift p10/p90, or forecast times one plus
// the relerr p10/p90 once the backtest has run on labelled history (#69 G7).
export function forecastNight(
  daily: DailyExits,
  history: readonly HistoryLabel[],
  classes: readonly HistoryClass[],
  dateD: string,
  relErr: RelErrBand | null
): NightForecast {
  const baseline = baselineFor(daily, dateD)
  const distinct = [...new Set(classes)].filter((cls) => cls !== 'other')
  const classUplifts: ClassUplift[] = distinct.map((cls) => {
    const samples = upliftSamples(daily, history, dateD, cls)
    return { cls, uplift: upliftOfSamples(samples), samples }
  })
  const uplifts = classUplifts.map((entry) => entry.uplift)
  const uplift =
    uplifts.length === 0 || uplifts.some((value) => value === null)
      ? null
      : roundHalfUp(uplifts.reduce<number>((sum, value) => sum + (value ?? 0), 0))
  const forecast = baseline !== null && uplift !== null ? baseline + uplift : null
  if (baseline === null || forecast === null || uplift === null) {
    return { baseline, classUplifts, uplift, forecast, bandLow: null, bandHigh: null, bandMethod: 'uplift_p10_p90' }
  }
  if (relErr !== null) {
    return {
      baseline,
      classUplifts,
      uplift,
      forecast,
      bandLow: roundHalfUp(forecast * (1 + relErr.p10)),
      bandHigh: roundHalfUp(forecast * (1 + relErr.p90)),
      bandMethod: 'relerr_p10_p90_v1'
    }
  }
  const samples = classUplifts.flatMap((entry) => entry.samples).sort((a, b) => a - b)
  if (samples.length === 0) {
    return { baseline, classUplifts, uplift, forecast, bandLow: null, bandHigh: null, bandMethod: 'uplift_p10_p90' }
  }
  const p10 = quantileLinear(samples, 0.1) ?? 0
  const p90 = quantileLinear(samples, 0.9) ?? 0
  return {
    baseline,
    classUplifts,
    uplift,
    forecast,
    bandLow: roundHalfUp(baseline + p10),
    bandHigh: roundHalfUp(baseline + p90),
    bandMethod: 'uplift_p10_p90'
  }
}

// Surge night at or above threshold, normal below, otherwise No call with the blocked input.
export function verdictFor(
  uplift: number | null,
  blocked: readonly string[],
  threshold = SURGE_THRESHOLD
): NightVerdict {
  if (blocked.length > 0 || uplift === null) return 'no_call'
  return uplift >= threshold ? 'surge_night' : 'normal'
}

// The #47 night ID for a date.
export function nightIdOf(date: string): string {
  return `N-${date.replaceAll('-', '')}`
}

// A listing time cell to MYT ISO: `HH:mm` on the night's date, or an ISO stamp as written.
export function isoFromDateAndClock(date: string, raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (clock) return `${date}T${clock[1]}:${clock[2]}:${clock[3] ?? '00'}+08:00`
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return toMytIso(new Date(ms))
}

export function plusMinutesIso(iso: string, minutes: number): string {
  return toMytIso(new Date(Date.parse(iso) + minutes * 60_000))
}

// Arrival: doors, else show time, else 16:00 MYT on the night (#69 G9, earliest listing wins).
export function arrivalFromIso(listings: readonly NightListing[], date: string): string {
  const doors = listings
    .map((listing) => isoFromDateAndClock(date, listing.doors))
    .filter((iso): iso is string => iso !== null)
    .sort()
  if (doors.length > 0) return doors[0] as string
  const shows = listings
    .map((listing) => isoFromDateAndClock(date, listing.showTime))
    .filter((iso): iso is string => iso !== null)
    .sort()
  if (shows.length > 0) return shows[0] as string
  return `${date}T16:00:00+08:00`
}

// Exit: the latest show end plus 90 minutes, null when no listing names a show end.
export function exitToIso(listings: readonly NightListing[], date: string): string | null {
  const ends = listings
    .map((listing) => {
      const iso = isoFromDateAndClock(date, listing.showEnd)
      return iso === null ? null : plusMinutesIso(iso, 90)
    })
    .filter((iso): iso is string => iso !== null)
    .sort()
  return ends.length > 0 ? (ends[ends.length - 1] as string) : null
}

export interface NightTimes {
  nightId: string
  venue: string
  show: string
  doors: string
  showTime: string
  showEnd: string
  listingIds: string[]
  arrivalFrom: string
  exitTo: string | null
}

// One night from its listings in listing_ids order: venues and shows joined with
// " and " (each venue once), earliest doors and show time, latest show end.
export function assembleNight(listings: readonly NightListing[], date: string): NightTimes {
  const venues: string[] = []
  for (const listing of listings) {
    if (listing.venue && !venues.includes(listing.venue)) venues.push(listing.venue)
  }
  const shows = listings.map((listing) => listing.show).filter((show) => show)
  const pick = (values: string[], first: boolean): string => {
    const nonBlank = values.map((value) => value.trim()).filter((value) => value)
    if (nonBlank.length === 0) return ''
    nonBlank.sort()
    return (first ? nonBlank[0] : nonBlank[nonBlank.length - 1]) ?? ''
  }
  return {
    nightId: nightIdOf(date),
    venue: venues.join(' and '),
    show: shows.join(' and '),
    doors: pick(
      listings.map((listing) => listing.doors),
      true
    ),
    showTime: pick(
      listings.map((listing) => listing.showTime),
      true
    ),
    showEnd: pick(
      listings.map((listing) => listing.showEnd),
      false
    ),
    listingIds: listings.map((listing) => listing.listing_id),
    arrivalFrom: arrivalFromIso(listings, date),
    exitTo: exitToIso(listings, date)
  }
}

// A backtest night: the labelled replay of one listed night, forecast only from earlier data.
export interface BacktestNight {
  night: string
  baseline: number | null
  uplift: number | null
  forecast: number | null
  actual: number | null
  relErr: number | null
  bandLow: number | null
  bandHigh: number | null
  inBand: boolean
}

// Every listed night in [from, to] with at least one agreeing non-`other` class and
// an actual, each forecast only from earlier data (#69 "Backtest").
export function runBacktest(
  daily: DailyExits,
  history: readonly HistoryLabel[],
  from = BACKTEST_FROM,
  to = BACKTEST_TO
): BacktestNight[] {
  const byNight = new Map<string, HistoryClass[]>()
  for (const row of history) {
    if (row.date < from || row.date > to) continue
    const cls = agreedClass(row)
    if (cls === null || cls === 'other') continue
    const classes = byNight.get(row.date) ?? []
    if (!classes.includes(cls)) classes.push(cls)
    byNight.set(row.date, classes)
  }
  const nights: BacktestNight[] = []
  for (const [night, classes] of [...byNight].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const computed = forecastNight(daily, history, classes, night, null)
    const actual = daily[night] ?? null
    const relErr = actual !== null && computed.forecast ? (actual - computed.forecast) / computed.forecast : null
    nights.push({
      night,
      baseline: computed.baseline,
      uplift: computed.uplift,
      forecast: computed.forecast,
      actual,
      relErr,
      bandLow: computed.bandLow,
      bandHigh: computed.bandHigh,
      inBand:
        actual !== null &&
        computed.bandLow !== null &&
        computed.bandHigh !== null &&
        actual >= computed.bandLow &&
        actual <= computed.bandHigh
    })
  }
  return nights.filter((night) => night.actual !== null && night.forecast !== null)
}

export interface BacktestSummary {
  n: number
  medianAe: number | null
  meanAe: number | null
  inBand: number
  relP10: number | null
  relP90: number | null
}

// n, median and mean absolute error, the in-band count, and the relerr band percentiles.
export function summarizeBacktest(nights: readonly BacktestNight[]): BacktestSummary {
  const errors = nights
    .map((night) => (night.relErr === null ? null : Math.abs(night.relErr)))
    .filter((error): error is number => error !== null)
  const relErrs = nights
    .map((night) => night.relErr)
    .filter((error): error is number => error !== null)
    .sort((a, b) => a - b)
  const middle = median(errors)
  return {
    n: nights.length,
    medianAe: middle,
    meanAe: errors.length === 0 ? null : errors.reduce((sum, error) => sum + error, 0) / errors.length,
    inBand: nights.filter((night) => night.inBand).length,
    relP10: quantileLinear(relErrs, 0.1),
    relP90: quantileLinear(relErrs, 0.9)
  }
}
