import { toMytIso } from '../../shared/time.ts'
import {
  cameraEligibilityAt,
  decodeCameraProbationHistory,
  type CameraProbationHistory
} from './camera-probation-history.ts'
import { evaluateSkyClauses, skyClauseEvidenceRequirements, type SkyVerdictValue } from './clauses.ts'
import {
  BOUND_APIMS_STATION_IDS,
  GAUGE_SOURCE_ID,
  computeSkyObservedSnapshot,
  normalizeAndDedupeReadings,
  normalizePolls,
  pollsForSource,
  skyEvidenceTimestamp as timestamp,
  type DaylightWindow
} from './indicators.ts'
import type { Row } from './schema.ts'

export interface SkyGradeWindow {
  windowId: string
  start: Date
  end: Date
  spanFrom: Date
  spanTo: Date
  row: Row<'windows'>
}
export interface SkyGradeVersion {
  savedAt: string
  hash: string
  clauses: Row<'clauses'>[]
}
export interface SkyGradeEvidenceInput {
  spreadsheetId: string
  knownAt: Date
  window: SkyGradeWindow
  version: SkyGradeVersion
  sources: readonly Row<'sources'>[]
  readings: readonly Row<'readings'>[]
  polls: readonly Row<'polls'>[]
  warnings: readonly Row<'warnings'>[]
  daylight: DaylightWindow | null
  cameraHistory: CameraProbationHistory | null
  cameraHistoryProblem?: string
}
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const STEP = 5 * MINUTE

