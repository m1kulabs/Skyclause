import { toMytIso } from '../../shared/time.ts'
import { getProperty, skyEvaluationStore, withLock } from './gas.ts'
import {
  computeSkySnapshot,
  GAUGE_SOURCE_ID,
  type DaylightWindow,
  type SkySnapshot,
  type SourceStateUpdate
} from './indicators.ts'
import type { Cell, Row } from './schema.ts'

export type SkyEvaluationTab = 'sources' | 'readings' | 'polls' | 'warnings' | 'forecast' | 'windows' | 'indicators'

export interface SkyEvaluationStore {
  readRows<T extends SkyEvaluationTab>(tab: T): Row<T>[]
  appendIndicators(rows: readonly Row<'indicators'>[]): void
  replaceNow(rows: readonly Row<'now'>[]): void
  updateSourceStates(updates: readonly SourceStateUpdate[]): void
}

export interface SkyEvaluationPorts {
  store: SkyEvaluationStore
  daylight: DaylightWindow
}

const MINUTE_MS = 60_000
const TIME_ONLY_PREFIX_RE = /^(?:1899|1900)-\d{2}-\d{2}T(\d{2}:\d{2})/
const HH_MM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const HH_MM_SS_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})(?:$|T)/

function parseInstantMs(cell: Cell | undefined): number | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim()
    if (!trimmed) return null
    const ms = Date.parse(trimmed)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function normalizeInstantCell(cell: Cell | undefined): Cell | undefined {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : ''
  }
  return cell
}

export function normalizeDateCell(cell: Cell | undefined): Cell | undefined {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell).slice(0, 10) : ''
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim()
    const match = ISO_DATE_PREFIX_RE.exec(trimmed)
    if (match?.[1]) return match[1]
  }
  return cell
}

export function normalizeWindowTimeCell(cell: Cell | undefined): Cell | undefined {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    if (!Number.isFinite(ms)) return ''
    const iso = toMytIso(cell)
    const timeOnlyMatch = TIME_ONLY_PREFIX_RE.exec(iso)
    if (timeOnlyMatch?.[1]) return timeOnlyMatch[1]
    return iso
  }
  if (typeof cell === 'string') {
    const trimmed = cell.trim()
    if (HH_MM_RE.test(trimmed)) return trimmed
    if (HH_MM_SS_RE.test(trimmed)) return trimmed.slice(0, 5)
    const timeOnlyMatch = TIME_ONLY_PREFIX_RE.exec(trimmed)
    if (timeOnlyMatch?.[1]) return timeOnlyMatch[1]
  }
  return cell
}

export function normalizeWindowRow(row: Row<'windows'>): Row<'windows'> {
  const normalized: Row<'windows'> = { ...row }
  if (row.date !== undefined) normalized.date = normalizeDateCell(row.date)
  if (row.start_myt !== undefined) normalized.start_myt = normalizeWindowTimeCell(row.start_myt)
  if (row.end_myt !== undefined) normalized.end_myt = normalizeWindowTimeCell(row.end_myt)
  if (row.declared_at !== undefined) normalized.declared_at = normalizeInstantCell(row.declared_at)
  return normalized
}

function normalizeSourceRow(row: Row<'sources'>): Row<'sources'> {
  const normalized: Row<'sources'> = { ...row }
  if (row.state_since !== undefined) normalized.state_since = normalizeInstantCell(row.state_since)
  return normalized
}

function normalizePollRow(row: Row<'polls'>): Row<'polls'> {
  const normalized: Row<'polls'> = { ...row }
  if (row.started_at !== undefined) normalized.started_at = normalizeInstantCell(row.started_at)
  if (row.received_at !== undefined) normalized.received_at = normalizeInstantCell(row.received_at)
  return normalized
}

function normalizeReadingRow(row: Row<'readings'>): Row<'readings'> {
  const normalized: Row<'readings'> = { ...row }
  if (row.observed_at !== undefined) normalized.observed_at = normalizeInstantCell(row.observed_at)
  if (row.received_at !== undefined) normalized.received_at = normalizeInstantCell(row.received_at)
  return normalized
}

