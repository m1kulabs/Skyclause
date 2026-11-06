import { toMytIso } from '../../shared/time.ts'
import { defaultSkyClauseRows, evaluateSkyClauses } from './clauses.ts'
import { planSkyCrossings, type PlannedSkyCrossingFile } from './crossings.ts'
import {
  BOUND_APIMS_STATION_IDS,
  computeSkySnapshot,
  GAUGE_SOURCE_ID,
  MET_FORECAST_SOURCE_ID,
  MET_WARNING_SOURCE_ID,
  type BoundApimsStationId,
  type DaylightWindow
} from './indicators.ts'
import { JPS_METRIC, JPS_SOURCE_ID, JPS_SOURCE_KIND, JPS_UNIT, parseJpsRainfall } from './jps.ts'
import { columnsOf, type Cell, type Column, type Row } from './schema.ts'

export interface SkyReplayRawPoint {
  timestamp: string
  rf: number
  dailyrf: number
}

export interface SkyReplayCapture {
  stationId: string
  data: readonly SkyReplayRawPoint[]
}

export interface SkyReplayInput {
  capture: SkyReplayCapture
  subscriberIds: readonly string[]
  recordedAt: string
  daylight: DaylightWindow
  clauses?: readonly Row<'clauses'>[]
  apimsReadings?: readonly Row<'readings'>[]
}

export interface SkyReplayPorts {
  replaceWindows(rows: readonly Row<'windows'>[]): void
  replaceClauses(rows: readonly Row<'clauses'>[]): void
  nextSequence(proposedFilename: string): number
  createCrossing(file: PlannedSkyCrossingFile): void
  canonicalJson(value: unknown): string
  sha256(text: string): string
  report(message: string): void
}

export interface SkyReplayResult {
  windows: Row<'windows'>[]
  clauses: Row<'clauses'>[]
  files: PlannedSkyCrossingFile[]
  tickCount: number
  notice: string | null
  clauseVersion: string
}

const REPLAY_DATE = '2026-11-02'
const REPLAY_WINDOW_TITLE = 'Replay (2 Nov 2026) release wave'
const REPLAY_WAVE_TIMES = ['14:30', '15:00', '15:30', '15:45'] as const
const EXPECTED_TICK_COUNT = 288
const FIVE_MINUTES_MS = 5 * 60_000
const REPLAY_START_OBSERVED_MS = Date.parse('2026-11-02T00:00:00+08:00')
const REPLAY_END_EVAL_MS = Date.parse('2026-11-03T00:00:00+08:00')
const MISSING_APIMS_NOTICE = 'haze clauses off: no APIMS record for 2 Nov'
const CLAUSE_COLUMNS: readonly Column<'clauses'>[] = columnsOf('clauses')
const OFFSET_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/
const BOUND_APIMS_SET = new Set<string>(BOUND_APIMS_STATION_IDS)

