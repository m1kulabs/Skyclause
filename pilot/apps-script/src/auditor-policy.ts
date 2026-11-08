import { toMytIso } from '../../shared/time.ts'
import type { Row } from './schema.ts'

export type AuditFamily = 'feed' | 'pi' | 'crossing' | 'credentials'
export type AuditHealth = 'active' | 'clear' | 'paused' | 'unavailable'
export interface AuditProblem {
  code: string
  ref?: string
}
export interface AuditCrossingFile {
  fileId: string
  name: string
  pack: 'sky' | 'crowd'
  writtenAt: string | Date
  text: string
}
export type AuditRefresh = { status: 'readable'; value: string | null } | { status: 'unreadable' }
export interface AuditInput {
  sources: readonly Row<'sources'>[]
  readings: readonly Row<'readings'>[]
  polls: readonly Row<'polls'>[]
  devices: readonly Row<'devices'>[]
  crowdGrades: readonly Row<'crowd_grades'>[]
  ledger: readonly Row<'ledger'>[]
  crossings: readonly AuditCrossingFile[]
  dayStart: string | null
  dayEnd: string | null
  refresh: AuditRefresh
}
export interface AuditObservation {
  family: 'feed' | 'pi'
  ref: string
  state: AuditHealth
  subject: string
  body: string
}
export interface AuditOneShot {
  family: 'crossing'
  ref: string
  subject: string
  body: string
}
export type AuditCredentialObservation =
  | { state: 'valid'; rawValue: string; due: boolean; expiresOn: string }
  | { state: 'unavailable'; reason: 'missing' | 'invalid' | 'future' | 'unreadable' }
export interface AuditPolicyResult {
  observations: AuditObservation[]
  oneShots: AuditOneShot[]
  credentials: AuditCredentialObservation
  problems: AuditProblem[]
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const BOUND_FEEDS = [
  { ref: '0232901RF', kind: 'jps_rain', metric: 'rain_5m_mm' },
  { ref: 'CA16W', kind: 'apims', metric: 'api' },
  { ref: 'CA19B', kind: 'apims', metric: 'api' },
  { ref: 'CA17W', kind: 'apims', metric: 'api' },
  { ref: 'met_warning', kind: 'met_warning', metric: null },
  { ref: 'cam-1', kind: 'camera', metric: null }
] as const

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

// Validate the local calendar before Date.parse can normalize e.g. February 30.
function instant(value: unknown): number | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match) return null
  const day = Date.parse(`${match[1]}T00:00:00Z`)
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return null
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return null
  if (Number(match[6] ?? 0) > 23 || Number(match[7] ?? 0) > 59) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function asOf(value: unknown, now: number): number | null {
  const ms = instant(value)
  return ms !== null && ms <= now ? ms : null
}

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function myt(ms: number): string {
  return `${toMytIso(new Date(ms)).slice(0, 16).replace('T', ' ')} MYT`
}

function latest<T>(rows: readonly T[], time: (row: T) => number | null): { row: T; ms: number } | null {
  let found: { row: T; ms: number } | null = null
  for (const row of rows) {
    const ms = time(row)
    if (ms !== null && (!found || ms >= found.ms)) found = { row, ms }
  }
  return found
}

function attemptText(polls: readonly Row<'polls'>[], now: number): string {
  const attempt = latest(polls, (row) => {
    // A future receipt is not an as-of attempt, even if its start was earlier.
    if (row.received_at !== undefined && row.received_at !== '') return asOf(row.received_at, now)
    return asOf(row.started_at, now)
  })
  if (!attempt) return polls.length === 0 ? 'No poll record.' : 'Poll records exist; no usable as-of attempt time.'
  const status = numeric(attempt.row.http_status)
  return `Latest poll: ${text(attempt.row.outcome) || 'outcome unavailable'}, ${status === null ? 'HTTP status unavailable' : `HTTP ${status}`} at ${myt(attempt.ms)}.`
}