function normalizeWarningRow(row: Row<'warnings'>): Row<'warnings'> {
  const normalized: Row<'warnings'> = { ...row }
  if (row.issued !== undefined) normalized.issued = normalizeInstantCell(row.issued)
  if (row.valid_from !== undefined) normalized.valid_from = normalizeInstantCell(row.valid_from)
  if (row.valid_to !== undefined) normalized.valid_to = normalizeInstantCell(row.valid_to)
  if (row.first_seen_at !== undefined) normalized.first_seen_at = normalizeInstantCell(row.first_seen_at)
  if (row.last_seen_at !== undefined) normalized.last_seen_at = normalizeInstantCell(row.last_seen_at)
  return normalized
}

function normalizeForecastRow(row: Row<'forecast'>): Row<'forecast'> {
  const normalized: Row<'forecast'> = { ...row }
  if (row.date !== undefined) normalized.date = normalizeDateCell(row.date)
  if (row.first_seen_at !== undefined) normalized.first_seen_at = normalizeInstantCell(row.first_seen_at)
  return normalized
}

function normalizeIndicatorRow(row: Row<'indicators'>): Row<'indicators'> {
  const normalized: Row<'indicators'> = { ...row }
  if (row.snapshot_id !== undefined) normalized.snapshot_id = normalizeInstantCell(row.snapshot_id)
  if (row.observed_at !== undefined) normalized.observed_at = normalizeInstantCell(row.observed_at)
  return normalized
}

function selectLatestJpsPoll(polls: readonly Row<'polls'>[]): {
  poll: Row<'polls'>
  startedMs: number
  cutoffMs: number
} {
  let bestPoll: Row<'polls'> | null = null
  let bestStartedMs = -Infinity
  let bestReceivedMs = -Infinity

  for (const poll of polls) {
    if (poll.source_kind !== 'jps_rain' || poll.source_id !== GAUGE_SOURCE_ID) continue
    const startedMs = parseInstantMs(poll.started_at)
    if (startedMs === null) continue
    const receivedMs = parseInstantMs(poll.received_at) ?? startedMs
    if (startedMs > bestStartedMs || (startedMs === bestStartedMs && receivedMs > bestReceivedMs)) {
      bestPoll = poll
      bestStartedMs = startedMs
      bestReceivedMs = receivedMs
    }
  }

  if (!bestPoll) {
    throw new Error(`No jps_rain poll found for gauge ${GAUGE_SOURCE_ID}`)
  }

  return {
    poll: bestPoll,
    startedMs: bestStartedMs,
    cutoffMs: bestReceivedMs
  }
}

function isReceivedByCutoff(cell: Cell | undefined, cutoffMs: number): boolean {
  const ms = parseInstantMs(cell)
  return ms === null || ms <= cutoffMs
}

function indicatorKey(row: Row<'indicators'>): string {
  return `${String(row.snapshot_id ?? '')}|${String(row.scope ?? '')}|${String(row.name ?? '')}`
}

function requireDaylightTime(name: 'CAMERA_DAY_START' | 'CAMERA_DAY_END', raw: string | null): string {
  if (!raw || !raw.trim()) {
    throw new Error(`${name} is not set`)
  }
  const normalized = normalizeWindowTimeCell(raw)
  if (typeof normalized !== 'string' || !HH_MM_RE.test(normalized)) {
    throw new Error(`${name} must be HH:mm, got ${raw}`)
  }
  return normalized
}

