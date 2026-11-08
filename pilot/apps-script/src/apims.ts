import { toMytIso } from '../../shared/time.ts'
import {
  APIMS_ENDPOINT,
  APIMS_STATIONS,
  apimsHistoryKey,
  apimsHistoryUrl,
  parseApimsHistory,
  parseApimsLatest,
  type ApimsParseResult,
  type ApimsStationId
} from './apims-parser.ts'
import { validateReading } from './readings.ts'
import type { Cell, Row } from './schema.ts'

export interface ApimsBackfillRequest {
  stationId: ApimsStationId
  stateId: 14 | 10 | 16
  end: string
  attempts: number
  completed: boolean
}
export interface ApimsBackfillState {
  version: 1
  requests: ApimsBackfillRequest[]
}
export interface ApimsPollPorts {
  now(): Date
  newPollId(): string
  fetch(url: string): { status: number; body: string }
  readSources(): Row<'sources'>[]
  appendSources(rows: Row<'sources'>[]): void
  readReadings(): Row<'readings'>[]
  readPolls(): Row<'polls'>[]
  appendReadings(rows: Row<'readings'>[]): void
  appendPoll(row: Row<'polls'>): void
  readBackfillState(): ApimsBackfillState | null
  saveBackfillState(state: ApimsBackfillState): void
  evaluate(): void
}
export interface ApimsPollReport {
  latestPoll: Row<'polls'>
  historyPolls: Row<'polls'>[]
  newReadings: Row<'readings'>[]
  pendingHistory: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const INVOCATION_BUDGET_MS = 90_000

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeApimsBackfillState(raw: string | null): ApimsBackfillState | null {
  if (raw === null) return null
  const value: unknown = JSON.parse(raw)
  if (!object(value) || value.version !== 1 || !Array.isArray(value.requests) || value.requests.length > 9) {
    throw new Error('Invalid APIMS backfill state')
  }
  const requests: ApimsBackfillRequest[] = []
  const keys = new Set<string>()
  for (const item of value.requests) {
    if (!object(item)) throw new Error('Invalid APIMS backfill request')
    const station = APIMS_STATIONS.find((s) => s.id === item.stationId && s.stateId === item.stateId)
    if (
      !station ||
      typeof item.end !== 'string' ||
      typeof item.attempts !== 'number' ||
      !Number.isSafeInteger(item.attempts) ||
      item.attempts < 0 ||
      typeof item.completed !== 'boolean'
    ) {
      throw new Error('Invalid APIMS backfill request')
    }
    const key = apimsHistoryKey(station.stateId, item.end)
    if (keys.has(key)) throw new Error('Duplicate APIMS backfill request')
    keys.add(key)
    requests.push({
      stationId: station.id,
      stateId: station.stateId,
      end: item.end,
      attempts: item.attempts,
      completed: item.completed
    })
  }
  for (const station of APIMS_STATIONS) {
    const ends = requests
      .filter((r) => r.stateId === station.stateId)
      .map((r) => Date.parse(r.end))
      .sort((a, b) => b - a)
    if (ends.length !== 0 && (ends.length !== 3 || ends[0]! - ends[1]! !== DAY_MS || ends[1]! - ends[2]! !== DAY_MS)) {
      throw new Error('Invalid APIMS backfill three-hour batch')
    }
  }
  return { version: 1, requests }
}

function observedAt(cell: Cell | undefined): string | null {
  if (cell instanceof Date) return Number.isFinite(cell.getTime()) ? toMytIso(cell) : null
  if (typeof cell !== 'string' || !Number.isFinite(Date.parse(cell))) return null
  return toMytIso(new Date(cell))
}

function latestRevisions(rows: Row<'readings'>[]): Map<string, { value: number; revision: number }> {
  const latest = new Map<string, { value: number; revision: number }>()
  for (const row of rows) {
    if (row.source_kind !== 'apims' || row.metric !== 'api' || !APIMS_STATIONS.some((s) => s.id === row.source_id))
      continue
    const hour = observedAt(row.observed_at)
    if (!hour || row.value === undefined || row.value === '' || row.revision === undefined || row.revision === '')
      continue
    const value = Number(row.value)
    const revision = Number(row.revision)
    if (!Number.isFinite(value) || !Number.isSafeInteger(revision) || revision < 1) continue
    const key = `${row.source_id}:${hour}`
    const current = latest.get(key)
    if (!current || revision >= current.revision) latest.set(key, { value, revision })
  }
  return latest
}

function registerSources(ports: ApimsPollPorts): void {
  const sources = ports.readSources()
  for (const source of sources) {
    if (APIMS_STATIONS.some((s) => s.id === source.source_id) && source.kind !== 'apims') {
      throw new Error(`Incompatible APIMS source kind for ${source.source_id}`)
    }
  }
  const missing = APIMS_STATIONS.filter((s) => !sources.some((row) => row.source_id === s.id)).map((s) => ({
    source_id: s.id,
    kind: 'apims',
    name: s.name,
    cadence_min: 60,
    stale_after_min: 120,
    freshness: 'observed',
    licence: 'No published terms found (5 Nov 2026)',
    url: APIMS_ENDPOINT
  }))
  if (missing.length > 0) ports.appendSources(missing)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Only fetch and source parsing are caught. Workbook and property failures remain fatal.
function attempt(
  ports: ApimsPollPorts,
  request?: ApimsBackfillRequest
): { poll: Row<'polls'>; readings: Row<'readings'>[] } {
  const pollId = ports.newPollId()
  const started = ports.now()
  let status = 0
  let parsed: ApimsParseResult | undefined
  let error: string | undefined
  let response: { status: number; body: string } | undefined
  try {
    response = ports.fetch(request ? apimsHistoryUrl(request.stateId, request.end) : APIMS_ENDPOINT)
  } catch (failure) {
    error = message(failure)
  }
  const received = ports.now()
  if (response) {
    status = response.status
    if (status < 200 || status >= 300) error = `HTTP ${status}`
    else {
      try {
        const payload: unknown = JSON.parse(response.body)
        parsed = request
          ? parseApimsHistory(payload, request)
          : parseApimsLatest(
              payload,
              APIMS_STATIONS.map((s) => s.id)
            )
      } catch (failure) {
        error = message(failure)
      }
    }
  }
  const receivedAt = toMytIso(received)
  const latency = received.getTime() - started.getTime()
  const readings: Row<'readings'>[] = []
  if (parsed) {
    const latest = latestRevisions(ports.readReadings())
    for (const item of parsed.readings) {
      const key = `${item.stationId}:${item.observedAt}`
      const current = latest.get(key)
      if (current && current.value === item.value) continue
      const row: Row<'readings'> = {
        reading_id: `${item.stationId}:api:${item.observedAt}`,
        source_kind: 'apims',
        source_id: item.stationId,
        metric: 'api',
        observed_at: item.observedAt,
        received_at: receivedAt,
        value: item.value,
        unit: 'API',
        http_status: status,
        latency_ms: latency,
        poll_id: pollId,
        revision: current ? current.revision + 1 : 1,
        note: JSON.stringify(item.className === undefined ? {} : { class: item.className })
      }
      const problems = validateReading(row)
      if (problems.length > 0) throw new Error(`Invalid APIMS reading: ${problems.join('; ')}`)
      readings.push(row)
      latest.set(key, { value: item.value, revision: Number(row.revision) })
    }
    if (parsed.diagnostics.length > 0) error = parsed.diagnostics.join('; ')
  }
  const poll: Row<'polls'> = {
    poll_id: pollId,
    source_kind: request ? 'apims_backfill' : 'apims',
    source_id: request ? apimsHistoryKey(request.stateId, request.end) : 'apims',
    started_at: toMytIso(started),
    received_at: receivedAt,
    http_status: status,
    latency_ms: latency,
    outcome: !parsed ? 'error' : parsed.readings.length === 0 ? 'empty' : readings.length > 0 ? 'ok' : 'unchanged',
    new_rows: readings.length,
    ...(error === undefined ? {} : { error })
  }
  if (readings.length > 0) ports.appendReadings(readings)
  ports.appendPoll(poll)
  return { poll, readings }
}

function addEligiblePlans(
  state: ApimsBackfillState,
  now: Date,
  rows: Row<'readings'>[],
  polls: Row<'polls'>[]
): boolean {
  const myt = toMytIso(now)
  const day = Date.parse(`${myt.slice(0, 10)}T06:00:00+08:00`)
  const morning = now.getTime() < day ? day - DAY_MS : day
  const latest = latestRevisions(rows)
  const end = Date.parse(`${myt.slice(0, 13)}:00:00+08:00`)
  let added = false
  for (const station of APIMS_STATIONS) {
    if (state.requests.some((r) => r.stateId === station.stateId)) continue
    if (
      polls.some(
        (p) =>
          p.source_kind === 'apims_backfill' && String(p.source_id).startsWith(`apims:backfill:${station.stateId}:`)
      )
    )
      continue
    if ([0, 1, 2].every((i) => latest.has(`${station.id}:${toMytIso(new Date(morning - i * DAY_MS))}`))) continue
    for (let slot = 0; slot < 3; slot++) {
      state.requests.push({
        stationId: station.id,
        stateId: station.stateId,
        end: toMytIso(new Date(end - slot * DAY_MS)),
        attempts: 0,
        completed: false
      })
    }
    added = true
  }
  return added
}

function pendingInOrder(state: ApimsBackfillState): ApimsBackfillRequest[] {
  const slot = (request: ApimsBackfillRequest) =>
    state.requests.filter((r) => r.stateId === request.stateId && r.end > request.end).length
  const stateOrder = (request: ApimsBackfillRequest) => APIMS_STATIONS.findIndex((s) => s.stateId === request.stateId)
  return state.requests
    .filter((r) => !r.completed)
    .sort((a, b) => a.attempts - b.attempts || slot(a) - slot(b) || stateOrder(a) - stateOrder(b))
}

export function runApimsPoll(ports: ApimsPollPorts): ApimsPollReport {
  const started = ports.now()
  const storedState = ports.readBackfillState()
  const state = decodeApimsBackfillState(storedState === null ? null : JSON.stringify(storedState)) ?? {
    version: 1,
    requests: []
  }
  registerSources(ports)
  const latest = attempt(ports)
  const polls = ports.readPolls()
  if (addEligiblePlans(state, started, ports.readReadings(), polls)) ports.saveBackfillState(state)
  const recorded = new Set(polls.filter((p) => p.source_kind === 'apims_backfill').map((p) => p.source_id))
  // A poll can persist while its completion checkpoint fails; its request must never be refetched.
  let reconciled = false
  for (const request of state.requests) {
    if (!request.completed && recorded.has(apimsHistoryKey(request.stateId, request.end))) {
      request.completed = true
      reconciled = true
    }
  }
  if (reconciled) ports.saveBackfillState(state)
  const historyPolls: Row<'polls'>[] = []
  const newReadings = [...latest.readings]
  for (const request of pendingInOrder(state)) {
    if (historyPolls.length > 0 && ports.now().getTime() - started.getTime() >= INVOCATION_BUDGET_MS) break
    // Checkpoint the attempt before HTTP so an interrupted request yields to its peers next time.
    request.attempts += 1
    ports.saveBackfillState(state)
    const result = attempt(ports, request)
    historyPolls.push(result.poll)
    newReadings.push(...result.readings)
    request.completed = true
    ports.saveBackfillState(state)
  }
  ports.evaluate()
  return {
    latestPoll: latest.poll,
    historyPolls,
    newReadings,
    pendingHistory: state.requests.filter((r) => !r.completed).length
  }
}

export function runApimsHandler(runtime: { withLock<T>(fn: () => T): T; ports: ApimsPollPorts }): ApimsPollReport {
  return runtime.withLock(() => runApimsPoll(runtime.ports))
}