function observation(
  family: 'feed' | 'pi',
  ref: string,
  state: AuditHealth,
  detail: string,
  diagnostic = ''
): AuditObservation {
  const label = family === 'pi' ? 'Pi' : 'Feed'
  const status = state === 'active' ? (family === 'pi' ? 'offline' : 'silent') : state === 'clear' ? 'recovered' : state
  return {
    family,
    ref,
    state,
    subject: `${label} ${ref} ${status}`,
    body: `${label} ${ref}: ${detail}${diagnostic ? ` ${diagnostic}` : ''}`
  }
}

function credentials(refresh: AuditRefresh, now: number): AuditCredentialObservation {
  if (refresh.status === 'unreadable') return { state: 'unavailable', reason: 'unreadable' }
  const rawValue = refresh.value
  if (rawValue === null || rawValue.trim() === '') return { state: 'unavailable', reason: 'missing' }
  const ms = instant(/^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? `${rawValue}T00:00:00+08:00` : rawValue)
  if (ms === null) return { state: 'unavailable', reason: 'invalid' }
  if (ms > now) return { state: 'unavailable', reason: 'future' }
  return {
    state: 'valid',
    rawValue,
    due: now >= ms + 12 * DAY,
    expiresOn: toMytIso(new Date(ms + 14 * DAY)).slice(0, 10)
  }
}

function gradeTime(value: unknown): number | null {
  return instant(
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)
      ? `${value.replace(' ', 'T')}:00+08:00`
      : value
  )
}

