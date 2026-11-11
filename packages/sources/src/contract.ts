import { z } from 'zod'

// Spec §1; TRD 'Adapter contract'; metric payloads follow #121–#128.
export const SourceKind = z.enum([
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
])
export type SourceKind = z.infer<typeof SourceKind>
type Instant = string
export type Duration = number // seconds, matching source.cadence_s
type JsonValue = z.infer<ReturnType<typeof z.json>>
export type ApiFamily = 'datagovmy-weather' | 'datagovmy-gtfs-rt' | 'datagovmy-gtfs-static'
export interface Licence {
  id: string | null
  label: string
}
export interface Source {
  id: string
  kind: SourceKind
  externalId: string
  name: string
  lat: number | null
  lon: number | null
  url: string
  meta: Record<string, JsonValue>
}
export type DiscoveredSource = Omit<Source, 'id' | 'kind'> & { staleAfterS?: number }

export interface CrowdPeriod {
  id: string
  projectId: string
  state: 'upcoming' | 'in_progress'
  arrivalStart: Instant
  arrivalEnd: Instant | null
  exitStart: Instant | null
  exitEnd: Instant | null
}
export interface PollContext {
  now(): Instant
  // Real response status only; transport and budget failures throw typed errors.
  http(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<{
    status: number
    headers: { get(name: string): string | null }
    json(): Promise<unknown>
    text(): Promise<string>
    arrayBuffer(): Promise<ArrayBuffer>
  }>
  // Shared across scheduled fetches and contract probes; no Postgres access.
  budget: { take(family: ApiFamily): Promise<void> }
  storage: {
    get(path: string): Promise<Uint8Array | null>
    put(path: string, body: Uint8Array): Promise<void>
  }
  openCrowdPeriods(): Promise<CrowdPeriod[]>
  log: (message: string, fields?: Record<string, JsonValue>) => void
}

const Instant = z.iso.datetime()
const LocalDate = z.iso.date()
const WarningValue = z.looseObject({
  warning_issue: z.looseObject({ issued: z.string(), title_bm: z.string(), title_en: z.string() }),
  valid_from: z.string().nullable(),
  valid_to: z.string().nullable(),
  heading_en: z.string(),
  text_en: z.string(),
  instruction_en: z.string().nullable(),
  heading_bm: z.string(),
  text_bm: z.string(),
  instruction_bm: z.string().nullable(),
  valid_from_utc: Instant.nullable(),
  valid_to_utc: Instant.nullable(),
  excluded: z.boolean()
})
// #122 stores the published forecast row verbatim with per-field English glosses.
const ForecastDayValue = z.looseObject({
  location: z.looseObject({
    location_id: z.string().min(1).regex(/\S/),
    location_name: z.string().min(1).regex(/\S/)
  }),
  date: LocalDate,
  morning_forecast: z.string(),
  afternoon_forecast: z.string(),
  night_forecast: z.string(),
  summary_forecast: z.string(),
  summary_when: z.string(),
  min_temp: z.number().int(),
  max_temp: z.number().int(),
  gloss_en: z.record(z.string(), z.string())
})
const ExitsDailyValue = z.object({ data_as_of: z.string(), edition: z.number().int(), file_last_modified: z.string() })
const MetadataValue = z.object({
  data_as_of: z.string(),
  last_updated: z.string(),
  next_update: z.string(),
  data_as_of_utc: Instant,
  last_updated_utc: Instant,
  next_update_utc: Instant
})
const FeedValue = z.object({
  sha256: z.string(),
  object_path: z.string(),
  calendar_end: LocalDate,
  segments: z.array(
    z.object({ route_id: z.string(), from_stop: z.string(), to_stop: z.string(), scheduled_s: z.number() })
  )
})
const SegmentValue = z.strictObject({
  route_id: z.string(),
  from_stop: z.string(),
  to_stop: z.string(),
  trip_id: z.string(),
  depart_at: Instant,
  scheduled_s: z.number(),
  header_age_s: z.number()
})
const ListingValue = z.object({
  venue: z.enum(['stadium', 'arena']),
  title: z.string(),
  local_date: LocalDate,
  doors_raw: z.string().nullable(),
  show_raw: z.string().nullable(),
  show_end_raw: z.string().nullable(),
  tz_unverified: z.boolean(),
  class_hint: z.enum(['stadium_concert', 'stadium_football', 'arena_show', 'other']),
  historical: z.boolean(),
  source_url: z.url(),
  revision: z.number().int().nullable(),
  attribution: z.string()
})
const CameraFlagValue = z.object({
  capture_id: z.string(),
  object_path: z.string(),
  buffered: z.boolean(),
  distance_km: z.number()
})
const PiValue = z.strictObject({ header_age_s: z.number(), posted_at: Instant, note: z.string().nullable() })

// A null unit means the adapter ticket specifies no numeric unit.
export const SOURCE_METRICS = {
  jps_rain: { rain_5m_mm: { unit: 'mm', value_json: z.null() } },
  met_warning: { warning: { unit: null, value_json: WarningValue } },
  met_forecast: { forecast_day: { unit: null, value_json: ForecastDayValue } },
  apims: { api: { unit: 'API', value_json: z.object({ class: z.string(), param: z.string() }) } },
  rapidrail_od: {
    exits_daily: { unit: 'exits', value_json: ExitsDailyValue },
    metadata: { unit: null, value_json: MetadataValue }
  },
  gtfs_static: { feed: { unit: null, value_json: FeedValue } },
  gtfs_rt: { segment_s: { unit: 's', value_json: SegmentValue } },
  golive: { listing: { unit: null, value_json: ListingValue } },
  wikipedia: { listing: { unit: null, value_json: ListingValue } },
  camera: {
    contrast_near: { unit: 'ratio', value_json: z.null() },
    contrast_far: { unit: 'ratio', value_json: z.null() },
    flag: { unit: null, value_json: CameraFlagValue }
  },
  // #128: heartbeat and error rows write polls only, so they are not metrics.
  pi: { exits_daily: { unit: 'exits', value_json: PiValue }, segment: { unit: 's', value_json: PiValue } }
} as const

type MetricContracts = typeof SOURCE_METRICS
export type MetricName<K extends SourceKind = SourceKind> = { [Kind in K]: keyof MetricContracts[Kind] }[K]
export type ReadingInput<K extends SourceKind = SourceKind> = {
  [Kind in K]: {
    [Metric in keyof MetricContracts[Kind]]: MetricContracts[Kind][Metric] extends {
      unit: infer Unit
      value_json: infer Schema extends z.ZodType
    }
      ? {
          sourceId: string
          metric: Metric
          observedAt: Instant
          value: number | null
          valueText?: string | null
          valueJson: z.infer<Schema>
          unit: Unit
          itemKey?: string
        }
      : never
  }[keyof MetricContracts[Kind]]
}[K]

export interface SourceAdapter<Raw> {
  kind: SourceKind
  apiFamily?: ApiFamily
  cadence: Duration
  freshness: 'observed' | 'polled'
  licence: Licence
  batch: 'all_bound' | 'per_source'
  // Opt-in physical request budget and pure decoding of the current slot's captured bytes.
  latestSlot?: {
    seconds: number
    decode(body: Uint8Array): Raw
    discover?(body: Uint8Array): DiscoveredSource[]
  }
  // HttpError, TimeoutError, NetworkError and RateLimitedError retain failure identity.
  fetch(sources: Source[], ctx: PollContext): Promise<Raw>
  // Pure; throw SchemaError when the published payload no longer matches.
  parse(raw: Raw, sources: Source[]): ReadingInput[]
  backfill?(source: Source, ctx: PollContext): Promise<Raw>
  discover?(): Promise<DiscoveredSource[]>
  indicators: Array<{
    name: string
    celType: 'double' | 'int' | 'bool' | 'timestamp' | 'duration' | 'list'
    unit: string
    scope: 'site' | 'window'
    sourceKind: SourceKind
  }>
}

// Spec §1 'Sources and forecast': Pub/Sub readings-updated body.
export const ReadingsUpdated = z.strictObject({
  source_id: z.string(),
  kind: SourceKind,
  poll_id: z.string(),
  new_rows: z.number().int().nonnegative()
})
export type ReadingsUpdated = z.infer<typeof ReadingsUpdated>
export type ParseListingPage = (url: string) => Promise<z.infer<typeof ListingValue>[] | { reason: 'unsafe-url' }>
