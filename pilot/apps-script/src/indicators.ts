import { toMytIso } from '../../shared/time.ts'
import type { Cell, Row } from './schema.ts'

export const GAUGE_SOURCE_ID = '0232901RF'
export const BOUND_APIMS_STATION_IDS = ['CA16W', 'CA19B', 'CA17W'] as const
export const MET_WARNING_SOURCE_ID = 'met_warning'
export const MET_FORECAST_SOURCE_ID = 'Ds058'

export type BoundApimsStationId = (typeof BOUND_APIMS_STATION_IDS)[number]

export type SourceState = 'fresh' | 'stale' | 'error' | 'recovered' | 'probation' | 'off_hours'

export interface DaylightWindow {
  start: string
  end: string
}

export interface ResolvedInputState {
  state: SourceState | null
  stateSince: string | null
  ageMin: number | null
  sourceIds: string[]
  readingIds: string[]
  observedAt: string | null
}

export interface ApimsInputState extends ResolvedInputState {
  stations: Record<BoundApimsStationId, ResolvedInputState>
}

export interface SkyInputsState {
  gauge: ResolvedInputState
  apims: ApimsInputState
  met: ResolvedInputState
  camera: ResolvedInputState
}

export interface IndicatorEvidence extends ResolvedInputState {
  scope: string
  name: string
  value: Cell
  unit: string
}

export type SourceStateUpdate = Pick<Row<'sources'>, 'source_id' | 'state' | 'state_since'>

export interface SkySnapshotInput {
  tEval: string
  sources: readonly Row<'sources'>[]
  readings: readonly Row<'readings'>[]
  polls: readonly Row<'polls'>[]
  warnings: readonly Row<'warnings'>[]
  forecast: readonly Row<'forecast'>[]
  windows: readonly Row<'windows'>[]
  previousIndicators?: readonly Row<'indicators'>[]
  daylight: DaylightWindow
}

export interface SkySnapshot {
  nowRows: Row<'now'>[]
  indicatorRows: Row<'indicators'>[]
  sourceUpdates: SourceStateUpdate[]
  inputs: SkyInputsState
  sourceStates: Record<string, ResolvedInputState>
  evidenceByScope: Record<string, Record<string, IndicatorEvidence>>
}

interface NormalizedReading {
  readingId: string
  sourceKind: string
  sourceId: string
  metric: string
  observedAt: string
  observedAtMs: number
  receivedAt: string | null
  receivedAtMs: number | null
  value: number
  unit: string
  pollId: string
  revision: number
}

interface NormalizedPoll {
  pollId: string
  sourceKind: string
  sourceId: string
  startedAt: string | null
  startedAtMs: number | null
  receivedAt: string | null
  receivedAtMs: number | null
  effectiveAt: string
  effectiveAtMs: number
  outcome: string
}

interface WindowScope {
  windowId: string
  date: string
  startIso: string
  startMs: number
  endIso: string
  endMs: number
  spanFromIso: string
  spanFromMs: number
  spanToIso: string
  spanToMs: number
}

const MINUTE_MS = 60_000
const VALID_STATES = new Set<SourceState>(['fresh', 'stale', 'error', 'recovered', 'probation', 'off_hours'])

function normalizeIsoCell(cell: Cell | undefined): string | null {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : null
  }
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) return null
  return toMytIso(new Date(ms))
}

