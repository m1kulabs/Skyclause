// Spec §1 `packages/clauses`; TRD 'Clause shape and the indicator registry'.
export const PACKS = ['sky', 'crowd'] as const
export type Pack = (typeof PACKS)[number]
export type Instant = string
export type LocalDate = string
export const INPUT_STATES = ['fresh', 'stale', 'error', 'recovered', 'pending', 'probation', 'off_hours'] as const
export type InputState = (typeof INPUT_STATES)[number]
export const SKY_MODES = ['normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended'] as const
export type SkyMode = (typeof SKY_MODES)[number]
export const CROWD_MODES = ['normal', 'surge_night'] as const
export type CrowdMode = (typeof CROWD_MODES)[number]
export const RECOMMENDATIONS = [
  'keep_with_advisory',
  'shift_start',
  'shift_end',
  'ask_shuttle',
  'leave_before_doors'
] as const
export type Recommendation = (typeof RECOMMENDATIONS)[number]
export const SOURCE_KINDS = [
  'jps_rain',
  'met_warning',
  'met_forecast',
  'apims',
  'rapidrail_od',
  'gtfs_static',
  'gtfs_rt',
  'golive',
  'wikipedia',
  'camera',
  'pi'
] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
/** Current evaluator capabilities; cross-pack dependencies require an explicit supported provider contract. */
export const PACK_SOURCE_KINDS: Record<Pack, readonly SourceKind[]> = {
  sky: ['jps_rain', 'apims', 'met_warning', 'met_forecast', 'camera'],
  crowd: ['rapidrail_od', 'gtfs_static', 'gtfs_rt', 'golive', 'wikipedia', 'pi']
}

export const INDICATOR_NAMES = [
  'site.rain_60m_mm',
  'w.rain_max_60m_mm',
  'w.rain_max_4h_mm',
  'site.api_max',
  'site.api_0600_min_last3_max',
  'site.met_warning_in_force',
  'w.met_warning_in_force',
  'site.met_afternoon_thunderstorm',
  'site.camera_far_low_frames',
  'site.night.baseline',
  'site.night.uplift',
  'site.night.forecast',
  'site.night.band_low',
  'site.night.band_high',
  'site.night.doors',
  'site.night.show',
  'site.night.arrival_start',
  'site.night.arrival_end',
  'site.night.exit_start',
  'site.night.exit_end',
  'site.night.single_source'
] as const
export const WINDOW_FIELDS = [
  'w.start',
  'w.end',
  'w.start_local_min',
  'w.end_local_min',
  'w.kind',
  'w.duration'
] as const
export const REGISTRY_NAMES = [...INDICATOR_NAMES, ...WINDOW_FIELDS] as const
export type RegistryName = (typeof REGISTRY_NAMES)[number]
export const WORDING_FIELDS = ['value', 'unit', 'age', 'station', 'observed_at'] as const
export type WordingPlaceholder = `{${RegistryName}.${(typeof WORDING_FIELDS)[number]}}`

export type SpanRef = string
export type Clause = {
  key: string
  name: string
  enabled: boolean
  builtin?: 'silent_input' | undefined
  scope: 'site' | 'window' | 'night'
  requires: string[]
  optional?: string[] | undefined
  span?: { from: SpanRef; to: SpanRef } | undefined
  when: string
  expiry?: 'start' | 'end' | undefined
  proposes: {
    mode?: SkyMode | CrowdMode | undefined
    watch?: true | undefined
    recommendations?: Recommendation[] | undefined
    note?: 'flood_note' | 'single_source_flag' | 'calendar_entry' | undefined
  }
  wording: { en?: string | undefined; ms?: string | undefined }
}
export type SheetInput = { pack: Pack; clauses: Clause[] }
export type CheckedSheet = SheetInput & {
  contentHash: string
  registryHash: string
  readonly registryTypes?: Readonly<Record<string, IndicatorDefinition['celType']>>
}
export interface CheckIssue {
  clauseKey: string | null
  message: string
  offset: number
  length: number
}
export interface CheckResult {
  ok: boolean
  publishable: boolean
  issues: CheckIssue[]
  sheet?: CheckedSheet
}

export interface Window {
  id: string
  startsAt: Instant
  endsAt: Instant
  kind: 'class' | 'event' | 'commute_wave'
  tz: string
}
export interface IndicatorDefinition {
  name: string
  celType: 'double' | 'int' | 'bool' | 'timestamp' | 'duration' | 'list'
  unit: string
  scope: 'site' | 'window'
  sourceKind: SourceKind
}
export type IndicatorRegistry = IndicatorDefinition[]
export interface InputStatus {
  name: string
  sourceId: string | null
  state: InputState
  since: Instant
}
export interface IndicatorValue {
  name: string
  value: number | boolean | string | number[] | null
  unit: string
  state: InputState
  since: Instant | null
  ageS: number | null
  sourceIds: string[]
  readingIds: string[]
  observedAt: Instant | null
}