export function runSkyEvaluation({ store, daylight }: SkyEvaluationPorts): SkySnapshot {
  const rawSources = store.readRows('sources')
  const rawReadings = store.readRows('readings')
  const rawPolls = store.readRows('polls')
  const rawWarnings = store.readRows('warnings')
  const rawForecast = store.readRows('forecast')
  const rawWindows = store.readRows('windows')
  const rawIndicators = store.readRows('indicators')

  const sources = rawSources.map(normalizeSourceRow)
  const allPolls = rawPolls.map(normalizePollRow)
  const allReadings = rawReadings.map(normalizeReadingRow)
  const allWarnings = rawWarnings.map(normalizeWarningRow)
  const allForecast = rawForecast.map(normalizeForecastRow)
  const windows = rawWindows.map(normalizeWindowRow)
  const allIndicators = rawIndicators.map(normalizeIndicatorRow)

  const { startedMs, cutoffMs } = selectLatestJpsPoll(allPolls)
  const tEvalMs = Math.floor(startedMs / MINUTE_MS) * MINUTE_MS
  const tEval = toMytIso(new Date(tEvalMs))

  const polls = allPolls.filter(
    (poll) =>
      isReceivedByCutoff(poll.received_at ?? poll.started_at, cutoffMs) && isReceivedByCutoff(poll.started_at, cutoffMs)
  )
  const readings = allReadings.filter((reading) => isReceivedByCutoff(reading.received_at, cutoffMs))
  const warnings = allWarnings.filter((warning) =>
    isReceivedByCutoff(warning.first_seen_at ?? warning.last_seen_at ?? warning.issued, cutoffMs)
  )
  const forecast = allForecast.filter((row) => isReceivedByCutoff(row.first_seen_at, cutoffMs))
  const previousIndicators = allIndicators.filter((row) => {
    const snapMs = parseInstantMs(row.snapshot_id)
    return snapMs === null || snapMs < tEvalMs
  })

  const normalizedDaylight: DaylightWindow = {
    start: String(normalizeWindowTimeCell(daylight.start) ?? daylight.start),
    end: String(normalizeWindowTimeCell(daylight.end) ?? daylight.end)
  }

  const snapshot = computeSkySnapshot({
    tEval,
    sources,
    readings,
    polls,
    warnings,
    forecast,
    windows,
    previousIndicators,
    daylight: normalizedDaylight
  })

  store.replaceNow(snapshot.nowRows)

  const existingKeys = new Set(allIndicators.map(indicatorKey))
  const missingIndicators: Row<'indicators'>[] = []
  for (const row of snapshot.indicatorRows) {
    const key = indicatorKey(row)
    if (!existingKeys.has(key)) {
      existingKeys.add(key)
      missingIndicators.push(row)
    }
  }
  if (missingIndicators.length > 0) {
    store.appendIndicators(missingIndicators)
  }

  const existingSourceIds = new Set(
    sources.map((row) => (typeof row.source_id === 'string' ? row.source_id : '')).filter((id) => id.length > 0)
  )
  const sourceUpdates: SourceStateUpdate[] = snapshot.sourceUpdates
    .filter((update) => typeof update.source_id === 'string' && existingSourceIds.has(update.source_id))
    .map((update) => ({
      source_id: update.source_id,
      state: update.state ?? '',
      state_since: update.state_since ?? ''
    }))
  if (sourceUpdates.length > 0) {
    store.updateSourceStates(sourceUpdates)
  }

  return snapshot
}

// The 5-minute evaluation tick. #51's JPS handler calls executeEvaluationTick under the polling lock.
export function executeEvaluationTick(): SkySnapshot {
  const sheetId = getProperty('SHEET_ID')
  if (!sheetId || !sheetId.trim()) {
    throw new Error('SHEET_ID is not set; run setup()')
  }
  const start = requireDaylightTime('CAMERA_DAY_START', getProperty('CAMERA_DAY_START'))
  const end = requireDaylightTime('CAMERA_DAY_END', getProperty('CAMERA_DAY_END'))
  const store = skyEvaluationStore(sheetId)
  return runSkyEvaluation({ store, daylight: { start, end } })
}

export function runEvaluationTick(): SkySnapshot {
  return withLock(() => executeEvaluationTick())
}
