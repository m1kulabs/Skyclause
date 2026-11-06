// Spec §1 'Sources and forecast'; PRD SIG-7; #127's pure forecast functions.
type Instant = string
type LocalDate = string
export const NO_CALL_REASONS = ['insufficient_baseline', 'unclassed_show', 'no_class_history', 'stale_exits'] as const
export type NoCallReason = (typeof NO_CALL_REASONS)[number]
export type NoCall = { noCall: NoCallReason }
export type ShowClass = 'stadium_concert' | 'stadium_football' | 'arena_show' | 'other'
export interface DailyExits {
  date: LocalDate
  value: number
  readingId: string
}
export interface ClassHistory {
  date: LocalDate
  class: ShowClass
  actual: number
  baseline: number
  readingIds: string[]
}
export interface ForecastListing {
  id: string
  class: ShowClass
  doors: Instant | null
  show: Instant | null
  showEnd: Instant | null
}
export interface ForecastPeriods {
  arrivalStart: Instant
  arrivalEnd: Instant | null
  exitStart: Instant | null
  exitEnd: Instant | null
}
export interface BaselineResult {
  value: number
  readingIds: string[]
}
export interface UpliftResult extends BaselineResult {
  samples: number[]
}
export interface BacktestNight {
  date: LocalDate
  actual: number
  forecast: number
  band: { low: number; high: number }
}
export interface BacktestResult {
  label: 'replay'
  n: number
  medianAbsoluteError: number | null
  meanAbsoluteError: number | null
  inBand: number
  relativeErrors: number[]
}
export interface NightForecast extends ForecastPeriods {
  baseline: number
  uplift: number
  forecast: number
  band: { low: number; high: number }
  method: 'relerr_p10_p90_v1' | 'uplift_p10_p90'
  readingIds: string[]
}

// Spec §1 names these functions; #127 specifies the inputs' meaning.
export type Baseline = (exits: DailyExits[], date: LocalDate, latestErrorAt: Instant | null) => BaselineResult | NoCall
export type Uplift = (history: ClassHistory[], showClass: ShowClass, date: LocalDate) => UpliftResult | NoCall
export type Periods = (
  listing: Pick<ForecastListing, 'doors' | 'show' | 'showEnd'>,
  date: LocalDate,
  tz: string
) => ForecastPeriods
export type Backtest = (nights: BacktestNight[]) => BacktestResult
export type ForecastNight = (input: {
  date: LocalDate
  tz: string
  listings: ForecastListing[]
  exits: DailyExits[]
  history: ClassHistory[]
  backtest: BacktestResult
  latestErrorAt: Instant | null
}) => NightForecast | NoCall