// Spec §1 NightInput; #127 keeps unknown exits and unavailable forecasts null.
export type ForecastNoCallReason = 'insufficient_baseline' | 'unclassed_show' | 'no_class_history' | 'stale_exits'
export interface NightInput {
  id: string
  date: LocalDate
  baseline: number | null
  uplift: number | null
  forecast: number | null
  band: { low: number; high: number } | null
  doors: Instant | null
  show: Instant | null
  arrivalStart: Instant
  arrivalEnd: Instant | null
  exitStart: Instant | null
  exitEnd: Instant | null
  singleSource: boolean
  forecastId: string | null
  state: InputState | ForecastNoCallReason
}
export interface WarningObservation {
  sourceId: string
  observedAt: Instant
  receivedAt: Instant
  validFrom: Instant
  validTo: Instant | null
}

export interface IndicatorSnapshot {
  projectId: string
  pack: Pack
  tEval: Instant
  inputs: InputStatus[]
  site: Record<string, IndicatorValue>
  series: Record<string, Array<[Instant, number | null, string]>>
  nights: NightInput[]
  warningObservations?: Record<string, WarningObservation>
  registryHash: string
  hash: string
}
export interface BlockedInput {
  name: string
  sourceId: string | null
  state: InputState
  since: Instant
}
export interface ClauseResult {
  key: string
  result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
  blockedBy: BlockedInput[]
  span?: { from: Instant; to: Instant; complete: boolean }
  inputs: IndicatorValue[]
}
export type ClauseExplanation = ClauseResult & { cel: string; wording: { en?: string; ms?: string } }
export interface Verdict {
  scope: { kind: 'site' | 'window' | 'night'; id: string | null }
  pack: Pack
  mode: SkyMode | CrowdMode | null
  watch: boolean
  noCall: { inputs: BlockedInput[] } | null
  recommendations: Recommendation[]
  clauses: ClauseResult[]
  openFrom: Instant | null
}
export interface Verdicts {
  tEval: Instant
  pack: Pack
  contentHash: string
  snapshotHash: string
  site: Verdict[]
  windows: Verdict[]
  nights: Verdict[]
  hash: string
}

// Spec §1 ReadingHistory; #131's snapshotAt freezes reads at tEval.
export interface ReadingHistory {
  sources: Array<{
    id: string
    kind: SourceKind
    cadenceS: number
    staleAfterS: number
    freshness: 'observed' | 'polled'
    probation: boolean
    meta: Record<string, unknown>
  }>
  polls: Array<{
    id: string
    sourceId: string
    startedAt: Instant
    receivedAt?: Instant
    outcome: 'ok' | 'unchanged' | 'error'
    httpStatus: number | null
  }>
  readings: Array<{
    id: string
    pollId?: string | null
    sourceId: string
    metric: string
    observedAt: Instant
    receivedAt: Instant
    value: IndicatorValue['value']
    valueText: string | null
    valueJson: Record<string, unknown> | null
    itemKey: string
    revision: number
    unit?: string | null
    deviceTime?: Instant | null
  }>
}
export interface ReplayRange {
  from: Instant
  to: Instant
  step: 'reading' | `PT${number}M`
}
export interface ReplayResult {
  label: 'replay'
  steps: Array<{ tEval: Instant; verdicts: Verdicts }>
  summary: Record<string, number>
}
export type SheetDiff = Array<{ key: string; before: Clause | null; after: Clause | null }>

// Spec §1 signatures only; #131 and #136 own the implementations.
export type SnapshotAt = (
  h: ReadingHistory,
  r: IndicatorRegistry,
  projectId: string,
  pack: Pack,
  tEval: Instant
) => IndicatorSnapshot
export type Check = (sheet: SheetInput, r: IndicatorRegistry) => CheckResult
export type Evaluate = (sheet: CheckedSheet, snapshot: IndicatorSnapshot, windows: Window[], tEval: Instant) => Verdicts
export type Explain = (v: Verdicts) => ClauseExplanation[]
export type Replay = (
  sheet: CheckedSheet,
  h: ReadingHistory,
  r: IndicatorRegistry,
  windows: Window[],
  range: ReplayRange
) => ReplayResult
export type CanonicalHash = (value: unknown) => string
export type Diff = (before: SheetInput, after: SheetInput) => SheetDiff
export type DeriveInputState = (h: ReadingHistory, sourceId: string, tEval: Instant) => InputState
