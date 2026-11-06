// The Crowd D+1 grader (#70): grades every night from 3 November 2026 once D+1
// has begun, from `readings` alone, whichever runner posted them. Pure except
// for the store and fetch ports, so tests use doubles.
import { mytToday, parseMetadata } from '../../pi/ridership.ts'
import { toMytIso } from '../../shared/time.ts'
import { RAPIDRAIL_KIND, SP17_SOURCE_ID } from './pi-rows.ts'
import type { Row } from './schema.ts'

export const METADATA_URL =
  'https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/data-catalogue/ridership_od_rapidrail_daily.json'

// The first night this ticket grades; the file for D lands on D+1.
export const FIRST_NIGHT = '2026-11-03'

// The two Weeknd nights the kill criterion watches (Fanfall kill criteria).
export const WEEKND_FIRST = 'N-20261104'
export const WEEKND_SECOND = 'N-20261105'

export type GradeOutcome = 'in_band' | 'out_of_band' | 'unlisted_surge' | 'no_surge' | 'pending'

// The sheet reads and writes the run needs, built from `SHEET_ID` in gas.ts.
// `baselineFor` is #69's SIG-7 baseline, injected so this ticket builds alone.
export interface CrowdGradeStore {
  readings(): Row<'readings'>[]
  forecasts(): Row<'forecasts'>[]
  listings(): Row<'listings'>[]
  clauses(): Row<'clauses'>[]
  grades(): Row<'crowd_grades'>[]
  appendGrades(rows: Row<'crowd_grades'>[]): void
  appendPoll(row: Row<'polls'>): void
  saveGradeFile(name: string, text: string): string
  baselineFor(nightDate: string): number | null
}

export interface MetadataFetch {
  status: number
  text: string
}

export interface CrowdGradePorts {
  store: CrowdGradeStore
  fetchMetadata: (url: string) => MetadataFetch
  now: () => Date
  newPollId: () => string
}

// Wilson's score interval with z = 1.96 (TRD grading), rounded to two decimals.
// Null with n = 0: the caller prints "n=0" and no interval.
export function wilsonInterval(x: number, n: number): { low: number; high: number } | null {
  if (n === 0) return null
  const z = 1.96
  const z2 = z * z
  const p = x / n
  const denominator = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denominator
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator
  return { low: Math.round((center - half) * 100) / 100, high: Math.round((center + half) * 100) / 100 }
}

// Thousands separators without a locale: 33804 -> "33,804".
export function formatCount(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  return (
    sign +
    Math.abs(rounded)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  )
}

// |actual - forecast| / actual, rounded to three decimals (0.200 for the 4 November replay).
export function apeOf(actual: number, forecast: number): number {
  return Math.round((Math.abs(actual - forecast) / actual) * 1000) / 1000
}

// A forecast night (G19): in band when band_low <= actual <= band_high.
export function gradeAgainstForecast(
  actual: number,
  forecast: number,
  bandLow: number,
  bandHigh: number
): { outcome: 'in_band' | 'out_of_band'; ape: number } {
  const outcome = bandLow <= actual && actual <= bandHigh ? 'in_band' : 'out_of_band'
  return { outcome, ape: apeOf(actual, forecast) }
}

// A night with no listed listing (G20): unlisted_surge when actual - baseline
// reaches the Surge night threshold in `clauses`, otherwise no_surge.
export function gradeAgainstBaseline(
  actual: number,
  baseline: number,
  threshold: number
): 'unlisted_surge' | 'no_surge' {
  return actual - baseline >= threshold ? 'unlisted_surge' : 'no_surge'
}

// A listed night with no forecast before doors (a No call): out_of_band with an
// empty forecast_id and ape when actual - baseline reaches the threshold,
// otherwise no_surge.
export function gradeWithoutForecast(
  actual: number,
  baseline: number,
  threshold: number
): { outcome: 'out_of_band' | 'no_surge' } {
  return {
    outcome: gradeAgainstBaseline(actual, baseline, threshold) === 'unlisted_surge' ? 'out_of_band' : 'no_surge'
  }
}

// '2026-11-04' -> 'N-20261104'.
export function nightId(nightDate: string): string {
  return `N-${nightDate.replace(/-/g, '')}`
}

// grade-{night yyyyMMdd}-{graded yyyyMMdd-HHmm}.json, one per appended row.
export function gradeFileName(nightDate: string, gradedAtMyt: string): string {
  const night = nightDate.replace(/-/g, '')
  const graded = `${gradedAtMyt.slice(0, 4)}${gradedAtMyt.slice(5, 7)}${gradedAtMyt.slice(8, 10)}-${gradedAtMyt.slice(11, 13)}${gradedAtMyt.slice(14, 16)}`
  return `grade-${night}-${graded}.json`
}

