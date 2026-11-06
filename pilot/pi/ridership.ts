// The Rapid Rail OD reduction (#68): daily SP17 exits from the yearly parquet files.
// Pure functions only, so the same code runs under plain `bun`, in the Pi's
// cross-compiled binary (#72) and in tests. I/O lives in ridership-run.ts.
import type { PostBody, PostResult } from '../shared/device-post.ts'

// The station and the total row, exactly as the files spell them.
export const SP17 = 'SP17: Bukit Jalil'
export const ALL_STATIONS = 'A0: All Stations'

// The columns the reduction reads; anything else in the file is ignored.
export const EXPECTED_COLUMNS = ['origin', 'destination', 'date', 'ridership'] as const

export interface NightTotal {
  /** The night, `YYYY-MM-DD`. */
  date: string
  /** Exits at SP17 that night, excluding the `A0: All Stations` total row. */
  exits: number
}

// One row of a `pi_rows` post: a night's exits, or the schema error.
export interface PiRowOk {
  kind: 'sp17_exits'
  observed_at: string
  value: number
  revision: number
  note: string
}

export interface PiRowError {
  kind: 'error'
  observed_at: string
  note: string
}

export type PiRow = PiRowOk | PiRowError

// The poll envelope every `pi_rows` post carries; its columns land in `polls`.
export interface PiPoll {
  poll_id: string
  started_at: string
  received_at: string
  http_status: number
  latency_ms: number
  outcome: 'ok' | 'error'
  error?: string
}

export interface PiRowsPost extends PostBody {
  device_id: string
  rows: PiRow[]
  poll: PiPoll
}

// The runner's memory: the last posted `data_as_of` and, per night, value and revision.
export interface RidershipState {
  data_as_of: string | null
  nights: Record<string, { value: number; revision: number }>
}

export function blankState(): RidershipState {
  return { data_as_of: null, nights: {} }
}

// A parquet `date` is a timestamp (a Date at midnight UTC through hyparquet);
// the committed extract stores it as `YYYY-MM-DD`. Either way this is the night.
export function dayOf(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    // Epoch millis for a real timestamp; a smaller integer (an YYYYMMDD day or
    // seconds count) is a retyped column, not a night.
    if (Number(value) < 1_000_000_000_000) return null
    const date = new Date(Number(value))
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const day = value.length >= 10 ? value.slice(0, 10) : value
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export type ReduceResult = { nights: NightTotal[] } | { schemaError: string }

// Exits for each night: the sum of `ridership` where `destination` is SP17 and
// `origin` is not the `A0: All Stations` total row. A missing or retyped column,
// or a file without SP17 or A0 rows, is a schema error naming the change.
export function reduceNightlies(records: unknown[]): ReduceResult {
  const totals = new Map<string, number>()
  let sawSp17 = false
  let sawAll = false
  for (const record of records) {
    if (!isRecord(record)) return { schemaError: 'a row is not an object' }
    for (const column of EXPECTED_COLUMNS) {
      if (!(column in record)) return { schemaError: `column "${column}" is missing or renamed` }
    }
    const { origin, destination, date, ridership } = record
    if (typeof origin !== 'string' || typeof destination !== 'string')
      return { schemaError: 'column "origin" or "destination" is retyped (expected strings)' }
    if (typeof ridership !== 'number' && typeof ridership !== 'bigint')
      return { schemaError: 'column "ridership" is retyped (expected a number)' }
    const day = dayOf(date)
    if (day === null) return { schemaError: 'column "date" is retyped (expected a timestamp or YYYY-MM-DD)' }
    if (destination === SP17) sawSp17 = true
    if (destination === SP17 && origin === ALL_STATIONS) sawAll = true
    if (destination !== SP17 || origin === ALL_STATIONS) continue
    totals.set(day, (totals.get(day) ?? 0) + Number(ridership))
  }
  if (!sawSp17) return { schemaError: `destination "${SP17}" is absent` }
  if (!sawAll) return { schemaError: `origin "${ALL_STATIONS}" is absent` }
  return {
    nights: [...totals].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, exits]) => ({ date, exits }))
  }
}

