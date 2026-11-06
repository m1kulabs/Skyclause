// The `pi_rows` device post (#68): the Pi or the fallback workflow posts reduced
// Rapid Rail nights, and this stores them in `polls` and `readings`.
// Pure except for the sheet port, so tests use a fake.
import type { PostBody, PostResult } from '../../shared/device-post.ts'
import { parseNote, readingId } from '../../pi/ridership.ts'
import { validateReading } from './readings.ts'
import type { Cell, Row } from './schema.ts'

export const PI_ROWS_KIND = 'pi_rows'
export const RAPIDRAIL_KIND = 'rapidrail_od'
export const SP17_SOURCE_ID = 'SP17'
export const MAX_POST_ROWS = 200

// What the runner sends per row. `note` is JSON
// `{runner, device_time, posted_at, header_age_s, data_as_of}`; the error row
// carries no value because there is no count to store.
export interface IncomingOkRow {
  kind: 'sp17_exits'
  observed_at: string
  value: number
  revision: number
  note: string
}

export interface IncomingErrorRow {
  kind: 'error'
  observed_at: string
  note: string
}

export interface IncomingPoll {
  poll_id: string
  started_at: string
  received_at: string
  http_status: number
  latency_ms: number
  outcome: 'ok' | 'error'
  error?: string
}

export interface PiRowsBody extends PostBody {
  device_id: string
  rows: (IncomingOkRow | IncomingErrorRow)[]
  poll: IncomingPoll
}

// The sheet reads and writes the handler needs, built from `SHEET_ID` in gas.ts.
export interface PiRowsStore {
  sourceRow(sourceId: string): Row<'sources'> | null
  appendSource(row: Row<'sources'>): void
  // Every stored reading for this source: the dedupe key and the revision.
  storedReadings(): { reading_id: Cell; observed_at: Cell; value: Cell; revision: Cell }[]
  appendPoll(row: Row<'polls'>): void
  appendReadings(rows: Row<'readings'>[]): void
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function timeField(value: unknown): value is string {
  return typeof value === 'string' && ISO_WITH_OFFSET.test(value) && !Number.isNaN(Date.parse(value))
}

// The `sources` default row the ticket writes: a 2-day staleness and a daily cadence.
export function rapidrailSourceRow(now: Date): Row<'sources'> {
  return {
    source_id: SP17_SOURCE_ID,
    kind: RAPIDRAIL_KIND,
    name: 'Rapid Rail origin-destination, Bukit Jalil exits',
    cadence_min: 1440,
    stale_after_min: 2880,
    freshness: 'observed',
    licence: 'CC BY 4.0',
    url: 'https://raw.githubusercontent.com/data-gov-my/datagovmy-meta/main/data-catalogue/ridership_od_rapidrail_daily.json',
    state: 'fresh',
    state_since: now.toISOString()
  }
}

function problemsIn(body: PiRowsBody): string | null {
  if (typeof body.device_id !== 'string' || !body.device_id) return 'device_id is missing'
  if (!Array.isArray(body.rows) || body.rows.length === 0) return 'rows is missing or empty'
  if (body.rows.length > MAX_POST_ROWS) return `rows carries more than ${MAX_POST_ROWS} rows`
  const poll = body.poll
  if (!isRecord(poll)) return 'poll is missing'
  for (const field of ['poll_id', 'started_at', 'received_at'] as const) {
    if (typeof poll[field] !== 'string' || !poll[field]) return `poll.${field} is missing`
  }
  if (!timeField(poll.started_at) || !timeField(poll.received_at))
    return 'poll times must be ISO 8601 with an explicit offset'
  if (
    typeof poll.http_status !== 'number' ||
    !Number.isInteger(poll.http_status) ||
    poll.http_status < 0 ||
    poll.http_status > 599
  )
    return 'poll.http_status must be an integer from 0 to 599'
  if (typeof poll.latency_ms !== 'number' || !Number.isFinite(poll.latency_ms))
    return 'poll.latency_ms must be a number'
  if (poll.outcome !== 'ok' && poll.outcome !== 'error') return 'poll.outcome must be ok or error'
  const kinds = new Set(body.rows.map((row) => (isRecord(row) ? row.kind : undefined)))
  if (kinds.size !== 1 || kinds.has('sp17_exits') === kinds.has('error'))
    return 'rows must be all sp17_exits or one error'
  for (const row of body.rows) {
    if (!isRecord(row)) return 'a row is not an object'
    if (!timeField(row.observed_at)) return 'row observed_at must be ISO 8601 with an explicit offset'
    if (parseNote(typeof row.note === 'string' ? row.note : '') === null) return 'row note must be the ticket JSON'
  }
  if (kinds.has('error')) {
    if (body.rows.length !== 1) return 'an error post carries exactly one row'
    if (poll.outcome !== 'error' || typeof poll.error !== 'string' || !poll.error)
      return 'an error post needs poll outcome error and its text'
  } else {
    if (poll.outcome !== 'ok') return 'sp17_exits rows need poll outcome ok'
    for (const row of body.rows) {
      const value = (row as unknown as Record<string, unknown>).value
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        return 'sp17_exits value must be a count of zero or more'
      const revision = (row as unknown as Record<string, unknown>).revision
      if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1)
        return 'sp17_exits revision must be a positive integer'
    }
  }
  return null
}