// The arrival period starts at doors, else show time, else 16:00 MYT (decision 17 and G9).
export function arrivalStart(nightDate: string, listings: Pick<Row<'listings'>, 'doors_myt' | 'show_myt'>[]): string {
  const HH_MM = /^\d{2}:\d{2}$/
  const times = listings
    .map((listing) => {
      const doors = listing.doors_myt
      const show = listing.show_myt
      if (typeof doors === 'string' && HH_MM.test(doors.trim())) return doors.trim()
      if (typeof show === 'string' && HH_MM.test(show.trim())) return show.trim()
      return null
    })
    .filter((time): time is string => time !== null)
    .sort()
  return `${nightDate}T${times[0] ?? '16:00'}:00+08:00`
}

// The latest forecast row for the night written before the arrival period.
export function forecastBeforeDoors(
  forecasts: Row<'forecasts'>[],
  night: string,
  arrival: string
): Row<'forecasts'> | null {
  const arrivalMs = Date.parse(arrival)
  let best: Row<'forecasts'> | null = null
  let bestMs = -Infinity
  for (const forecast of forecasts) {
    if (forecast.night_id !== night) continue
    const createdMs = typeof forecast.created_at === 'string' ? Date.parse(forecast.created_at) : NaN
    if (!Number.isFinite(createdMs) || !(createdMs < arrivalMs)) continue
    if (createdMs > bestMs) {
      best = forecast
      bestMs = createdMs
    }
  }
  return best
}

// The Surge night threshold from the enabled crowd-pack row (G20).
export function surgeThreshold(clauses: Row<'clauses'>[]): number | null {
  for (const clause of clauses) {
    if (clause.pack !== 'crowd') continue
    const enabled = clause.enabled
    if (enabled !== true && enabled !== 'TRUE' && enabled !== 'true') continue
    if (clause.key !== 'surge_night' && clause.Clause !== 'Surge night') continue
    const threshold = Number(clause.threshold)
    return Number.isFinite(threshold) ? threshold : null
  }
  return null
}

function outcomeLabel(outcome: 'in_band' | 'out_of_band'): string {
  return outcome === 'in_band' ? 'In band' : 'Out of band'
}

// The grade file's text line.
export function finalGradeText(args: {
  outcome: 'in_band' | 'out_of_band' | 'unlisted_surge' | 'no_surge'
  actual: number
  forecast?: number
  bandLow?: number
  bandHigh?: number
  baseline?: number
  ape?: number
}): string {
  const actual = formatCount(args.actual)
  if (args.outcome === 'unlisted_surge' || args.outcome === 'no_surge') {
    const label = args.outcome === 'unlisted_surge' ? 'Unlisted surge' : 'No surge'
    return `${label}: ${actual} exits against a ${formatCount(args.baseline ?? 0)} baseline`
  }
  if (args.forecast === undefined || args.bandLow === undefined || args.bandHigh === undefined) {
    return `${outcomeLabel(args.outcome)}: ${actual} exits against a ${formatCount(args.baseline ?? 0)} baseline with no forecast before doors`
  }
  const percent = args.ape === undefined ? '' : `, APE ${(args.ape * 100).toFixed(1)}%`
  return `${outcomeLabel(args.outcome)}: ${actual} exits against ${formatCount(args.forecast)} (band ${formatCount(args.bandLow)}–${formatCount(args.bandHigh)})${percent}`
}

// The kill criterion (Fanfall kill criteria): both Weeknd nights final, outside
// the band, with errors above 40%. It already cannot fire: 4 November is 0.200.
export interface KillCheck {
  ready: boolean
  fired: boolean
  apes: { first: number | ''; second: number | '' }
}

export function checkKillCriterion(grades: Row<'crowd_grades'>[]): KillCheck {
  const final = (night: string): Row<'crowd_grades'> | undefined =>
    grades.find((grade) => grade.night_id === night && grade.outcome !== 'pending')
  const first = final(WEEKND_FIRST)
  const second = final(WEEKND_SECOND)
  const apes = {
    first: (first?.ape ?? '') as number | '',
    second: (second?.ape ?? '') as number | ''
  }
  if (!first || !second) return { ready: false, fired: false, apes }
  const outside = (grade: Row<'crowd_grades'>): boolean => {
    if (grade.outcome !== 'out_of_band') return false
    const ape = typeof grade.ape === 'number' ? grade.ape : Number.NaN
    return ape > 0.4
  }
  return { ready: true, fired: outside(first) && outside(second), apes }
}