function parseTimestampMs(cell: Cell | undefined): number | null {
  const iso = normalizeIsoCell(cell)
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

function floorToMinuteMs(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS
}

function parseClockMinutes(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clock.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function isWithinDaylight(isoInMyt: string, daylight: DaylightWindow): boolean {
  const startMin = parseClockMinutes(daylight.start)
  const endMin = parseClockMinutes(daylight.end)
  const currentMin = parseClockMinutes(isoInMyt.slice(11, 16))
  if (startMin === null || endMin === null || currentMin === null) return true
  return currentMin >= startMin && currentMin < endMin
}

function parseSourceState(cell: Cell | undefined): SourceState | null {
  if (typeof cell !== 'string') return null
  const trimmed = cell.trim() as SourceState
  return VALID_STATES.has(trimmed) ? trimmed : null
}

function emptyInputState(sourceIds: string[] = []): ResolvedInputState {
  return {
    state: null,
    stateSince: null,
    ageMin: null,
    sourceIds,
    readingIds: [],
    observedAt: null
  }
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function normalizeAndDedupeReadings(readings: readonly Row<'readings'>[], tEvalMs: number): NormalizedReading[] {
  const byIdentity = new Map<string, NormalizedReading>()
  for (const row of readings) {
    const sourceId = String(row.source_id ?? '').trim()
    const sourceKind = String(row.source_kind ?? '').trim()
    const metric = String(row.metric ?? '').trim()
    const observedAt = normalizeIsoCell(row.observed_at)
    if (!sourceId || !metric || !observedAt) continue
    const observedAtMs = Date.parse(observedAt)
    if (!Number.isFinite(observedAtMs) || observedAtMs > tEvalMs) continue
    const numValue = typeof row.value === 'number' ? row.value : Number(row.value)
    if (row.value === '' || row.value === undefined || !Number.isFinite(numValue)) continue

    const receivedAt = normalizeIsoCell(row.received_at)
    const receivedAtMs = receivedAt ? Date.parse(receivedAt) : null
    const revisionRaw = typeof row.revision === 'number' ? row.revision : Number(row.revision ?? 0)
    const revision = Number.isFinite(revisionRaw) ? revisionRaw : 0
    const readingId = String(row.reading_id ?? '').trim() || `${sourceId}:${metric}:${observedAt}`
    const unit = String(row.unit ?? '').trim()
    const pollId = String(row.poll_id ?? '').trim()

    const identityKey = `${sourceId}|${metric}|${observedAt}`
    const existing = byIdentity.get(identityKey)
    if (!existing || revision >= existing.revision) {
      byIdentity.set(identityKey, {
        readingId,
        sourceKind,
        sourceId,
        metric,
        observedAt,
        observedAtMs,
        receivedAt,
        receivedAtMs,
        value: numValue,
        unit,
        pollId,
        revision
      })
    }
  }
  return Array.from(byIdentity.values()).sort((a, b) => a.observedAtMs - b.observedAtMs)
}

function normalizePolls(polls: readonly Row<'polls'>[], tEvalMs: number): NormalizedPoll[] {
  const evalMinuteMs = floorToMinuteMs(tEvalMs)
  const result: NormalizedPoll[] = []
  for (const row of polls) {
    const sourceId = String(row.source_id ?? '').trim()
    const sourceKind = String(row.source_kind ?? '').trim()
    const outcome = String(row.outcome ?? '').trim()
    if (!sourceId && !sourceKind) continue

    const startedAt = normalizeIsoCell(row.started_at)
    const receivedAt = normalizeIsoCell(row.received_at)
    const effectiveAt = receivedAt ?? startedAt
    if (!effectiveAt) continue
    const effectiveAtMs = Date.parse(effectiveAt)
    const startedAtMs = startedAt ? Date.parse(startedAt) : null
    const receivedAtMs = receivedAt ? Date.parse(receivedAt) : null
    const gateMs = startedAtMs ?? effectiveAtMs
    if (floorToMinuteMs(gateMs) > evalMinuteMs) continue

    result.push({
      pollId: String(row.poll_id ?? '').trim(),
      sourceKind,
      sourceId,
      startedAt,
      startedAtMs,
      receivedAt,
      receivedAtMs,
      effectiveAt,
      effectiveAtMs,
      outcome
    })
  }
  return result
}

function pollsForSource(
  source: Row<'sources'>,
  polls: readonly NormalizedPoll[],
  sourceReadings: readonly NormalizedReading[]
): NormalizedPoll[] {
  const sourceId = String(source.source_id ?? '').trim()
  const kind = String(source.kind ?? '').trim()
  const readingPollIds = new Set(sourceReadings.map((r) => r.pollId).filter(Boolean))
  const isBoundApims = kind === 'apims' && (BOUND_APIMS_STATION_IDS as readonly string[]).includes(sourceId)

  return polls.filter((poll) => {
    if (poll.sourceId === sourceId) return true
    if (poll.pollId && readingPollIds.has(poll.pollId)) return true
    if (isBoundApims && poll.sourceKind === 'apims') {
      const pointsToSpecificStation = (BOUND_APIMS_STATION_IDS as readonly string[]).includes(poll.sourceId)
      return !pointsToSpecificStation
    }
    if (kind && poll.sourceKind === kind && poll.sourceId === kind) return true
    return false
  })
}

function latestPollOf(polls: readonly NormalizedPoll[]): NormalizedPoll | null {
  let best: NormalizedPoll | null = null
  for (const poll of polls) {
    if (!best || poll.effectiveAtMs >= best.effectiveAtMs) {
      best = poll
    }
  }
  return best
}

function parseReadingIdList(raw: Cell | undefined): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function extractObservedAtFromReadingId(readingId: string, sourceId: string): string | null {
  const prefix = `${sourceId}:`
  if (!readingId.startsWith(prefix)) return null
  const secondColon = readingId.indexOf(':', prefix.length)
  if (secondColon === -1) return null
  return normalizeIsoCell(readingId.slice(secondColon + 1))
}

function diagnosticNameForKind(kind: string): string {
  if (kind === 'jps_rain') return 'age_min_gauge'
  if (kind === 'apims') return 'age_min_apims'
  if (kind === 'camera') return 'age_min_camera'
  if (kind === 'met_forecast') return 'age_min_forecast'
  return 'age_min_met'
}

function findCheckpointObservedAt(
  source: Row<'sources'>,
  stateSinceIso: string | null,
  previousIndicators: readonly Row<'indicators'>[]
): string | null {
  if (!stateSinceIso) return null
  const sourceId = String(source.source_id ?? '').trim()
  const diagName = diagnosticNameForKind(String(source.kind ?? '').trim())
  const checkpointRow = previousIndicators.find((row) => {
    const snapIso = normalizeIsoCell(row.snapshot_id)
    return snapIso === stateSinceIso && String(row.name ?? '') === diagName
  })
  if (!checkpointRow) return null

  const readingIds = parseReadingIdList(checkpointRow.reading_ids)
  for (const rid of readingIds) {
    const extracted = extractObservedAtFromReadingId(rid, sourceId)
    if (extracted) return extracted
  }
  return normalizeIsoCell(checkpointRow.observed_at)
}

function expectedMetricForKind(kind: string): string | null {
  if (kind === 'jps_rain') return 'rain_5m_mm'
  if (kind === 'apims') return 'api'
  if (kind === 'camera') return 'contrast_far'
  return null
}

function resolveSingleSourceState(
  source: Row<'sources'> | undefined,
  readings: readonly NormalizedReading[],
  polls: readonly NormalizedPoll[],
  previousIndicators: readonly Row<'indicators'>[],
  daylight: DaylightWindow,
  tEvalIso: string,
  tEvalMs: number
): ResolvedInputState {
  if (!source) return emptyInputState()
  const sourceId = String(source.source_id ?? '').trim()
  const kind = String(source.kind ?? '').trim()
  const freshness = String(source.freshness ?? '').trim()
  const staleAfterMin = Number(source.stale_after_min)
  if (!sourceId || !Number.isFinite(staleAfterMin) || staleAfterMin <= 0) {
    return emptyInputState(sourceId ? [sourceId] : [])
  }
  if (freshness !== 'observed' && freshness !== 'polled') {
    return emptyInputState([sourceId])
  }

  const priorState = parseSourceState(source.state)
  const priorStateSince = normalizeIsoCell(source.state_since)
  const priorStateSinceMs = priorStateSince ? Date.parse(priorStateSince) : null

  const metric = expectedMetricForKind(kind)
  const sourceReadings = readings.filter((r) => r.sourceId === sourceId && (!metric || r.metric === metric))
  const newestReading = sourceReadings.length > 0 ? sourceReadings[sourceReadings.length - 1]! : null
  const matchingPolls = pollsForSource(source, polls, sourceReadings)
  const latestPoll = latestPollOf(matchingPolls)
  const latestOkPoll = latestPollOf(matchingPolls.filter((p) => p.outcome === 'ok' || p.outcome === 'unchanged'))

  const observedAt =
    freshness === 'observed' ? (newestReading?.observedAt ?? null) : (latestOkPoll?.effectiveAt ?? null)
  const observedAtMs = observedAt ? Date.parse(observedAt) : null
  const ageMin = observedAtMs !== null ? Math.max(0, Math.floor((tEvalMs - observedAtMs) / MINUTE_MS)) : null
  const readingIds = freshness === 'observed' && newestReading ? [newestReading.readingId] : []

  const finalize = (nextState: SourceState): ResolvedInputState => ({
    state: nextState,
    stateSince: priorState === nextState && priorStateSince ? priorStateSince : tEvalIso,
    ageMin,
    sourceIds: [sourceId],
    readingIds,
    observedAt
  })

  if (kind === 'camera' && !isWithinDaylight(tEvalIso, daylight)) {
    return finalize('off_hours')
  }

  if (latestPoll && latestPoll.outcome !== 'ok' && latestPoll.outcome !== 'unchanged') {
    return finalize('error')
  }

  const checkpointObservedAt =
    priorState === 'error' || priorState === 'stale' || priorState === 'recovered'
      ? findCheckpointObservedAt(source, priorStateSince, previousIndicators)
      : null
  const checkpointMs = checkpointObservedAt ? Date.parse(checkpointObservedAt) : null
  const hasValidCheckpoint = checkpointMs !== null && Number.isFinite(checkpointMs)

  if (priorState === 'error') {
    if (freshness === 'polled') {
      const hasNewerPollAfterError =
        latestOkPoll !== null &&
        (hasValidCheckpoint
          ? latestOkPoll.effectiveAtMs > checkpointMs
          : priorStateSinceMs === null || latestOkPoll.effectiveAtMs > priorStateSinceMs)
      if (!hasNewerPollAfterError) {
        return finalize('error')
      }
    } else {
      const hasNewerObservationAfterError =
        observedAtMs !== null &&
        (hasValidCheckpoint
          ? observedAtMs > checkpointMs
          : priorStateSinceMs !== null && observedAtMs > priorStateSinceMs)
      if (!hasNewerObservationAfterError) {
        return finalize('error')
      }
    }
  }

  if (ageMin === null || ageMin > staleAfterMin) {
    return finalize('stale')
  }

  if (priorState === 'stale' && hasValidCheckpoint && (observedAtMs === null || observedAtMs <= checkpointMs)) {
    return finalize('stale')
  }

  if (kind === 'camera' && Boolean(source.probation)) {
    return finalize('probation')
  }

  if (priorState === 'stale' || priorState === 'error') {
    return finalize('recovered')
  }

  if (priorState === 'recovered') {
    if (!hasValidCheckpoint || observedAtMs === null || observedAtMs <= checkpointMs) {
      return finalize('recovered')
    }
    return finalize('fresh')
  }

  return finalize('fresh')
}

function stateSeverityRank(state: SourceState | null): number {
  switch (state) {
    case null:
      return 6
    case 'error':
      return 5
    case 'stale':
      return 4
    case 'recovered':
      return 3
    case 'probation':
      return 2
    case 'off_hours':
      return 1
    case 'fresh':
      return 0
  }
}

function aggregateApimsState(stations: Record<BoundApimsStationId, ResolvedInputState>): ApimsInputState {
  const stationEntries = BOUND_APIMS_STATION_IDS.map((id) => ({ id, resolved: stations[id] }))
  const configuredIds = stationEntries.filter((s) => s.resolved.sourceIds.length > 0).map((s) => s.id)

  let worstRank = -1
  let worstState: SourceState | null = 'fresh'
  for (const { resolved } of stationEntries) {
    const rank = stateSeverityRank(resolved.state)
    if (rank > worstRank) {
      worstRank = rank
      worstState = resolved.state
    }
  }

  let oldestAgeMin: number | null = null
  let oldestObservedAt: string | null = null
  let oldestObservedAtMs: number | null = null
  const readingIds: string[] = []

  for (const { resolved } of stationEntries) {
    for (const rid of resolved.readingIds) readingIds.push(rid)
    if (resolved.ageMin !== null && (oldestAgeMin === null || resolved.ageMin > oldestAgeMin)) {
      oldestAgeMin = resolved.ageMin
    }
    if (resolved.observedAt) {
      const ms = Date.parse(resolved.observedAt)
      if (Number.isFinite(ms) && (oldestObservedAtMs === null || ms < oldestObservedAtMs)) {
        oldestObservedAtMs = ms
        oldestObservedAt = resolved.observedAt
      }
    }
  }

  let stateSince: string | null = null
  if (worstState !== null) {
    const matchingSince = stationEntries
      .filter((s) => s.resolved.state === worstState && s.resolved.stateSince !== null)
      .map((s) => s.resolved.stateSince!)
    if (matchingSince.length > 0) {
      matchingSince.sort((a, b) => Date.parse(a) - Date.parse(b))
      stateSince = worstState === 'fresh' ? matchingSince[matchingSince.length - 1]! : matchingSince[0]!
    }
  }

  return {
    state: worstState,
    stateSince,
    ageMin: oldestAgeMin,
    sourceIds: configuredIds,
    readingIds,
    observedAt: oldestObservedAt,
    stations
  }
}

function parseWindowBound(raw: Cell | undefined, dateStr: string): { iso: string; ms: number } | null {
  const directIso = normalizeIsoCell(raw)
  if (directIso) {
    return { iso: directIso, ms: Date.parse(directIso) }
  }
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const sec = match[3] ?? '00'
  const combined = `${dateStr}T${match[1]}:${match[2]}:${sec}+08:00`
  const ms = Date.parse(combined)
  if (!Number.isFinite(ms)) return null
  return { iso: toMytIso(new Date(ms)), ms }
}

function resolveActiveWindowScopes(
  windows: readonly Row<'windows'>[],
  evalDate: string,
  tEvalMs: number
): WindowScope[] {
  const result: WindowScope[] = []
  const seenIds = new Set<string>()

  for (const row of windows) {
    const windowId = String(row.window_id ?? '').trim()
    if (!windowId || seenIds.has(windowId)) continue
    const status = String(row.status ?? 'active')
      .trim()
      .toLowerCase()
    if (status && status !== 'active') continue

    const rawDate = String(row.date ?? '').trim()
    const endParsed = parseWindowBound(row.end_myt, rawDate || evalDate)
    if (!endParsed) continue
    const windowDate = rawDate || endParsed.iso.slice(0, 10)
    const startParsed = parseWindowBound(row.start_myt, windowDate)
    if (!startParsed) continue

    const spanFromMs = endParsed.ms - 30 * MINUTE_MS
    const spanToMs = endParsed.ms + 60 * MINUTE_MS
    const isDatedToday = windowDate === evalDate
    const isSpanStillOpen = tEvalMs >= spanFromMs && tEvalMs <= spanToMs
    if (!isDatedToday && !isSpanStillOpen) continue

    seenIds.add(windowId)
    result.push({
      windowId,
      date: windowDate,
      startIso: startParsed.iso,
      startMs: startParsed.ms,
      endIso: endParsed.iso,
      endMs: endParsed.ms,
      spanFromIso: toMytIso(new Date(spanFromMs)),
      spanFromMs,
      spanToIso: toMytIso(new Date(spanToMs)),
      spanToMs
    })
  }
  return result
}

function isUsableMeasurementState(state: SourceState | null): boolean {
  return state === 'fresh' || state === 'recovered' || state === 'probation'
}

interface RollingRainMaximum {
  value: number
  observedAt: string
  ageMin: number
  readingIds: string[]
}

function computeRollingRainMax(
  gaugeReadings: readonly NormalizedReading[],
  spanFromMs: number,
  spanToMs: number,
  tEvalMs: number,
  windowMinutes: number
): RollingRainMaximum | null {
  const upperBoundMs = Math.min(spanToMs, tEvalMs)
  if (upperBoundMs < spanFromMs) return null

  const stamps = gaugeReadings.filter((r) => r.observedAtMs >= spanFromMs && r.observedAtMs <= upperBoundMs)
  if (stamps.length === 0) return null

  const durationMs = windowMinutes * MINUTE_MS
  let best: RollingRainMaximum | null = null

  for (const stamp of stamps) {
    const windowStartExclusive = stamp.observedAtMs - durationMs
    const contributing = gaugeReadings.filter(
      (r) => r.observedAtMs > windowStartExclusive && r.observedAtMs <= stamp.observedAtMs
    )
    const total = roundMetric(contributing.reduce((sum, r) => sum + r.value, 0))
    if (!best || total > best.value) {
      best = {
        value: total,
        observedAt: stamp.observedAt,
        ageMin: Math.max(0, Math.floor((tEvalMs - stamp.observedAtMs) / MINUTE_MS)),
        readingIds: contributing.map((r) => r.readingId)
      }
    }
  }

  return best
}

function computeApimsSiteIndicators(
  apimsState: ApimsInputState,
  readings: readonly NormalizedReading[],
  tEvalMs: number
): {
  apiMax: Cell
  apiMaxStation: Cell
  apiMaxObs: string | null
  apiMaxAge: number | null
  apiMaxReadingIds: string[]
  apiMaxSourceIds: string[]
  api0600: Cell
  api0600Obs: string | null
  api0600Age: number | null
  api0600ReadingIds: string[]
} {
  if (!isUsableMeasurementState(apimsState.state) || apimsState.sourceIds.length < BOUND_APIMS_STATION_IDS.length) {
    return {
      apiMax: '',
      apiMaxStation: '',
      apiMaxObs: null,
      apiMaxAge: null,
      apiMaxReadingIds: [],
      apiMaxSourceIds: apimsState.sourceIds,
      api0600: '',
      api0600Obs: null,
      api0600Age: null,
      api0600ReadingIds: []
    }
  }

  let bestReading: NormalizedReading | null = null
  for (const stationId of BOUND_APIMS_STATION_IDS) {
    const stationReadings = readings.filter((r) => r.sourceId === stationId && r.metric === 'api')
    const latest = stationReadings.length > 0 ? stationReadings[stationReadings.length - 1]! : null
    if (!latest) continue
    if (
      !bestReading ||
      latest.value > bestReading.value ||
      (latest.value === bestReading.value && latest.observedAtMs < bestReading.observedAtMs)
    ) {
      bestReading = latest
    }
  }

  const historyByStation: Record<string, Array<{ date: string; value: number }>> = {}
  const historyReadingIds: string[] = []
  let newest0600Ms: number | null = null
  let newest0600Obs: string | null = null

  for (const stationId of BOUND_APIMS_STATION_IDS) {
    const morningReadings = readings
      .filter((r) => r.sourceId === stationId && r.metric === 'api' && r.observedAt.slice(11, 19) === '06:00:00')
      .sort((a, b) => b.observedAtMs - a.observedAtMs)
      .slice(0, 3)

    historyByStation[stationId] = morningReadings.map((r) => {
      historyReadingIds.push(r.readingId)
      if (newest0600Ms === null || r.observedAtMs > newest0600Ms) {
        newest0600Ms = r.observedAtMs
        newest0600Obs = r.observedAt
      }
      return {
        date: r.observedAt.slice(0, 10),
        value: r.value
      }
    })
  }

  return {
    apiMax: bestReading ? bestReading.value : '',
    apiMaxStation: bestReading ? bestReading.sourceId : '',
    apiMaxObs: bestReading ? bestReading.observedAt : null,
    apiMaxAge: bestReading ? Math.max(0, Math.floor((tEvalMs - bestReading.observedAtMs) / MINUTE_MS)) : null,
    apiMaxReadingIds: bestReading ? [bestReading.readingId] : [],
    apiMaxSourceIds: bestReading ? [bestReading.sourceId] : apimsState.sourceIds,
    api0600: JSON.stringify(historyByStation),
    api0600Obs: newest0600Obs ?? apimsState.observedAt,
    api0600Age:
      newest0600Ms !== null ? Math.max(0, Math.floor((tEvalMs - newest0600Ms) / MINUTE_MS)) : apimsState.ageMin,
    api0600ReadingIds: historyReadingIds
  }
}

function computeCameraAndFrameRainIndicators(
  cameraState: ResolvedInputState,
  gaugeState: ResolvedInputState,
  cameraReadings: readonly NormalizedReading[],
  gaugeReadings: readonly NormalizedReading[],
  daylight: DaylightWindow,
  tEvalMs: number
): {
  farRatioLast3: Cell
  farRatioObs: string | null
  farRatioAge: number | null
  farRatioReadingIds: string[]
  rainLast3Frames: Cell
  rainLast3Obs: string | null
  rainLast3Age: number | null
  rainLast3ReadingIds: string[]
} {
  if (!isUsableMeasurementState(cameraState.state)) {
    return {
      farRatioLast3: '',
      farRatioObs: null,
      farRatioAge: null,
      farRatioReadingIds: [],
      rainLast3Frames: '',
      rainLast3Obs: null,
      rainLast3Age: null,
      rainLast3ReadingIds: []
    }
  }

  const daylightFrames = cameraReadings
    .filter((r) => isWithinDaylight(r.observedAt, daylight))
    .sort((a, b) => b.observedAtMs - a.observedAtMs)
    .slice(0, 3)

  if (daylightFrames.length === 0) {
    return {
      farRatioLast3: '',
      farRatioObs: null,
      farRatioAge: null,
      farRatioReadingIds: [],
      rainLast3Frames: '',
      rainLast3Obs: null,
      rainLast3Age: null,
      rainLast3ReadingIds: []
    }
  }

  const newestFrame = daylightFrames[0]!
  const oldestFrame = daylightFrames[daylightFrames.length - 1]!
  const farRatioJson = JSON.stringify(
    daylightFrames.map((f) => ({
      value: f.value,
      observed_at: f.observedAt
    }))
  )
  const frameReadingIds = daylightFrames.map((f) => f.readingId)
  const newestFrameAge = Math.max(0, Math.floor((tEvalMs - newestFrame.observedAtMs) / MINUTE_MS))

  if (
    gaugeState.state !== 'fresh' ||
    daylightFrames.length < 3 ||
    oldestFrame.observedAtMs >= newestFrame.observedAtMs
  ) {
    return {
      farRatioLast3: farRatioJson,
      farRatioObs: newestFrame.observedAt,
      farRatioAge: newestFrameAge,
      farRatioReadingIds: frameReadingIds,
      rainLast3Frames: '',
      rainLast3Obs: null,
      rainLast3Age: null,
      rainLast3ReadingIds: []
    }
  }

  const spanGaugeReadings = gaugeReadings.filter(
    (r) => r.observedAtMs > oldestFrame.observedAtMs && r.observedAtMs <= newestFrame.observedAtMs
  )
  const rainSum = roundMetric(spanGaugeReadings.reduce((sum, r) => sum + r.value, 0))
  const newestGaugeInSpan = spanGaugeReadings.length > 0 ? spanGaugeReadings[spanGaugeReadings.length - 1]! : null

  return {
    farRatioLast3: farRatioJson,
    farRatioObs: newestFrame.observedAt,
    farRatioAge: newestFrameAge,
    farRatioReadingIds: frameReadingIds,
    rainLast3Frames: rainSum,
    rainLast3Obs: newestGaugeInSpan?.observedAt ?? newestFrame.observedAt,
    rainLast3Age: newestGaugeInSpan
      ? Math.max(0, Math.floor((tEvalMs - newestGaugeInSpan.observedAtMs) / MINUTE_MS))
      : newestFrameAge,
    rainLast3ReadingIds: [...spanGaugeReadings.map((r) => r.readingId), ...frameReadingIds]
  }
}

function computeForecastIndicator(
  forecastState: ResolvedInputState,
  forecastRows: readonly Row<'forecast'>[],
  forecastSourceId: string | null,
  evalDate: string,
  tEvalMs: number
): {
  value: Cell
  observedAt: string | null
  ageMin: number | null
} {
  if (!isUsableMeasurementState(forecastState.state) || !forecastSourceId) {
    return { value: '', observedAt: null, ageMin: null }
  }

  const evalMinuteMs = floorToMinuteMs(tEvalMs)
  let bestRow: Row<'forecast'> | null = null
  let bestSeenMs = -1
  let bestSeenIso: string | null = null

  for (const row of forecastRows) {
    if (String(row.date ?? '').trim() !== evalDate) continue
    const locId = String(row.location_id ?? '').trim()
    if (locId && locId !== forecastSourceId) continue
    if (typeof row.afternoon_thunderstorm !== 'boolean') continue

    const seenIso = normalizeIsoCell(row.first_seen_at)
    if (!seenIso) continue
    const seenMs = Date.parse(seenIso)
    if (!Number.isFinite(seenMs) || floorToMinuteMs(seenMs) > evalMinuteMs) continue

    if (seenMs >= bestSeenMs) {
      bestSeenMs = seenMs
      bestSeenIso = seenIso
      bestRow = row
    }
  }

  if (!bestRow || !bestSeenIso) {
    return { value: '', observedAt: null, ageMin: null }
  }

  return {
    value: Boolean(bestRow.afternoon_thunderstorm),
    observedAt: bestSeenIso,
    ageMin: Math.max(0, Math.floor((tEvalMs - bestSeenMs) / MINUTE_MS))
  }
}

function computeWindowWarningIndicators(
  metState: ResolvedInputState,
  warnings: readonly Row<'warnings'>[],
  windowScope: WindowScope,
  tEvalMs: number
): {
  inForce: Cell
  warningKeysJson: Cell
  warningKeys: string[]
} {
  if (!isUsableMeasurementState(metState.state)) {
    return { inForce: '', warningKeysJson: '', warningKeys: [] }
  }

  const evalMinuteMs = floorToMinuteMs(tEvalMs)
  const matchingKeys: string[] = []
  const seenKeys = new Set<string>()

  for (const row of warnings) {
    if (row.names_kl !== true) continue
    const titleEn = String(row.title_en ?? '')
    const textEn = String(row.text_en ?? '')
    if (/no advisory/i.test(titleEn)) continue
    if (/strong winds and rough seas/i.test(titleEn) || /for malaysian waters/i.test(textEn)) continue

    const validFromIso = normalizeIsoCell(row.valid_from)
    const validToIso = normalizeIsoCell(row.valid_to)
    if (!validFromIso || !validToIso) continue
    const validFromMs = Date.parse(validFromIso)
    const validToMs = Date.parse(validToIso)
    if (!Number.isFinite(validFromMs) || !Number.isFinite(validToMs) || validFromMs > validToMs) continue

    const firstSeenMs = parseTimestampMs(row.first_seen_at)
    if (firstSeenMs !== null && floorToMinuteMs(firstSeenMs) > evalMinuteMs) continue

    if (validFromMs <= windowScope.endMs && validToMs >= windowScope.startMs) {
      const key = String(row.warning_key ?? '').trim()
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key)
        matchingKeys.push(key)
      }
    }
  }

  return {
    inForce: matchingKeys.length > 0,
    warningKeysJson: JSON.stringify(matchingKeys),
    warningKeys: matchingKeys
  }
}

export function computeSkySnapshot(input: SkySnapshotInput): SkySnapshot {
  const tEvalIso = normalizeIsoCell(input.tEval)
  if (!tEvalIso) {
    throw new Error(`Invalid tEval timestamp: ${String(input.tEval)}`)
  }
  const tEvalMs = Date.parse(tEvalIso)
  const evalDate = tEvalIso.slice(0, 10)
  const previousIndicators = input.previousIndicators ?? []

  const readings = normalizeAndDedupeReadings(input.readings, tEvalMs)
  const polls = normalizePolls(input.polls, tEvalMs)

  const sourceById = new Map<string, Row<'sources'>>()
  for (const src of input.sources) {
    const id = String(src.source_id ?? '').trim()
    if (id) sourceById.set(id, src)
  }

  const gaugeSource = sourceById.get(GAUGE_SOURCE_ID)
  const metWarningSource = sourceById.get(MET_WARNING_SOURCE_ID)
  const metForecastSource = sourceById.get(MET_FORECAST_SOURCE_ID)
  const cameraSource = input.sources.find((s) => String(s.kind ?? '').trim() === 'camera')

  const sourceStates: Record<string, ResolvedInputState> = {}
  const sourceUpdates: SourceStateUpdate[] = []

  for (const src of input.sources) {
    const id = String(src.source_id ?? '').trim()
    if (!id) continue
    const resolved = resolveSingleSourceState(
      src,
      readings,
      polls,
      previousIndicators,
      input.daylight,
      tEvalIso,
      tEvalMs
    )
    sourceStates[id] = resolved
    if (resolved.state !== null && resolved.stateSince !== null) {
      sourceUpdates.push({
        source_id: id,
        state: resolved.state,
        state_since: resolved.stateSince
      })
    }
  }

  const gaugeState = gaugeSource
    ? (sourceStates[String(gaugeSource.source_id).trim()] ?? emptyInputState())
    : emptyInputState()

  const apimsStations = {
    CA16W: sourceStates.CA16W ?? emptyInputState(),
    CA19B: sourceStates.CA19B ?? emptyInputState(),
    CA17W: sourceStates.CA17W ?? emptyInputState()
  } satisfies Record<BoundApimsStationId, ResolvedInputState>
  const apimsState = aggregateApimsState(apimsStations)

  const metState = metWarningSource
    ? (sourceStates[String(metWarningSource.source_id).trim()] ?? emptyInputState())
    : emptyInputState()

  const forecastSourceId = metForecastSource ? String(metForecastSource.source_id ?? '').trim() : null
  const forecastState = forecastSourceId ? (sourceStates[forecastSourceId] ?? emptyInputState()) : emptyInputState()

  const cameraSourceId = cameraSource ? String(cameraSource.source_id ?? '').trim() : null
  const cameraState = cameraSourceId ? (sourceStates[cameraSourceId] ?? emptyInputState()) : emptyInputState()

  const inputs: SkyInputsState = {
    gauge: gaugeState,
    apims: apimsState,
    met: metState,
    camera: cameraState
  }

  const gaugeSourceId = gaugeSource ? String(gaugeSource.source_id ?? '').trim() : GAUGE_SOURCE_ID
  const gaugeReadings = readings.filter((r) => r.sourceId === gaugeSourceId && r.metric === 'rain_5m_mm')
  const cameraReadings = cameraSourceId
    ? readings.filter((r) => r.sourceId === cameraSourceId && r.metric === 'contrast_far')
    : []

  const apimsIndicators = computeApimsSiteIndicators(apimsState, readings, tEvalMs)
  const cameraIndicators = computeCameraAndFrameRainIndicators(
    cameraState,
    gaugeState,
    cameraReadings,
    gaugeReadings,
    input.daylight,
    tEvalMs
  )
  const forecastIndicator = computeForecastIndicator(forecastState, input.forecast, forecastSourceId, evalDate, tEvalMs)

  const indicatorRows: Row<'indicators'>[] = []
  const evidenceByScope: Record<string, Record<string, IndicatorEvidence>> = { site: {} }

  const recordIndicator = (
    scope: string,
    name: string,
    value: Cell,
    unit: string,
    baseState: ResolvedInputState,
    overrideMeta?: {
      observedAt?: string | null
      ageMin?: number | null
      readingIds?: string[]
      sourceIds?: string[]
    }
  ): IndicatorEvidence => {
    const isBlank = value === ''
    const observedAt = overrideMeta?.observedAt !== undefined ? overrideMeta.observedAt : baseState.observedAt
    const ageMin = overrideMeta?.ageMin !== undefined ? overrideMeta.ageMin : baseState.ageMin
    const readingIds = overrideMeta?.readingIds !== undefined ? overrideMeta.readingIds : baseState.readingIds
    const sourceIds = overrideMeta?.sourceIds !== undefined ? overrideMeta.sourceIds : baseState.sourceIds

    indicatorRows.push({
      snapshot_id: tEvalIso,
      scope,
      name,
      value,
      unit,
      observed_at: isBlank ? '' : (observedAt ?? ''),
      age_min: isBlank ? '' : (ageMin ?? ''),
      state: baseState.state ?? '',
      reading_ids: JSON.stringify(isBlank ? [] : readingIds)
    })

    const evidence: IndicatorEvidence = {
      scope,
      name,
      value,
      unit,
      state: baseState.state,
      stateSince: baseState.stateSince,
      ageMin: isBlank ? baseState.ageMin : ageMin,
      sourceIds,
      readingIds: isBlank ? baseState.readingIds : readingIds,
      observedAt: isBlank ? baseState.observedAt : observedAt
    }
    if (!evidenceByScope[scope]) evidenceByScope[scope] = {}
    evidenceByScope[scope]![name] = evidence
    return evidence
  }

  recordIndicator('site', 'site.api_max', apimsIndicators.apiMax, 'API', apimsState, {
    observedAt: apimsIndicators.apiMaxObs,
    ageMin: apimsIndicators.apiMaxAge,
    readingIds: apimsIndicators.apiMaxReadingIds,
    sourceIds: apimsIndicators.apiMaxSourceIds
  })
  recordIndicator('site', 'site.api_max_station', apimsIndicators.apiMaxStation, 'API', apimsState, {
    observedAt: apimsIndicators.apiMaxObs,
    ageMin: apimsIndicators.apiMaxAge,
    readingIds: apimsIndicators.apiMaxReadingIds,
    sourceIds: apimsIndicators.apiMaxSourceIds
  })
  recordIndicator('site', 'site.api_0600', apimsIndicators.api0600, 'API', apimsState, {
    observedAt: apimsIndicators.api0600Obs,
    ageMin: apimsIndicators.api0600Age,
    readingIds: apimsIndicators.api0600ReadingIds
  })
  recordIndicator('site', 'site.camera_far_ratio_last3', cameraIndicators.farRatioLast3, 'ratio', cameraState, {
    observedAt: cameraIndicators.farRatioObs,
    ageMin: cameraIndicators.farRatioAge,
    readingIds: cameraIndicators.farRatioReadingIds
  })
  recordIndicator('site', 'site.gauge_rain_last3frames_mm', cameraIndicators.rainLast3Frames, 'mm', gaugeState, {
    observedAt: cameraIndicators.rainLast3Obs,
    ageMin: cameraIndicators.rainLast3Age,
    readingIds: cameraIndicators.rainLast3ReadingIds,
    sourceIds: [...gaugeState.sourceIds, ...cameraState.sourceIds]
  })
  recordIndicator('site', 'site.met_afternoon_thunderstorm', forecastIndicator.value, 'bool', forecastState, {
    observedAt: forecastIndicator.observedAt,
    ageMin: forecastIndicator.ageMin,
    readingIds: []
  })

  const recordDiagnosticAge = (name: string, stateObj: ResolvedInputState): void => {
    indicatorRows.push({
      snapshot_id: tEvalIso,
      scope: 'site',
      name,
      value: stateObj.ageMin ?? '',
      unit: 'min',
      observed_at: stateObj.observedAt ?? '',
      age_min: stateObj.ageMin ?? '',
      state: stateObj.state ?? '',
      reading_ids: JSON.stringify(stateObj.readingIds)
    })
    evidenceByScope.site![name] = {
      scope: 'site',
      name,
      value: stateObj.ageMin ?? '',
      unit: 'min',
      state: stateObj.state,
      stateSince: stateObj.stateSince,
      ageMin: stateObj.ageMin,
      sourceIds: stateObj.sourceIds,
      readingIds: stateObj.readingIds,
      observedAt: stateObj.observedAt
    }
  }

  recordDiagnosticAge('age_min_gauge', gaugeState)
  recordDiagnosticAge('age_min_apims', apimsState)
  recordDiagnosticAge('age_min_met', metState)
  recordDiagnosticAge('age_min_forecast', forecastState)
  recordDiagnosticAge('age_min_camera', cameraState)

  const sharedNowFields: Row<'now'> = {
    'site.api_max': apimsIndicators.apiMax,
    'site.api_max_station': apimsIndicators.apiMaxStation,
    'site.api_0600': apimsIndicators.api0600,
    'site.camera_far_ratio_last3': cameraIndicators.farRatioLast3,
    'site.gauge_rain_last3frames_mm': cameraIndicators.rainLast3Frames,
    age_min_gauge: gaugeState.ageMin ?? '',
    age_min_apims: apimsState.ageMin ?? '',
    age_min_met: metState.ageMin ?? '',
    age_min_camera: cameraState.ageMin ?? '',
    state_gauge: gaugeState.state ?? '',
    state_apims: apimsState.state ?? '',
    state_met: metState.state ?? '',
    state_camera: cameraState.state ?? '',
    'site.met_afternoon_thunderstorm': forecastIndicator.value
  }

  const nowRows: Row<'now'>[] = [
    {
      snapshot_id: tEvalIso,
      scope: 'site',
      span_from: '',
      span_to: '',
      'w.rain_max_60m_mm': '',
      'w.rain_max_4h_mm': '',
      'w.met_kl_warning_in_force': '',
      'w.met_warning_keys': '',
      ...sharedNowFields
    }
  ]

  const windowScopes = resolveActiveWindowScopes(input.windows, evalDate, tEvalMs)
  const gaugeAllowRain = gaugeState.state === 'fresh' || gaugeState.state === 'recovered'

  for (const win of windowScopes) {
    evidenceByScope[win.windowId] = { ...evidenceByScope.site }

    const rain60 = gaugeAllowRain
      ? computeRollingRainMax(gaugeReadings, win.spanFromMs, win.spanToMs, tEvalMs, 60)
      : null
    const rain4h = gaugeAllowRain
      ? computeRollingRainMax(gaugeReadings, win.spanFromMs, win.spanToMs, tEvalMs, 240)
      : null
    const warningsResult = computeWindowWarningIndicators(metState, input.warnings, win, tEvalMs)

    recordIndicator(win.windowId, 'w.rain_max_60m_mm', rain60 ? rain60.value : '', 'mm', gaugeState, {
      observedAt: rain60?.observedAt ?? null,
      ageMin: rain60?.ageMin ?? null,
      readingIds: rain60?.readingIds ?? []
    })
    recordIndicator(win.windowId, 'w.rain_max_4h_mm', rain4h ? rain4h.value : '', 'mm', gaugeState, {
      observedAt: rain4h?.observedAt ?? null,
      ageMin: rain4h?.ageMin ?? null,
      readingIds: rain4h?.readingIds ?? []
    })
    recordIndicator(win.windowId, 'w.met_kl_warning_in_force', warningsResult.inForce, 'bool', metState, {
      observedAt: metState.observedAt,
      ageMin: metState.ageMin,
      readingIds: warningsResult.warningKeys
    })
    recordIndicator(win.windowId, 'w.met_warning_keys', warningsResult.warningKeysJson, 'json', metState, {
      observedAt: metState.observedAt,
      ageMin: metState.ageMin,
      readingIds: warningsResult.warningKeys
    })

    nowRows.push({
      snapshot_id: tEvalIso,
      scope: win.windowId,
      span_from: win.spanFromIso,
      span_to: win.spanToIso,
      'w.rain_max_60m_mm': rain60 ? rain60.value : '',
      'w.rain_max_4h_mm': rain4h ? rain4h.value : '',
      'w.met_kl_warning_in_force': warningsResult.inForce,
      'w.met_warning_keys': warningsResult.warningKeysJson,
      ...sharedNowFields
    })
  }

  return {
    nowRows,
    indicatorRows,
    sourceUpdates,
    inputs,
    sourceStates,
    evidenceByScope
  }
}