// Every reading the handler would append, with the poll envelope stamped on.
function readingRows(body: PiRowsBody): Row<'readings'>[] {
  const { poll } = body
  return body.rows.map((row) => {
    if (row.kind === 'error') {
      return {
        reading_id: `${SP17_SOURCE_ID}:error:${String(row.observed_at).slice(0, 10)}`,
        source_kind: RAPIDRAIL_KIND,
        source_id: SP17_SOURCE_ID,
        metric: 'error',
        observed_at: row.observed_at,
        received_at: poll.received_at,
        value: 0,
        unit: '',
        http_status: poll.http_status,
        latency_ms: poll.latency_ms,
        poll_id: poll.poll_id,
        revision: 1,
        note: row.note
      } satisfies Row<'readings'>
    }
    return {
      reading_id: readingId(String(row.observed_at).slice(0, 10)),
      source_kind: RAPIDRAIL_KIND,
      source_id: SP17_SOURCE_ID,
      metric: 'sp17_exits',
      observed_at: row.observed_at,
      received_at: poll.received_at,
      value: row.value,
      unit: 'exits',
      http_status: poll.http_status,
      latency_ms: poll.latency_ms,
      poll_id: poll.poll_id,
      revision: row.revision,
      note: row.note
    } satisfies Row<'readings'>
  })
}

// The `pi_rows` handler for `sp17_exits` and `error` row kinds: one `polls` row
// per post, one `readings` row per night, and repeats report `duplicate: true`
// while writing nothing. SIG-1: every appended reading passes validateReading.
export function handlePiRows(body: PostBody, store: PiRowsStore, now: Date): PostResult {
  const problem = problemsIn(body as PiRowsBody)
  if (problem) return { ok: false, error: problem }
  const post = body as PiRowsBody

  if (!store.sourceRow(SP17_SOURCE_ID)) store.appendSource(rapidrailSourceRow(now))

  const readings = readingRows(post)
  const stored = new Map(
    store
      .storedReadings()
      .map((row) => [
        `${String(row.reading_id)}·${String(row.observed_at)}·${String(row.value)}·${String(row.revision)}`,
        true
      ])
  )
  const repeats = readings.every((row) =>
    stored.get(`${String(row.reading_id)}·${String(row.observed_at)}·${String(row.value)}·${String(row.revision)}`)
  )
  if (repeats) return { ok: true, duplicate: true }

  for (const row of readings) {
    const rowProblems = validateReading(row)
    if (rowProblems.length > 0) return { ok: false, error: rowProblems.join('; ') }
  }

  store.appendPoll({
    poll_id: post.poll.poll_id,
    source_kind: RAPIDRAIL_KIND,
    source_id: SP17_SOURCE_ID,
    started_at: post.poll.started_at,
    received_at: post.poll.received_at,
    http_status: post.poll.http_status,
    latency_ms: post.poll.latency_ms,
    outcome: post.poll.outcome,
    new_rows: readings.length,
    error: post.poll.outcome === 'error' ? (post.poll.error ?? '') : '',
    raw_file_id: ''
  })
  store.appendReadings(readings)
  return { ok: true, duplicate: false }
}