// The surge-flag precision and recall replay (TRD grading): a predicted surge is
// a listed night whose backtest uplift is >= 5,000, an observed surge is
// actual - baseline >= 5,000.
export interface SurgeDay {
  predicted: boolean
  observed: boolean
}

export interface ScoredRate {
  x: number
  n: number
  interval: { low: number; high: number } | null
}

export function scoreSurgeFlags(days: SurgeDay[]): { n: number; precision: ScoredRate; recall: ScoredRate } {
  const both = days.filter((day) => day.predicted && day.observed).length
  const predicted = days.filter((day) => day.predicted).length
  const observed = days.filter((day) => day.observed).length
  return {
    n: days.length,
    precision: { x: both, n: predicted, interval: wilsonInterval(both, predicted) },
    recall: { x: both, n: observed, interval: wilsonInterval(both, observed) }
  }
}

// Every figure prints its n, and with n = 0 it prints "n=0" and no interval.
export function formatScored(name: string, rate: ScoredRate): string {
  if (rate.n === 0) return `${name}: n=0`
  const interval = rate.interval ? ` (95% ${rate.interval.low.toFixed(2)}–${rate.interval.high.toFixed(2)})` : ''
  return `${name}: ${rate.x} of ${rate.n}${interval}`
}

export interface GradeRun {
  appended: number
  files: string[]
  pending: string[]
  final: string[]
  kill: KillCheck
  error: string | null
}