function normalizeOffsetTimestamp(raw: unknown, label: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`Invalid ${label} timestamp`)
  }
  const trimmed = raw.trim()
  if (!OFFSET_ISO_PATTERN.test(trimmed)) {
    throw new Error(`Timestamp ${label} must include an explicit timezone offset`)
  }
  const ms = Date.parse(trimmed)
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ${label} timestamp`)
  }
  return toMytIso(new Date(ms))
}

function validateDaylightWindow(daylight: DaylightWindow): DaylightWindow {
  if (!daylight || typeof daylight !== 'object') {
    throw new Error('Invalid daylight window')
  }
  const start = typeof daylight.start === 'string' ? daylight.start.trim() : ''
  const end = typeof daylight.end === 'string' ? daylight.end.trim() : ''
  const startMatch = CLOCK_PATTERN.exec(start)
  const endMatch = CLOCK_PATTERN.exec(end)
  if (!startMatch || !endMatch) {
    throw new Error('Daylight window must use HH:mm clock strings')
  }
  const startH = Number(startMatch[1])
  const startM = Number(startMatch[2])
  const endH = Number(endMatch[1])
  const endM = Number(endMatch[2])
  if (startH < 0 || startH > 23 || startM < 0 || startM > 59 || endH < 0 || endH > 23 || endM < 0 || endM > 59) {
    throw new Error('Daylight window clock out of range')
  }
  return { start, end }
}

function validateSubscriberIds(rawIds: readonly string[]): string[] {
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    throw new Error('Replay requires at least one opaque subscriber ID')
  }
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const raw of rawIds) {
    if (typeof raw !== 'string') {
      throw new Error('Subscriber ID must be a string')
    }
    const trimmed = raw.trim()
    if (!trimmed) {
      throw new Error('Subscriber ID cannot be blank')
    }
    if (trimmed.includes('@')) {
      throw new Error('Subscriber ID must be an opaque identifier, not an email address')
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed)
      normalized.push(trimmed)
    }
  }
  if (normalized.length === 0) {
    throw new Error('Replay requires at least one opaque subscriber ID')
  }
  return normalized
}

function validateAndParseCapture(capture: SkyReplayCapture): Array<{ observedAt: string; value: number }> {
  if (!capture || typeof capture !== 'object' || Array.isArray(capture)) {
    throw new Error('Replay capture must be an object')
  }
  if (capture.stationId !== JPS_SOURCE_ID) {
    throw new Error(`Expected JPS stationId ${JPS_SOURCE_ID}, got ${String(capture.stationId)}`)
  }
  if (!Array.isArray(capture.data) || capture.data.length !== EXPECTED_TICK_COUNT) {
    throw new Error(`Replay capture must contain all ${EXPECTED_TICK_COUNT} records for ${REPLAY_DATE}`)
  }

  for (const point of capture.data) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      throw new Error('Replay capture data row must be an object')
    }
    if (typeof point.timestamp !== 'string' || !point.timestamp.startsWith(`${REPLAY_DATE}T`)) {
      throw new Error(`Replay capture timestamp must belong to ${REPLAY_DATE}`)
    }
    if (typeof point.rf !== 'number' || !Number.isFinite(point.rf) || point.rf < 0) {
      throw new Error('Replay capture rf must be a non-negative finite number')
    }
    if (typeof point.dailyrf !== 'number' || !Number.isFinite(point.dailyrf) || point.dailyrf < 0) {
      throw new Error('Replay capture dailyrf must be a non-negative finite number')
    }
  }

  const parsed = parseJpsRainfall({
    stationId: capture.stationId,
    data: capture.data.map((point) => ({
      timestamp: point.timestamp,
      rf: point.rf,
      dailyrf: point.dailyrf
    }))
  })

  if (parsed.length !== EXPECTED_TICK_COUNT) {
    throw new Error(`Expected ${EXPECTED_TICK_COUNT} unique JPS observations, got ${parsed.length}`)
  }

  const sorted = [...parsed].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
  for (let i = 0; i < EXPECTED_TICK_COUNT; i += 1) {
    const expectedObservedAt = toMytIso(new Date(REPLAY_START_OBSERVED_MS + i * FIVE_MINUTES_MS))
    if (sorted[i]?.observedAt !== expectedObservedAt) {
      throw new Error(
        `Replay capture missing expected 5-minute step ${expectedObservedAt} (found ${String(sorted[i]?.observedAt)})`
      )
    }
  }

  return sorted
}

interface ValidatedApimsReading {
  row: Row<'readings'>
  observedAtIso: string
  receivedAtIso: string
  receivedAtMs: number
}

function validateApimsReadings(rawReadings: readonly Row<'readings'>[] | undefined): {
  hasNov2History: boolean
  readings: ValidatedApimsReading[]
} {
  if (rawReadings === undefined) {
    return { hasNov2History: false, readings: [] }
  }
  if (!Array.isArray(rawReadings)) {
    throw new Error('apimsReadings must be an array when supplied')
  }
  if (rawReadings.length === 0) {
    return { hasNov2History: false, readings: [] }
  }

  const validated: ValidatedApimsReading[] = []
  for (const row of rawReadings) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('APIMS reading row must be an object')
    }
    const readingId = typeof row.reading_id === 'string' ? row.reading_id.trim() : ''
    if (!readingId) {
      throw new Error('APIMS reading_id must be a non-empty string')
    }
    const sourceId = typeof row.source_id === 'string' ? row.source_id.trim() : ''
    if (!BOUND_APIMS_SET.has(sourceId as BoundApimsStationId)) {
      throw new Error(`Invalid APIMS station source_id: ${sourceId}`)
    }
    const observedAtIso = normalizeOffsetTimestamp(row.observed_at, 'APIMS observed_at')
    const receivedAtIso = normalizeOffsetTimestamp(row.received_at, 'APIMS received_at')
    const observedAtMs = Date.parse(observedAtIso)
    const receivedAtMs = Date.parse(receivedAtIso)
    if (receivedAtMs < observedAtMs) {
      throw new Error('APIMS received_at cannot precede observed_at')
    }
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < 0) {
      throw new Error('APIMS reading value must be a non-negative finite number')
    }
    const revision = row.revision === undefined ? 1 : Number(row.revision)
    if (!Number.isInteger(revision) || revision < 1) {
      throw new Error('APIMS reading revision must be a positive integer')
    }
    const pollId =
      typeof row.poll_id === 'string' && row.poll_id.trim().length > 0 ? row.poll_id.trim() : `apims-poll-${readingId}`

    validated.push({
      observedAtIso,
      receivedAtIso,
      receivedAtMs,
      row: {
        ...row,
        reading_id: readingId,
        source_kind: 'apims',
        source_id: sourceId,
        metric: typeof row.metric === 'string' && row.metric.trim() ? row.metric.trim() : 'api',
        observed_at: observedAtIso,
        received_at: receivedAtIso,
        value: row.value,
        unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'API',
        poll_id: pollId,
        revision
      }
    })
  }

  const hasNov2History = validated.some(
    (entry) => entry.observedAtIso.startsWith(REPLAY_DATE) && entry.receivedAtMs <= REPLAY_END_EVAL_MS
  )
  if (!hasNov2History) {
    return { hasNov2History: false, readings: [] }
  }

  return { hasNov2History: true, readings: validated }
}

function canonicalizeCell(cell: Cell | undefined | null): string | number | boolean {
  if (cell === undefined || cell === null) return ''
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : ''
  }
  return cell
}

function canonicalizeClauseRows(
  rows: readonly Row<'clauses'>[]
): Array<Record<Column<'clauses'>, string | number | boolean>> {
  return rows.map((row) => {
    const canonicalRow = {} as Record<Column<'clauses'>, string | number | boolean>
    for (const column of CLAUSE_COLUMNS) {
      canonicalRow[column] = canonicalizeCell(row[column])
    }
    return canonicalRow
  })
}

function buildReplayWindows(subscriberIds: readonly string[], recordedAtIso: string): Row<'windows'>[] {
  const windows: Row<'windows'>[] = []
  for (const subscriberId of subscriberIds) {
    for (const clock of REPLAY_WAVE_TIMES) {
      const compactClock = clock.replace(':', '')
      windows.push({
        window_id: `W-replay-20261102-${subscriberId}-${compactClock}`,
        subscriber_id: subscriberId,
        kind: 'commute_wave',
        date: REPLAY_DATE,
        start_myt: clock,
        end_myt: clock,
        language: 'en',
        status: 'active',
        declared_at: recordedAtIso,
        title: REPLAY_WINDOW_TITLE
      })
    }
  }
  return windows
}

function createInitialSources(): Row<'sources'>[] {
  return [
    {
      source_id: GAUGE_SOURCE_ID,
      kind: JPS_SOURCE_KIND,
      name: 'Sg. Kuyoh di LRT Bukit Jalil',
      cadence_min: 5,
      stale_after_min: 10,
      freshness: 'observed',
      state: '',
      state_since: ''
    },
    ...BOUND_APIMS_STATION_IDS.map((stationId) => ({
      source_id: stationId,
      kind: 'apims',
      name: `APIMS ${stationId}`,
      cadence_min: 60,
      stale_after_min: 120,
      freshness: 'observed',
      state: '',
      state_since: ''
    })),
    {
      source_id: MET_WARNING_SOURCE_ID,
      kind: 'met_warning',
      name: 'MET Malaysia Warnings',
      cadence_min: 5,
      stale_after_min: 15,
      freshness: 'observed',
      state: '',
      state_since: ''
    },
    {
      source_id: MET_FORECAST_SOURCE_ID,
      kind: 'met_forecast',
      name: 'MET Malaysia Forecast',
      cadence_min: 60,
      stale_after_min: 180,
      freshness: 'forecast',
      state: '',
      state_since: ''
    }
  ]
}

function normalizeSubscriberCell(cell: Cell | undefined): string {
  if (cell instanceof Date) {
    const ms = cell.getTime()
    return Number.isFinite(ms) ? toMytIso(cell) : ''
  }
  if (cell === undefined || cell === null) return ''
  return String(cell).trim()
}

export function selectReplaySubscriberIds(
  teamAlertEmails: string,
  subscribers: readonly Row<'subscribers'>[]
): string[] {
  if (typeof teamAlertEmails !== 'string') {
    throw new Error('TEAM_ALERT_EMAILS is not configured')
  }
  const rawTokens = teamAlertEmails
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)

  if (rawTokens.length === 0) {
    throw new Error('TEAM_ALERT_EMAILS must specify at least one team recipient')
  }

  const uniqueEmails: string[] = []
  const seenEmails = new Set<string>()
  for (const email of rawTokens) {
    if (!email.includes('@')) {
      throw new Error('TEAM_ALERT_EMAILS contains an invalid recipient entry')
    }
    if (!seenEmails.has(email)) {
      seenEmails.add(email)
      uniqueEmails.push(email)
    }
  }

  if (!Array.isArray(subscribers) || subscribers.length === 0) {
    throw new Error('No subscriber records available for replay recipient selection')
  }

  const selectedIds: string[] = []
  const seenIds = new Set<string>()

  for (const targetEmail of uniqueEmails) {
    const matchingActiveRows = subscribers.filter((row) => {
      const email = normalizeSubscriberCell(row?.email).toLowerCase()
      if (email !== targetEmail) return false
      const consentAt = normalizeSubscriberCell(row?.consent_at)
      const unsubscribedAt = normalizeSubscriberCell(row?.unsubscribed_at)
      return consentAt.length > 0 && unsubscribedAt.length === 0
    })

    if (matchingActiveRows.length === 0) {
      throw new Error('Configured team alert recipient has no active consenting subscriber record')
    }

    let resolvedId: string | null = null
    for (const row of matchingActiveRows) {
      const candidateId = normalizeSubscriberCell(row.subscriber_id)
      if (!candidateId || candidateId.includes('@')) {
        throw new Error('Matching team subscriber record has an invalid opaque subscriber_id')
      }
      if (resolvedId !== null && resolvedId !== candidateId) {
        throw new Error('Ambiguous subscriber_id records found for configured team recipient')
      }
      resolvedId = candidateId
    }

    if (!resolvedId) {
      throw new Error('Matching team subscriber record is missing subscriber_id')
    }

    if (!seenIds.has(resolvedId)) {
      seenIds.add(resolvedId)
      selectedIds.push(resolvedId)
    }
  }

  return selectedIds
}

export function runSkyReplay(input: SkyReplayInput, ports: SkyReplayPorts): SkyReplayResult {
  if (!input || typeof input !== 'object') {
    throw new Error('Replay input is required')
  }

  const recordedAtIso = normalizeOffsetTimestamp(input.recordedAt, 'recordedAt')
  const daylight = validateDaylightWindow(input.daylight)
  const subscriberIds = validateSubscriberIds(input.subscriberIds)
  const parsedJps = validateAndParseCapture(input.capture)
  const apimsValidation = validateApimsReadings(input.apimsReadings)

  const baseClauses = (input.clauses ?? defaultSkyClauseRows()).map((row) => ({ ...row }))
  if (baseClauses.length === 0) {
    throw new Error('Replay requires at least one clause row')
  }

  const notice = apimsValidation.hasNov2History ? null : MISSING_APIMS_NOTICE
  const replayClauses: Row<'clauses'>[] = baseClauses.map((row) => {
    const isSky =
      String(row.pack ?? '')
        .trim()
        .toLowerCase() === 'sky'
    const key = String(row.key ?? '').trim()
    if (!apimsValidation.hasNov2History && isSky && (key === 'haze_watch' || key === 'haze_severe')) {
      return { ...row, enabled: false }
    }
    return { ...row }
  })

  const canonicalClauses = canonicalizeClauseRows(replayClauses)
  const canonicalClauseContentJson = ports.canonicalJson(canonicalClauses)
  const clauseHash = ports.sha256(canonicalClauseContentJson)
  const clauseVersion = `replay:${clauseHash}`

  const windows = buildReplayWindows(subscriberIds, recordedAtIso)

  ports.replaceWindows(windows.map((row) => ({ ...row })))
  ports.replaceClauses(replayClauses.map((row) => ({ ...row })))

  const sources = createInitialSources()
  const jpsReadings: Row<'readings'>[] = []
  const jpsPolls: Row<'polls'>[] = []
  const previousIndicators: Row<'indicators'>[] = []
  let previousState: Row<'shadow_state'>[] = []
  const createdFiles: PlannedSkyCrossingFile[] = []

  for (let i = 0; i < parsedJps.length; i += 1) {
    const observation = parsedJps[i]!
    const tEvalMs = Date.parse(observation.observedAt) + FIVE_MINUTES_MS
    const tEval = toMytIso(new Date(tEvalMs))
    const pollId = `replay-jps-poll-${String(i + 1).padStart(3, '0')}`

    jpsReadings.push({
      reading_id: `${JPS_SOURCE_ID}:${JPS_METRIC}:${observation.observedAt}`,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      metric: JPS_METRIC,
      observed_at: observation.observedAt,
      received_at: tEval,
      value: observation.value,
      unit: JPS_UNIT,
      poll_id: pollId,
      revision: 1
    })

    jpsPolls.push({
      poll_id: pollId,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      started_at: tEval,
      received_at: tEval,
      outcome: 'ok',
      new_rows: 1
    })

    const visibleApimsReadings = apimsValidation.hasNov2History
      ? apimsValidation.readings.filter((item) => item.receivedAtMs <= tEvalMs).map((item) => item.row)
      : []

    const visibleApimsPolls: Row<'polls'>[] = apimsValidation.hasNov2History
      ? apimsValidation.readings
          .filter((item) => item.receivedAtMs <= tEvalMs)
          .map((item) => ({
            poll_id: String(item.row.poll_id ?? `apims-poll-${String(item.row.reading_id)}`),
            source_kind: 'apims',
            source_id: String(item.row.source_id),
            started_at: item.receivedAtIso,
            received_at: item.receivedAtIso,
            outcome: 'ok',
            new_rows: 1
          }))
      : []

    const snapshot = computeSkySnapshot({
      tEval,
      sources,
      readings: visibleApimsReadings.length > 0 ? [...jpsReadings, ...visibleApimsReadings] : jpsReadings,
      polls: visibleApimsPolls.length > 0 ? [...jpsPolls, ...visibleApimsPolls] : jpsPolls,
      warnings: [],
      forecast: [],
      windows,
      previousIndicators,
      daylight
    })

    for (const update of snapshot.sourceUpdates) {
      const target = sources.find((row) => row.source_id === update.source_id)
      if (target) {
        target.state = update.state ?? ''
        target.state_since = update.state_since ?? ''
      }
    }
    previousIndicators.push(...snapshot.indicatorRows)

    const verdicts = evaluateSkyClauses({
      tEval,
      snapshot,
      clauses: replayClauses,
      windows,
      clauseVersion
    })

    let plan = planSkyCrossings({
      tEval,
      verdicts,
      previousState,
      ledgerSourceRefs: [],
      windows,
      sequence: 1,
      replay: true,
      replayNotice: notice
    })

    if (plan.crossing !== null) {
      const assignedSeq = ports.nextSequence(plan.crossing.filename)
      if (!Number.isInteger(assignedSeq) || assignedSeq < 1) {
        throw new Error(`Invalid crossing sequence returned by nextSequence: ${String(assignedSeq)}`)
      }
      if (assignedSeq !== 1) {
        plan = planSkyCrossings({
          tEval,
          verdicts,
          previousState,
          ledgerSourceRefs: [],
          windows,
          sequence: assignedSeq,
          replay: true,
          replayNotice: notice
        })
      }

      const crossingFile: PlannedSkyCrossingFile = {
        filename: plan.crossing!.filename,
        document: {
          ...plan.crossing!.document,
          replay_clause_content_json: canonicalClauseContentJson
        }
      }
      ports.createCrossing(crossingFile)
      createdFiles.push(crossingFile)

      const noticeSuffix = notice ? ` — ${notice}` : ''
      ports.report(
        `Replay (2 Nov 2026): wrote ${crossingFile.filename} at ${tEval} (${crossingFile.document.changes.length} scope change(s))${noticeSuffix}`
      )
    }

    previousState = plan.stateRows
  }

  const summarySuffix = notice ? ` — ${notice}` : ''
  ports.report(
    `Replay (2 Nov 2026): completed ${parsedJps.length} ticks with ${createdFiles.length} crossing file(s)${summarySuffix}`
  )

  return {
    windows,
    clauses: replayClauses,
    files: createdFiles,
    tickCount: parsedJps.length,
    notice,
    clauseVersion
  }
}