export function evaluateAudit(input: AuditInput, at: Date): AuditPolicyResult {
  const now = at.getTime()
  const result: AuditPolicyResult = {
    observations: [],
    oneShots: [],
    credentials: credentials(input.refresh, now),
    problems: []
  }
  const problemKeys = new Set<string>()
  const problem = (code: string, ref?: string): void => {
    const key = `${code}:${ref ?? ''}`
    if (!problemKeys.has(key)) {
      problemKeys.add(key)
      result.problems.push(ref === undefined ? { code } : { code, ref })
    }
  }
  if (!Number.isFinite(now)) throw new Error('Invalid audit check time')

  for (const bound of BOUND_FEEDS) {
    const configured = input.sources.filter((row) => row.source_id === bound.ref)
    if (configured.length === 0) continue
    const source = configured[0]!
    const threshold = numeric(source.stale_after_min)
    if (configured.length !== 1 || source.kind !== bound.kind || threshold === null || threshold <= 0) {
      problem('feed_configuration', bound.ref)
      result.observations.push(observation('feed', bound.ref, 'unavailable', 'Source configuration is unavailable.'))
      continue
    }
    const polls = input.polls.filter(
      (row) => row.source_kind === bound.kind && row.source_id === (bound.kind === 'apims' ? 'apims' : bound.ref)
    )
    const diagnostic = attemptText(polls, now)
    const matching = input.readings.filter(
      (row) =>
        row.source_id === bound.ref &&
        row.source_kind === bound.kind &&
        (bound.metric === null || row.metric === bound.metric)
    )
    const reading = latest(matching, (row) => {
      const observed = asOf(row.observed_at, now)
      const receipt = asOf(row.received_at, now)
      if (observed === null || (bound.metric !== null && numeric(row.value) === null)) {
        problem('reading_unavailable', bound.ref)
        return null
      }
      if (row.received_at !== undefined && row.received_at !== '' && receipt === null) {
        problem('reading_receipt_unavailable', bound.ref)
        return null
      }
      if (bound.kind === 'camera' && receipt === null) problem('reading_receipt_unavailable', bound.ref)
      return bound.kind === 'camera' ? receipt : observed
    })
    if (bound.kind === 'camera') {
      const validClock = (clock: string | null): clock is string =>
        clock !== null && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)
      if (!validClock(input.dayStart) || !validClock(input.dayEnd) || input.dayStart >= input.dayEnd) {
        problem('camera_daylight_configuration', bound.ref)
        result.observations.push(
          observation('feed', bound.ref, 'unavailable', 'Daylight configuration is unavailable.', diagnostic)
        )
        continue
      }
      const date = toMytIso(at).slice(0, 10)
      const start = instant(`${date}T${input.dayStart}:00+08:00`)!
      const end = instant(`${date}T${input.dayEnd}:00+08:00`)!
      const receiptText = reading ? `Newest camera receipt ${myt(reading.ms)}.` : 'No usable camera receipt.'
      if (now < start || now >= end) {
        result.observations.push(
          observation(
            'feed',
            bound.ref,
            'paused',
            `${receiptText} Outside daylight ${input.dayStart}–${input.dayEnd} MYT.`,
            diagnostic
          )
        )
        continue
      }
      const clock = Math.max(reading?.ms ?? start, start)
      const stale = now - clock > threshold * MINUTE
      const hasFreshTodayReceipt =
        reading !== null &&
        toMytIso(new Date(reading.ms)).slice(0, 10) === date &&
        now - reading.ms <= threshold * MINUTE
      const state: AuditHealth = stale ? 'active' : hasFreshTodayReceipt ? 'clear' : 'paused'
      result.observations.push(
        observation(
          'feed',
          bound.ref,
          state,
          `${receiptText} Daylight reference ${myt(start)}; clock age ${Math.floor((now - clock) / MINUTE)} minutes.`,
          diagnostic
        )
      )
      continue
    }
    const successfulPoll =
      bound.kind === 'met_warning'
        ? latest(
            polls.filter((row) => row.outcome === 'ok' || row.outcome === 'unchanged'),
            (row) => asOf(row.received_at, now)
          )
        : null
    const ms = bound.kind === 'met_warning' ? successfulPoll?.ms : reading?.ms
    if (ms === undefined) {
      problem(bound.kind === 'met_warning' ? 'successful_poll_unavailable' : 'observation_unavailable', bound.ref)
      result.observations.push(
        observation(
          'feed',
          bound.ref,
          'unavailable',
          bound.kind === 'met_warning'
            ? 'No usable successful warning poll receipt.'
            : 'No usable numeric observation.',
          diagnostic
        )
      )
      continue
    }
    const age = Math.floor((now - ms) / MINUTE)
    result.observations.push(
      observation(
        'feed',
        bound.ref,
        now - ms > threshold * MINUTE ? 'active' : 'clear',
        `Newest ${bound.kind === 'met_warning' ? 'successful poll receipt' : 'observation'} ${myt(ms)}; age ${age} minutes.`,
        diagnostic
      )
    )
  }

  const devices = new Map<string, Row<'devices'>>()
  for (const row of input.devices) if (row.kind === 'pi' && text(row.device_id)) devices.set(text(row.device_id), row)
  for (const [ref, row] of devices) {
    const ms = asOf(row.last_heartbeat_at, now)
    if (ms === null) {
      problem('pi_heartbeat_unavailable', ref)
      result.observations.push(observation('pi', ref, 'unavailable', 'No usable heartbeat.'))
      continue
    }
    const state = now - ms > 60 * MINUTE ? 'active' : 'clear'
    result.observations.push(
      observation(
        'pi',
        ref,
        state,
        `${state === 'active' ? `Pi offline since ${toMytIso(new Date(ms)).slice(11, 16)} MYT. ` : ''}Newest heartbeat ${myt(ms)}; age ${Math.floor((now - ms) / MINUTE)} minutes.`
      )
    )
  }

  const nights = new Map<string, { row: Row<'crowd_grades'>; ms: number; index: number }>()
  const unreadableGradeIndices = new Map<string, number>()
  for (const [index, row] of input.crowdGrades.entries()) {
    const ref = text(row.night_id)
    const ms = instant(row.graded_at)
    if (!ref || ms === null) {
      problem('rapidrail_grade_unavailable', ref || 'rapidrail_od')
      unreadableGradeIndices.set(ref, index)
      continue
    }
    if (ms > now) continue
    const previous = nights.get(ref)
    if (!previous || ms >= previous.ms) nights.set(ref, { row, ms, index })
  }
  // A later usable selected row repairs historical corruption for its own night.
  // An unreadable latest row cannot prove recovery, even when other nights resolved.
  let unknown =
    nights.size === 0 || [...unreadableGradeIndices].some(([ref, index]) => index > (nights.get(ref)?.index ?? -1))
  let overdue: { night: string; due: number; graded: number; index: number } | null = null
  const finals = new Set(['in_band', 'out_of_band', 'unlisted_surge', 'no_surge'])
  for (const [night, grade] of nights) {
    if (finals.has(text(grade.row.outcome))) continue
    const due = gradeTime(grade.row.next_update)
    if (grade.row.outcome !== 'pending' || due === null) {
      unknown = true
      problem('rapidrail_pending_unavailable', night)
      continue
    }
    if (
      now - due > 120 * MINUTE &&
      (!overdue || grade.ms > overdue.graded || (grade.ms === overdue.graded && grade.index > overdue.index))
    )
      overdue = { night, due, graded: grade.ms, index: grade.index }
  }
  const railPolls = input.polls.filter((row) => row.source_kind === 'rapidrail_od' && row.source_id === 'SP17')
  result.observations.push(
    observation(
      'feed',
      'rapidrail_od',
      overdue ? 'active' : unknown ? 'unavailable' : 'clear',
      overdue
        ? `Night ${overdue.night} remains pending after next update ${myt(overdue.due)}; overdue ${Math.floor((now - overdue.due) / MINUTE)} minutes.`
        : unknown
          ? 'No usable latest grade metadata for every night.'
          : 'No overdue unresolved night remains.',
      attemptText(railPolls, now)
    )
  )

  const files: { file: AuditCrossingFile; ref: string; ms: number }[] = []
  const ids = new Map<string, Set<string>>()
  for (const file of input.crossings) {
    let raw: unknown
    try {
      raw = JSON.parse(file.text)
    } catch {
      problem('crossing_json_unavailable', file.fileId)
      continue
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      problem('crossing_metadata_unavailable', file.fileId)
      continue
    }
    const document = raw as Record<string, unknown>
    if (document.replay === true) continue
    const ref = typeof document.crossing_id === 'string' && text(document.crossing_id) ? document.crossing_id : ''
    if (document.replay === false && ref) {
      const records = ids.get(ref) ?? new Set<string>()
      records.add(file.fileId)
      ids.set(ref, records)
    }
    if (
      document.pack !== file.pack ||
      !ref ||
      document.replay !== false ||
      !Array.isArray(document.changes) ||
      document.changes.length === 0
    ) {
      problem('crossing_metadata_unavailable', file.fileId)
      continue
    }
    const destinations = document.changes.map((change: unknown) =>
      typeof change === 'object' && change !== null && !Array.isArray(change)
        ? text((change as Record<string, unknown>).to)
        : ''
    )
    if (destinations.some((to) => !to)) {
      problem('crossing_changes_unavailable', file.fileId)
      continue
    }
    if (destinations.every((to) => to === 'normal')) continue
    const ms = asOf(file.writtenAt, now)
    if (ms === null) {
      problem('crossing_written_at_unavailable', file.fileId)
      continue
    }
    files.push({ file, ref, ms })
  }
  for (const [ref, records] of ids) if (records.size > 1) problem('crossing_duplicate_id', ref)
  const emitted = new Set<string>()
  for (const { file, ref, ms } of files) {
    if (
      ids.get(ref)!.size > 1 ||
      emitted.has(ref) ||
      now - ms < 20 * MINUTE ||
      input.ledger.some((row) => row.source_ref === ref)
    )
      continue
    emitted.add(ref)
    result.oneShots.push({
      family: 'crossing',
      ref,
      subject: `Crossing ${ref} has no ledger row`,
      body: `Detected ${myt(now)} for ${file.pack} crossing ${ref}, file written ${myt(ms)}. No ledger row references ${ref} 20 minutes after its file was written. Apps Script can't see Gemini Enterprise run state, so check the Runs tab.`
    })
  }
  return result
}