function publicDate(value: unknown): string | null {
  if (value instanceof Date || (typeof value === 'string' && value.includes('T'))) {
    const ms = timestamp(value)
    return ms === null ? null : toMytIso(new Date(ms)).slice(0, 10)
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  return timestamp(`${value}T00:00:00+08:00`) === null ? null : value
}
function bound(value: unknown, date: string): number | null {
  if (typeof value === 'string' && /^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    const [h, m, s = 0] = value.split(':').map(Number)
    if (h! > 23 || m! > 59 || s > 59) return null
    return timestamp(`${date}T${value.length === 5 ? `${value}:00` : value}+08:00`)
  }
  return timestamp(value)
}
export function parseSkyGradeWindow(row: Row<'windows'>): { window: SkyGradeWindow | null; problem?: string } {
  const invalid = { window: null, problem: 'window_invalid' }
  const windowId = String(row.window_id ?? '').trim()
  const status = String(row.status ?? '')
    .trim()
    .toLowerCase()
  const date = publicDate(row.date)
  if (!windowId || (status && status !== 'active') || !date) return invalid
  const start = bound(row.start_myt, date)
  const end = bound(row.end_myt, date)
  if (start === null || end === null || end <= start || toMytIso(new Date(start)).slice(0, 10) !== date) return invalid
  return {
    window: {
      windowId,
      start: new Date(start),
      end: new Date(end),
      spanFrom: new Date(end - 30 * MINUTE),
      spanTo: new Date(end + HOUR),
      row: { ...row, date, start_myt: toMytIso(new Date(start)), end_myt: toMytIso(new Date(end)) }
    }
  }
}

function daylightValid(daylight: DaylightWindow | null): boolean {
  if (!daylight) return false
  const parse = (clock: string): number | null => {
    if (!/^\d{2}:\d{2}(?::00)?$/.test(clock)) return null
    const [hour, minute] = clock.split(':').map(Number)
    return hour! <= 23 && minute! <= 59 ? hour! * 60 + minute! : null
  }
  const start = parse(daylight.start)
  const end = parse(daylight.end)
  return start !== null && end !== null && start < end
}

export function evaluateSkyGradeEvidence(input: SkyGradeEvidenceInput): {
  observedMode: SkyVerdictValue
  problems: string[]
} {
  const problems: string[] = []
  const noCall = () => ({ observedMode: 'no_call' as const, problems })
  const close = input.window.spanTo.getTime()
  const known = input.knownAt.getTime()
  if (!Number.isFinite(close) || !Number.isFinite(known) || known <= close) {
    problems.push('window_not_closed')
    return noCall()
  }
  const requirements = skyClauseEvidenceRequirements(input.version.clauses)
  problems.push(...requirements.problems)
  const readings = normalizeAndDedupeReadings(input.readings, close, known)
  const first = Math.ceil(input.window.spanFrom.getTime() / STEP) * STEP
  const last = Math.floor(close / STEP) * STEP
  const gaugeFrom = first - 235 * MINUTE
  const ranges = new Map<string, Array<[number, number]>>([[GAUGE_SOURCE_ID, [[gaugeFrom, last]]]])
  const required = new Map<string, { metric: string; stamps: number[] }>([
    [GAUGE_SOURCE_ID, { metric: 'rain_5m_mm', stamps: [] }]
  ])
  for (let stamp = gaugeFrom; stamp <= last; stamp += STEP) required.get(GAUGE_SOURCE_ID)!.stamps.push(stamp)
  if (requirements.apims) {
    const endHour = Math.floor(close / HOUR) * HOUR
    const date = toMytIso(new Date(close)).slice(0, 10)
    let morning = Date.parse(`${date}T06:00:00+08:00`)
    if (morning > close) morning -= DAY
    for (const id of BOUND_APIMS_STATION_IDS) {
      const stamps = [endHour]
      const intervals: Array<[number, number]> = [[endHour, close]]
      for (let day = 0; day < requirements.morningDays; day++) {
        const stamp = morning - day * DAY
        stamps.push(stamp)
        intervals.push([stamp, Math.min(stamp + HOUR, close)])
      }
      required.set(id, { metric: 'api', stamps })
      ranges.set(id, intervals)
    }
  }
  for (const [id, need] of required) {
    const source = input.sources.find((row) => row.source_id === id)
    if (!source) problems.push(`source_missing:${id}`)
    const facts = readings.filter((row) => row.sourceId === id && row.metric === need.metric)
    const stamps = new Set(facts.map((row) => row.observedAtMs))
    for (const stamp of need.stamps) {
      if (!stamps.has(stamp)) problems.push(`reading_missing:${id}:${toMytIso(new Date(stamp))}`)
    }
    if (
      input.readings.some((row) => {
        const observed = timestamp(row.observed_at)
        const received = timestamp(row.received_at)
        return (
          row.source_id === id &&
          row.metric === need.metric &&
          observed !== null &&
          received !== null &&
          received <= known &&
          (id === GAUGE_SOURCE_ID
            ? observed > input.window.spanFrom.getTime() - 240 * MINUTE && observed <= close && observed % STEP !== 0
            : ranges.get(id)!.some(([from, to]) => observed >= from && observed <= to) && observed % HOUR !== 0)
        )
      })
    )
      problems.push(`reading_off_grid:${id}`)
    if (!source) continue
    const visiblePolls = input.polls.filter((row) => {
      const receipt = timestamp(row.received_at)
      const started = timestamp(row.started_at)
      return (receipt === null || receipt <= known) && (started === null || started <= known)
    })
    const matchingPolls = pollsForSource(source, normalizePolls(visiblePolls, known, true), facts)
    for (const poll of matchingPolls) {
      if (poll.outcome === 'ok' || poll.outcome === 'unchanged') continue
      const start = poll.startedAtMs ?? poll.receivedAtMs
      const end = poll.receivedAtMs ?? poll.startedAtMs
      if (start === null || end === null || end < start) {
        problems.push(`poll_timing_invalid:${id}:${poll.pollId}`)
      } else if (ranges.get(id)!.some(([from, to]) => start <= to && end >= from)) {
        problems.push(`poll_error:${id}:${poll.pollId}`)
      }
    }
  }
  // Required evidence wins over the evaluator's rank precedence.
  if (problems.length) return noCall()

  // Restrict historical APIMS context to what the selected clauses actually require.
  // The fixed three-morning indicator horizon matches the live snapshot.
  const historicalReadings = input.readings.filter((row) => {
    const id = String(row.source_id ?? '')
    if (!(BOUND_APIMS_STATION_IDS as readonly string[]).includes(id) || row.metric !== 'api') return true
    const observed = timestamp(row.observed_at)
    return observed !== null && (required.get(id)?.stamps.includes(observed) ?? false)
  })
  let eligibleReadings = historicalReadings
  let cameraEligibility: 'passed' | 'probation' | 'unknown' = 'unknown'
  const camera = input.sources.find((row) => row.kind === 'camera')
  if (requirements.camera && camera) {
    const id = String(camera.source_id ?? '')
    let history: CameraProbationHistory | null = null
    if (input.cameraHistoryProblem) problems.push(input.cameraHistoryProblem)
    else if (input.cameraHistory === null) problems.push('camera_history_unknown')
    else {
      try {
        history = decodeCameraProbationHistory(JSON.stringify(input.cameraHistory), input.spreadsheetId)
        const latest = history.decisions.filter((decision) => decision.sourceId === id).at(-1)
        if (!latest) {
          problems.push('camera_history_source_unknown')
          history = null
        } else if (history.decisions.some((decision) => Date.parse(decision.at) > known)) {
          problems.push('camera_history_future')
          history = null
        } else if (typeof camera.probation !== 'boolean' || camera.probation === latest.passed) {
          problems.push('camera_history_mirror_mismatch')
          history = null
        }
      } catch {
        problems.push('camera_history_invalid')
      }
    }
    const eligible = new Set<Row<'readings'>>()
    if (history && cameraEligibilityAt(history, id, input.window.spanTo) === 'passed') {
      for (const reading of historicalReadings) {
        if (reading.source_id !== id || reading.metric !== 'contrast_far') continue
        const captured = timestamp(reading.observed_at)
        const received = timestamp(reading.received_at)
        if (
          captured !== null &&
          captured <= close &&
          received !== null &&
          received <= known &&
          cameraEligibilityAt(history, id, new Date(captured)) === 'passed' &&
          cameraEligibilityAt(history, id, new Date(received)) === 'passed'
        )
          eligible.add(reading)
      }
      if (eligible.size > 0) cameraEligibility = 'passed'
    } else if (history) problems.push('camera_not_passed_at_close')
    if (cameraEligibility === 'passed' && !daylightValid(input.daylight)) {
      problems.push('camera_daylight_invalid')
      cameraEligibility = 'unknown'
    }
    eligibleReadings = historicalReadings.filter(
      (row) => row.source_id !== id || (cameraEligibility === 'passed' && eligible.has(row))
    )
  } else if (camera) eligibleReadings = historicalReadings.filter((row) => row.source_id !== camera.source_id)
  const tEval = toMytIso(input.window.spanTo)
  const snapshot = computeSkyObservedSnapshot({
    tEval,
    knownAt: input.knownAt.toISOString(),
    sources: input.sources,
    readings: eligibleReadings,
    polls: input.polls,
    warnings: input.warnings,
    windows: [input.window.row],
    daylight: input.daylight,
    cameraEligibility
  })
  const verdict = evaluateSkyClauses({
    tEval,
    snapshot,
    clauses: input.version.clauses,
    windows: [input.window.row],
    clauseVersion: input.version.hash
  }).find((row) => row.scope === input.window.windowId)
  if (!verdict) {
    problems.push('window_verdict_missing')
    return noCall()
  }
  return { observedMode: verdict.verdict, problems }
}
