import { toMytIso } from '../../shared/time.ts'
import { validateReading } from './readings.ts'
import type { Cell, Row } from './schema.ts'

export const JPS_SOURCE_ID = '0232901RF'
export const JPS_SOURCE_KIND = 'jps_rain'
export const JPS_METRIC = 'rain_5m_mm'
export const JPS_UNIT = 'mm'
export const JPS_ENDPOINT = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'

const JPS_SOURCE_ROW: Row<'sources'> = {
  source_id: JPS_SOURCE_ID,
  kind: JPS_SOURCE_KIND,
  name: 'Sg. Kuyoh di LRT Bukit Jalil',
  cadence_min: 5,
  stale_after_min: 10,
  freshness: 'observed',
  licence: 'No published terms found (5 Nov 2026)',
  url: JPS_ENDPOINT
}

const RAW_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+08:00)?$/

export interface ParsedJpsReading {
  observedAt: string
  value: number
}

export interface JpsHttpResponse {
  status: number
  body: string
}

export interface JpsPollPorts {
  now(): Date
  newPollId(): string
  fetch(url: string): JpsHttpResponse
  readSources(): Row<'sources'>[]
  appendSource(row: Row<'sources'>): void
  readReadings(): Row<'readings'>[]
  appendReadings(rows: Row<'readings'>[]): void
  appendPoll(row: Row<'polls'>): void
  evaluate(): void
}

export interface JpsPollResult {
  poll: Row<'polls'>
  newReadings: Row<'readings'>[]
}

let lastUuidMs = -1
let uuidSeq = 0

function randomHex(bits: number): string {
  const max = 2 ** bits
  const digits = Math.ceil(bits / 4)
  return Math.floor(Math.random() * max)
    .toString(16)
    .padStart(digits, '0')
}

export function newUuidV7(now: Date = new Date()): string {
  let ms = now.getTime()
  if (ms === lastUuidMs) {
    uuidSeq = (uuidSeq + 1) & 0x0fff
    if (uuidSeq === 0) ms += 1
  } else {
    uuidSeq = Math.floor(Math.random() * 0x1000)
  }
  lastUuidMs = ms

  const timeHigh = Math.floor(ms / 0x10000)
    .toString(16)
    .padStart(8, '0')
  const timeLow = (ms & 0xffff).toString(16).padStart(4, '0')
  const verAndSeq = (0x7000 | uuidSeq).toString(16).padStart(4, '0')
  const variantAndRand = (0x8000 | Math.floor(Math.random() * 0x4000)).toString(16).padStart(4, '0')
  const node = `${randomHex(24)}${randomHex(24)}`
  return `${timeHigh}-${timeLow}-${verAndSeq}-${variantAndRand}-${node}`
}

function normalizeSourceTimestamp(raw: unknown): string {
  if (typeof raw !== 'string' || !RAW_TIMESTAMP_PATTERN.test(raw)) {
    throw new Error(`Invalid JPS timestamp: ${String(raw)}`)
  }
  const observedAt = raw.endsWith('+08:00') ? raw : `${raw}+08:00`
  const ms = Date.parse(observedAt)
  if (Number.isNaN(ms) || toMytIso(new Date(ms)) !== observedAt) {
    throw new Error(`Invalid JPS timestamp: ${raw}`)
  }
  return observedAt
}

export function parseJpsRainfall(payload: unknown): ParsedJpsReading[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('JPS payload must be an object')
  }
  const record = payload as Record<string, unknown>
  if (record.stationId !== JPS_SOURCE_ID) {
    throw new Error(`Expected JPS stationId ${JPS_SOURCE_ID}, got ${String(record.stationId)}`)
  }
  if (!Array.isArray(record.data)) {
    throw new Error('JPS payload data must be an array')
  }

  const seenByObservedAt = new Map<string, number>()
  const parsed: ParsedJpsReading[] = []

  for (const entry of record.data) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('JPS data row must be an object')
    }
    const row = entry as Record<string, unknown>
    const observedAt = normalizeSourceTimestamp(row.timestamp)
    const rf = row.rf
    if (typeof rf !== 'number' || !Number.isFinite(rf)) {
      throw new Error(`Invalid JPS rf value at ${observedAt}: ${String(rf)}`)
    }

    const existing = seenByObservedAt.get(observedAt)
    if (existing !== undefined) {
      if (existing !== rf) {
        throw new Error(`Conflicting duplicate JPS timestamp ${observedAt}: ${existing} vs ${rf}`)
      }
      continue
    }

    seenByObservedAt.set(observedAt, rf)
    parsed.push({ observedAt, value: rf })
  }

  return parsed
}

function normalizeStoredObservedAt(cell: Cell | undefined): string | null {
  if (cell instanceof Date) {
    return Number.isNaN(cell.getTime()) ? null : toMytIso(cell)
  }
  if (typeof cell === 'string' && cell.length > 0) {
    const ms = Date.parse(cell)
    return Number.isNaN(ms) ? cell : toMytIso(new Date(ms))
  }
  return null
}