function yesterdayOf(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

function errorPoll(
  ports: CrowdGradePorts,
  startedAt: string,
  receivedAt: string,
  latencyMs: number,
  status: number,
  error: string
): void {
  ports.store.appendPoll({
    poll_id: ports.newPollId(),
    source_kind: RAPIDRAIL_KIND,
    source_id: SP17_SOURCE_ID,
    started_at: startedAt,
    received_at: receivedAt,
    http_status: status,
    latency_ms: latencyMs,
    outcome: 'error',
    new_rows: 0,
    error,
    raw_file_id: ''
  })
}

// Grades every gradeable night; a failed metadata fetch writes an error `polls`
// row and no grade row. At most one pending row per night per distinct
// `next_update`, and a final row is never rewritten.
export function runCrowdGrading(ports: CrowdGradePorts): GradeRun {
  const { store } = ports
  const started = ports.now()
  const startedAt = toMytIso(started)
  let fetched: MetadataFetch
  try {
    fetched = ports.fetchMetadata(METADATA_URL)
  } catch (error) {
    const receivedAt = toMytIso(ports.now())
    errorPoll(ports, startedAt, receivedAt, 0, 0, error instanceof Error ? error.message : String(error))
    return {
      appended: 0,
      files: [],
      pending: [],
      final: [],
      kill: checkKillCriterion(store.grades()),
      error: 'fetch failed'
    }
  }
  const received = ports.now()
  const receivedAt = toMytIso(received)
  const latencyMs = Math.max(0, received.getTime() - started.getTime())
  if (fetched.status !== 200) {
    errorPoll(ports, startedAt, receivedAt, latencyMs, fetched.status, `the metadata returned HTTP ${fetched.status}`)
    return {
      appended: 0,
      files: [],
      pending: [],
      final: [],
      kill: checkKillCriterion(store.grades()),
      error: `HTTP ${fetched.status}`
    }
  }
  const parsed = parseMetadata(fetched.text)
  if ('problem' in parsed) {
    errorPoll(ports, startedAt, receivedAt, latencyMs, fetched.status, parsed.problem)
    return {
      appended: 0,
      files: [],
      pending: [],
      final: [],
      kill: checkKillCriterion(store.grades()),
      error: parsed.problem
    }
  }
  const { nextUpdate } = parsed.stamps

  const today = mytToday(started.getTime())
  const last = yesterdayOf(today)
  const readings = store.readings()
  const forecasts = store.forecasts()
  const listings = store.listings()
  const clauses = store.clauses()
  const existing = store.grades()
  const threshold = surgeThreshold(clauses)

  const rows: Row<'crowd_grades'>[] = []
  const files: string[] = []
  const pending: string[] = []
  const final: string[] = []

  for (
    let day = FIRST_NIGHT;
    day <= last;
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  ) {
    const night = nightId(day)
    const nightGrades = existing.filter((grade) => grade.night_id === night)
    const nightReadings = readings.filter(
      (reading) =>
        reading.source_id === SP17_SOURCE_ID &&
        reading.metric === 'sp17_exits' &&
        String(reading.observed_at).slice(0, 10) === day
    )
    nightReadings.sort((a, b) => Number(b.revision ?? 0) - Number(a.revision ?? 0))
    const reading = nightReadings[0]
    const listed = listings.filter((listing) => listing.night_date === day && listing.state === 'listed')
    const listingIds = listed.map((listing) => String(listing.listing_id))

    if (!reading) {
      if (nightGrades.some((grade) => grade.outcome === 'pending' && grade.next_update === nextUpdate)) continue
      const row: Row<'crowd_grades'> = {
        grade_id: `CG-${night}-${receivedAt.slice(0, 4)}${receivedAt.slice(5, 7)}${receivedAt.slice(8, 10)}-${receivedAt.slice(11, 13)}${receivedAt.slice(14, 16)}`,
        night_id: night,
        forecast_id: '',
        actual: '',
        outcome: 'pending',
        ape: '',
        next_update: nextUpdate,
        graded_at: receivedAt
      }
      const text = `Pending until ${nextUpdate.slice(11, 16)}`
      rows.push(row)
      files.push(gradeFileName(day, receivedAt))
      store.saveGradeFile(files[files.length - 1] as string, JSON.stringify({ row, forecast: null, listingIds, text }))
      pending.push(night)
      continue
    }

    if (nightGrades.some((grade) => grade.outcome !== 'pending')) continue
    const actual = Number(reading.value)
    if (!Number.isFinite(actual) || actual <= 0) continue

    let forecastId = ''
    let outcome: GradeOutcome = 'no_surge'
    let ape: number | '' = ''
    let forecast: Row<'forecasts'> | null = null
    let baseline: number | null = null
    let bandLow = 0
    let bandHigh = 0

    if (listed.length > 0) {
      forecast = forecastBeforeDoors(forecasts, night, arrivalStart(day, listed))
      if (forecast) {
        const band = Number(forecast.band_low)
        const high = Number(forecast.band_high)
        const base = Number(forecast.baseline)
        const point = Number(forecast.forecast)
        if (![band, high, base, point].every(Number.isFinite)) continue
        const graded = gradeAgainstForecast(actual, point, band, high)
        outcome = graded.outcome
        ape = graded.ape
        forecastId = String(forecast.forecast_id)
        baseline = base
        bandLow = band
        bandHigh = high
      }
    }
    if (!forecast) {
      if (listed.length === 0) {
        if (threshold === null) continue
        baseline = store.baselineFor(day)
        if (baseline === null) continue
        outcome = gradeAgainstBaseline(actual, baseline, threshold)
      } else {
        if (threshold === null) continue
        baseline = store.baselineFor(day)
        if (baseline === null) continue
        outcome = gradeWithoutForecast(actual, baseline, threshold).outcome
      }
    }

    const row: Row<'crowd_grades'> = {
      grade_id: `CG-${night}-${receivedAt.slice(0, 4)}${receivedAt.slice(5, 7)}${receivedAt.slice(8, 10)}-${receivedAt.slice(11, 13)}${receivedAt.slice(14, 16)}`,
      night_id: night,
      forecast_id: forecastId,
      actual,
      outcome,
      ape,
      next_update: '',
      graded_at: receivedAt
    }
    const text =
      forecast && baseline !== null
        ? finalGradeText({
            outcome: outcome as 'in_band' | 'out_of_band',
            actual,
            forecast: Number(forecast.forecast),
            bandLow,
            bandHigh,
            ape: ape === '' ? undefined : ape
          })
        : finalGradeText({ outcome: outcome as 'unlisted_surge' | 'no_surge', actual, baseline: baseline ?? 0 })
    rows.push(row)
    files.push(gradeFileName(day, receivedAt))
    store.saveGradeFile(files[files.length - 1] as string, JSON.stringify({ row, forecast, listingIds, text }))
    final.push(night)
  }

  if (rows.length > 0) store.appendGrades(rows)
  store.appendPoll({
    poll_id: ports.newPollId(),
    source_kind: RAPIDRAIL_KIND,
    source_id: SP17_SOURCE_ID,
    started_at: startedAt,
    received_at: receivedAt,
    http_status: fetched.status,
    latency_ms: latencyMs,
    outcome: 'ok',
    new_rows: rows.length,
    error: '',
    raw_file_id: ''
  })
  return { appended: rows.length, files, pending, final, kill: checkKillCriterion([...existing, ...rows]), error: null }
}