// The metadata times carry no offset and are read as MYT. Returns the three
// stamps in `YYYY-MM-DD HH:MM` form, or the problem with the metadata.
export function parseMetadata(
  text: string
): { stamps: { dataAsOf: string; lastUpdated: string; nextUpdate: string } } | { problem: string } {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { problem: 'the metadata is not JSON' }
  }
  if (!isRecord(body)) return { problem: 'the metadata is not an object' }
  const stamps: Record<string, string> = {}
  for (const [field, key] of [
    ['data_as_of', 'dataAsOf'],
    ['last_updated', 'lastUpdated'],
    ['next_update', 'nextUpdate']
  ] as const) {
    const value = body[field]
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?/.test(value))
      return { problem: `the metadata has no readable "${field}"` }
    stamps[key] = value.slice(0, 16)
  }
  return {
    stamps: {
      dataAsOf: stamps.dataAsOf ?? '',
      lastUpdated: stamps.lastUpdated ?? '',
      nextUpdate: stamps.nextUpdate ?? ''
    }
  }
}

// The night a `data_as_of` stamp covers: `data_as_of` is end-of-day, so the date
// it names is the newest covered night.
export function coveredNight(dataAsOf: string): string {
  return dataAsOf.slice(0, 10)
}

// The pending line for a late file, from the metadata's `next_update`.
export function pendingLine(nextUpdate: string): string {
  return `pending until ${nextUpdate.slice(11, 16)}`
}

// Today's date in MYT, from a UTC clock: MYT has no daylight saving, so a fixed
// offset is exact.
export function mytToday(nowMs: number): string {
  return new Date(nowMs + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10)
}

// Each run posts the 7 newest nights the file covers.
export function newestNights(nights: NightTotal[], dataAsOf: string, limit = 7): NightTotal[] {
  const newest = coveredNight(dataAsOf)
  return nights.filter((night) => night.date <= newest).slice(-limit)
}

// Diff the nights to post against the runner's memory: new nights post at
// revision 1, changed values repost at revision + 1, repeats are skipped.
export function nightsToPost(
  nights: NightTotal[],
  dataAsOf: string,
  state: RidershipState
): { rows: { date: string; value: number; revision: number }[]; upToDate: boolean } {
  const rows: { date: string; value: number; revision: number }[] = []
  for (const night of newestNights(nights, dataAsOf)) {
    const known = state.nights[night.date]
    if (!known) rows.push({ date: night.date, value: night.exits, revision: 1 })
    else if (known.value !== night.exits)
      rows.push({ date: night.date, value: night.exits, revision: known.revision + 1 })
  }
  return { rows, upToDate: rows.length === 0 }
}

// The `note` JSON every reading row carries.
export function buildNote(args: {
  runner: string
  deviceTime: string
  postedAt: string
  headerAgeS: number
  dataAsOf: string
}): string {
  return JSON.stringify({
    runner: args.runner,
    device_time: args.deviceTime,
    posted_at: args.postedAt,
    header_age_s: args.headerAgeS,
    data_as_of: args.dataAsOf
  })
}

export interface ReadingNote {
  runner: string
  device_time: string
  posted_at: string
  header_age_s: number
  data_as_of: string
}

export function parseNote(note: string): ReadingNote | null {
  try {
    const parsed: unknown = JSON.parse(note)
    if (!isRecord(parsed)) return null
    const { runner, device_time, posted_at, header_age_s, data_as_of } = parsed
    if (
      (runner !== 'pi' && runner !== 'actions') ||
      typeof device_time !== 'string' ||
      typeof posted_at !== 'string' ||
      typeof header_age_s !== 'number' ||
      typeof data_as_of !== 'string'
    )
      return null
    return { runner, device_time, posted_at, header_age_s, data_as_of }
  } catch {
    return null
  }
}

// Fold posted nights into the runner's memory after an acknowledged post.
export function rememberPosted(
  state: RidershipState,
  dataAsOf: string,
  rows: { date: string; value: number; revision: number }[]
): RidershipState {
  const nights = { ...state.nights }
  for (const row of rows) nights[row.date] = { value: row.value, revision: row.revision }
  return { data_as_of: dataAsOf, nights }
}

// The reading ID for a night's exits, matching the `source:metric:observed` shape.
export function readingId(date: string): string {
  return `SP17:sp17_exits:${date}`
}

// The handler's reply to a posted body: `duplicate: true` when the sheet already
// holds every row, `ok: false` naming the first problem otherwise.
export function checkPostResult(reply: unknown): PostResult {
  if (isRecord(reply) && reply.ok === true) return { ok: true, duplicate: reply.duplicate === true }
  const error = isRecord(reply) && typeof reply.error === 'string' ? reply.error : 'the reply is not a post result'
  return { ok: false, error }
}