function latestStoredRevisions(rows: readonly Row<'readings'>[]): Map<string, { revision: number; value: number }> {
  const latest = new Map<string, { revision: number; value: number }>()
  for (const row of rows) {
    if (row.source_id !== JPS_SOURCE_ID || row.metric !== JPS_METRIC) continue
    const observedAt = normalizeStoredObservedAt(row.observed_at)
    if (!observedAt) continue
    const revision = Number(row.revision)
    const value = Number(row.value)
    if (!Number.isFinite(revision) || !Number.isFinite(value)) continue
    const current = latest.get(observedAt)
    if (!current || revision >= current.revision) {
      latest.set(observedAt, { revision, value })
    }
  }
  return latest
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function runJpsPoll(ports: JpsPollPorts): JpsPollResult {
  const existingSources = ports.readSources()
  const hasSource = existingSources.some((row) => String(row.source_id) === JPS_SOURCE_ID)
  if (!hasSource) {
    ports.appendSource({ ...JPS_SOURCE_ROW })
  }

  const pollId = ports.newPollId()
  const startedAtDate = ports.now()
  const startedAt = toMytIso(startedAtDate)

  let response: JpsHttpResponse
  let receivedAtDate: Date
  try {
    response = ports.fetch(JPS_ENDPOINT)
    receivedAtDate = ports.now()
  } catch (error) {
    receivedAtDate = ports.now()
    const poll: Row<'polls'> = {
      poll_id: pollId,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      started_at: startedAt,
      received_at: toMytIso(receivedAtDate),
      http_status: 0,
      latency_ms: receivedAtDate.getTime() - startedAtDate.getTime(),
      outcome: 'error',
      new_rows: 0,
      error: errorMessage(error)
    }
    ports.appendPoll(poll)
    ports.evaluate()
    return { poll, newReadings: [] }
  }

  const receivedAt = toMytIso(receivedAtDate)
  const latencyMs = receivedAtDate.getTime() - startedAtDate.getTime()
  const httpStatus = response.status

  if (httpStatus < 200 || httpStatus >= 300) {
    const poll: Row<'polls'> = {
      poll_id: pollId,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      started_at: startedAt,
      received_at: receivedAt,
      http_status: httpStatus,
      latency_ms: latencyMs,
      outcome: 'error',
      new_rows: 0,
      error: `HTTP ${httpStatus}`
    }
    ports.appendPoll(poll)
    ports.evaluate()
    return { poll, newReadings: [] }
  }

  let parsedReadings: ParsedJpsReading[]
  try {
    parsedReadings = parseJpsRainfall(JSON.parse(response.body))
  } catch (error) {
    const poll: Row<'polls'> = {
      poll_id: pollId,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      started_at: startedAt,
      received_at: receivedAt,
      http_status: httpStatus,
      latency_ms: latencyMs,
      outcome: 'error',
      new_rows: 0,
      error: errorMessage(error)
    }
    ports.appendPoll(poll)
    ports.evaluate()
    return { poll, newReadings: [] }
  }

  const latestByObservedAt = latestStoredRevisions(ports.readReadings())
  const newReadings: Row<'readings'>[] = []

  for (const item of parsedReadings) {
    const current = latestByObservedAt.get(item.observedAt)
    if (current && current.value === item.value) continue
    const revision = current ? current.revision + 1 : 1
    const reading: Row<'readings'> = {
      reading_id: `${JPS_SOURCE_ID}:${JPS_METRIC}:${item.observedAt}`,
      source_kind: JPS_SOURCE_KIND,
      source_id: JPS_SOURCE_ID,
      metric: JPS_METRIC,
      observed_at: item.observedAt,
      received_at: receivedAt,
      value: item.value,
      unit: JPS_UNIT,
      http_status: httpStatus,
      latency_ms: latencyMs,
      poll_id: pollId,
      revision
    }
    const problems = validateReading(reading)
    if (problems.length > 0) {
      throw new Error(`Invalid reading row: ${problems.join('; ')}`)
    }
    newReadings.push(reading)
    latestByObservedAt.set(item.observedAt, { revision, value: item.value })
  }

  if (newReadings.length > 0) {
    ports.appendReadings(newReadings)
  }

  const poll: Row<'polls'> = {
    poll_id: pollId,
    source_kind: JPS_SOURCE_KIND,
    source_id: JPS_SOURCE_ID,
    started_at: startedAt,
    received_at: receivedAt,
    http_status: httpStatus,
    latency_ms: latencyMs,
    outcome: newReadings.length > 0 ? 'ok' : 'unchanged',
    new_rows: newReadings.length
  }
  ports.appendPoll(poll)
  ports.evaluate()
  return { poll, newReadings }
}

export function runJpsHandler(runtime: { withLock<T>(fn: () => T): T; ports: JpsPollPorts }): JpsPollResult {
  return runtime.withLock(() => runJpsPoll(runtime.ports))
}
