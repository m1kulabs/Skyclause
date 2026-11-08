import {
  MET_WARNING_ENDPOINT,
  MET_FORECAST_ENDPOINT,
  parseMetWarnings,
  parseMetForecast,
  validateMetWarningRow,
  type MetKind,
  type ParsedMetWarning,
  type ParsedMetForecast
} from './met-parser.ts'
import { toMytIso } from '../../shared/time.ts'
import type { Row } from './schema.ts'

export interface MetRawBody {
  // Native adapters convert signed Google bytes to these canonical unsigned octets.
  bytes: number[]
  text: string | null
}
export interface MetHttpResponse extends MetRawBody {
  status: number
}
export interface StoredMetWarning {
  rowNumber: number
  row: Row<'warnings'>
}
export interface MetReceipt {
  version: 1
  kind: MetKind
  poll: Row<'polls'>
  rawFileId: string
  sha256: string
}
export interface MetPollPorts {
  now(): Date
  newPollId(): string
  fetch(url: string): MetHttpResponse
  readSources(): Row<'sources'>[]
  appendSources(rows: Row<'sources'>[]): void
  readGlossary(): Row<'glossary'>[]
  appendGlossary(rows: Row<'glossary'>[]): void
  readWarnings(): StoredMetWarning[]
  appendWarnings(rows: Row<'warnings'>[]): void
  updateLastSeen(rowNumber: number, at: string): void
  readForecast(): Row<'forecast'>[]
  appendForecast(rows: Row<'forecast'>[]): void
  readPolls(): Row<'polls'>[]
  appendPoll(row: Row<'polls'>): void
  readRaw(fileId: string): MetRawBody
  createRaw(name: string, bytes: number[]): string
  hashBytes(bytes: number[]): string
  readPending(kind: MetKind): MetReceipt | null
  savePending(kind: MetKind, receipt: MetReceipt): void
  clearPending(kind: MetKind): void
  evaluate(): void
}
// Counters cover recovery plus the fresh poll; rawCreated describes only the fresh archive.
export interface MetPollReport {
  poll: Row<'polls'>
  recoveredPollIds: string[]
  appendedRows: number
  touchedWarnings: number
  rawCreated: boolean
}
export interface MetTextVerification {
  status: 'no_data' | 'match' | 'mismatch'
  rowsChecked: number
  comparedFields: number
  matchedFields: number
  problems: { warningKey: string; field: string; reason: string }[]
}

const CONFIG = {
  warning: {
    id: 'met_warning',
    sourceKind: 'met_warning',
    name: 'MET warnings',
    cadence: 10,
    stale: 20,
    url: MET_WARNING_ENDPOINT
  },
  forecast: {
    id: 'Ds058',
    sourceKind: 'met_forecast',
    name: 'MET Kuala Lumpur forecast',
    cadence: 360,
    stale: 720,
    url: MET_FORECAST_ENDPOINT
  }
} as const
const GLOSSARY = [
  ['Amaran Ribut Petir', 'Thunderstorms Warning'],
  [
    'Ribut petir, hujan lebat dan angin kencang dijangka di negeri …',
    'Thunderstorms, heavy rain and strong winds are expected over the states of …'
  ],
  ['menyeluruh', 'widespread'],
  ['di kebanyakan tempat', 'in most places'],
  ['Lebat', 'heavy, 31–60 mm in an hour'],
  ['jerebu', 'haze']
] as const
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= 50000
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
function storage(reason: string): never {
  throw new Error(`MET storage: ${reason}`)
}
function instant(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return toMytIso(value)
  if (typeof value !== 'string') return storage('invalid instant')
  const parts = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  const day = parts ? Date.parse(`${parts[1]}T00:00:00Z`) : NaN
  if (
    !parts ||
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== parts[1] ||
    Number(parts[2]) > 23 ||
    Number(parts[3]) > 59 ||
    Number(parts[4]) > 59 ||
    !Number.isFinite(Date.parse(value))
  )
    return storage('invalid instant')
  return toMytIso(new Date(value))
}
function pollMetadata(input: unknown, kind: MetKind, fileId: string): Row<'polls'> {
  if (!object(input)) return storage('invalid receipt poll')
  const config = CONFIG[kind]
  if (
    !nonempty(input.poll_id) ||
    input.source_kind !== config.sourceKind ||
    input.source_id !== config.id ||
    typeof input.started_at !== 'string' ||
    typeof input.received_at !== 'string' ||
    !Number.isInteger(input.http_status) ||
    (input.http_status as number) < 200 ||
    (input.http_status as number) >= 300 ||
    typeof input.latency_ms !== 'number' ||
    !Number.isFinite(input.latency_ms) ||
    input.latency_ms < 0 ||
    !Number.isSafeInteger(input.new_rows) ||
    (input.new_rows as number) < 0 ||
    (input.outcome !== 'ok' && input.outcome !== 'unchanged') ||
    input.raw_file_id !== fileId ||
    (input.error !== undefined && input.error !== '')
  )
    return storage('invalid receipt poll')
  instant(input.started_at)
  instant(input.received_at)
  return {
    poll_id: input.poll_id,
    source_kind: config.sourceKind,
    source_id: config.id,
    started_at: input.started_at,
    received_at: input.received_at,
    http_status: input.http_status as number,
    latency_ms: input.latency_ms,
    outcome: input.outcome as string,
    new_rows: input.new_rows as number,
    raw_file_id: fileId,
    ...(input.error === undefined ? {} : { error: '' })
  }
}
export function decodeMetReceipt(raw: string | null, kind: MetKind): MetReceipt | null {
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !object(value) ||
      value.version !== 1 ||
      value.kind !== kind ||
      !nonempty(value.rawFileId) ||
      typeof value.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(value.sha256)
    )
      throw new Error('invalid metadata')
    return {
      version: 1,
      kind,
      poll: pollMetadata(value.poll, kind, value.rawFileId),
      rawFileId: value.rawFileId,
      sha256: value.sha256
    }
  } catch (error) {
    throw new Error(`Invalid MET receipt: ${message(error)}`)
  }
}
function register(ports: MetPollPorts, kind: MetKind): void {
  const config = CONFIG[kind]
  const bound = ports.readSources().filter((row) => row.source_id === config.id)
  if (bound.some((row) => row.kind !== config.sourceKind)) return storage(`incompatible source kind for ${config.id}`)
  if (!bound.length)
    ports.appendSources([
      {
        source_id: config.id,
        kind: config.sourceKind,
        name: config.name,
        cadence_min: config.cadence,
        stale_after_min: config.stale,
        freshness: 'polled',
        licence: 'CC BY 4.0, MET Malaysia via data.gov.my',
        url: config.url
      }
    ])
  if (ports.readGlossary().length === 0)
    ports.appendGlossary(GLOSSARY.map(([ms_phrase, en_gloss]) => ({ ms_phrase, en_gloss })))
}
function checkBody(raw: MetRawBody): void {
  if (!Array.isArray(raw.bytes) || !raw.bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255))
    throw new Error('invalid unsigned raw bytes')
  if (typeof raw.text !== 'string') throw new Error('invalid UTF-8 body')
}
function parse(kind: MetKind, raw: MetRawBody): ParsedMetWarning[] | ParsedMetForecast[] {
  checkBody(raw)
  const payload: unknown = JSON.parse(raw.text!)
  return kind === 'warning' ? parseMetWarnings(payload) : parseMetForecast(payload)
}
function archive(
  ports: MetPollPorts,
  kind: MetKind,
  id: string,
  digest?: string
): { raw: MetRawBody; parsed: ParsedMetWarning[] | ParsedMetForecast[] } {
  try {
    const raw = ports.readRaw(id)
    const parsed = parse(kind, raw)
    if (digest !== undefined && ports.hashBytes(raw.bytes).toLowerCase() !== digest.toLowerCase())
      throw new Error('archive digest mismatch')
    return { raw, parsed }
  } catch (error) {
    return storage(`archive ${id}: ${message(error)}`)
  }
}
function same(row: Record<string, unknown>, item: object): boolean {
  return Object.entries(item).every(([field, value]) => row[field] === value)
}
function warningRows(ports: MetPollPorts): StoredMetWarning[] {
  return ports.readWarnings().map(({ rowNumber, row }) => {
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 2) return storage('invalid warning row number')
    const normalized = { ...row }
    for (const field of ['issued', 'first_seen_at', 'last_seen_at', 'valid_from', 'valid_to'] as const) {
      if (normalized[field] === '' && (field === 'valid_from' || field === 'valid_to')) continue
      normalized[field] = instant(normalized[field])
    }
    const problems = validateMetWarningRow(normalized)
    if (problems.length) return storage(`warning row ${rowNumber}: ${problems.join('; ')}`)
    return { rowNumber, row: normalized }
  })
}
function forecastRows(ports: MetPollPorts): Row<'forecast'>[] {
  return ports
    .readForecast()
    .filter((row) => row.location_id === 'Ds058')
    .map((row) => {
      try {
        const date = row.date instanceof Date ? toMytIso(row.date).slice(0, 10) : row.date
        const parsed = parseMetForecast([
          { ...row, date, location: { location_id: 'Ds058', location_name: 'Kuala Lumpur' } }
        ])[0]!
        if (row.afternoon_thunderstorm !== parsed.afternoon_thunderstorm || !nonempty(row.poll_id))
          throw new Error('invalid forecast metadata')
        return { ...row, date: parsed.date, first_seen_at: instant(row.first_seen_at) }
      } catch (error) {
        return storage(`forecast row: ${message(error)}`)
      }
    })
}
interface Changes {
  warnings: Row<'warnings'>[]
  forecast: Row<'forecast'>[]
  touches: { rowNumber: number; at: string }[]
  owned: number
}
function changes(
  kind: MetKind,
  parsed: ParsedMetWarning[] | ParsedMetForecast[],
  poll: Row<'polls'>,
  ports: MetPollPorts
): Changes {
  const result: Changes = { warnings: [], forecast: [], touches: [], owned: 0 }
  const receiptTime = instant(poll.received_at)
  if (kind === 'warning') {
    const stored = warningRows(ports)
    for (const item of parsed as ParsedMetWarning[]) {
      const versions = stored.filter((entry) => entry.row.warning_key === item.warning_key)
      const own = versions.filter((entry) => entry.row.poll_id === poll.poll_id)
      if (own.length > 1) return storage('duplicate warning version')
      if (own.length) {
        const expected = {
          ...item,
          first_seen_at: receiptTime,
          poll_id: poll.poll_id,
          http_status: poll.http_status,
          latency_ms: poll.latency_ms
        }
        if (!same(own[0]!.row, expected)) return storage('warning receipt row mismatch')
        result.owned++
        continue
      }
      const latest = versions.reduce<StoredMetWarning | undefined>(
        (best, entry) =>
          !best || Date.parse(String(entry.row.first_seen_at)) >= Date.parse(String(best.row.first_seen_at))
            ? entry
            : best,
        undefined
      )
      if (latest && same(latest.row, item)) {
        if (Date.parse(String(latest.row.last_seen_at)) < Date.parse(receiptTime))
          result.touches.push({ rowNumber: latest.rowNumber, at: receiptTime })
      } else
        result.warnings.push({
          ...item,
          first_seen_at: receiptTime,
          last_seen_at: receiptTime,
          poll_id: poll.poll_id,
          http_status: poll.http_status,
          latency_ms: poll.latency_ms
        })
    }
    if (stored.filter((entry) => entry.row.poll_id === poll.poll_id).length !== result.owned)
      return storage('extra warning receipt rows')
  } else {
    const stored = forecastRows(ports)
    for (const item of parsed as ParsedMetForecast[]) {
      const versions = stored.filter((row) => row.date === item.date)
      const own = versions.filter((row) => row.poll_id === poll.poll_id)
      if (own.length > 1) return storage('duplicate forecast version')
      if (own.length) {
        if (!same(own[0]!, { ...item, first_seen_at: receiptTime })) return storage('forecast receipt row mismatch')
        result.owned++
        continue
      }
      const latest = versions.reduce<Row<'forecast'> | undefined>(
        (best, row) =>
          !best || Date.parse(String(row.first_seen_at)) >= Date.parse(String(best.first_seen_at)) ? row : best,
        undefined
      )
      if (!latest || !same(latest, item))
        result.forecast.push({ ...item, first_seen_at: receiptTime, poll_id: poll.poll_id })
    }
    if (stored.filter((row) => row.poll_id === poll.poll_id).length !== result.owned)
      return storage('extra forecast receipt rows')
  }
  return result
}
function normalizedPoll(row: Row<'polls'>): Row<'polls'> {
  return { ...row, started_at: instant(row.started_at), received_at: instant(row.received_at) }
}
function finish(
  receipt: MetReceipt,
  parsed: ParsedMetWarning[] | ParsedMetForecast[],
  ports: MetPollPorts
): { appended: number; touched: number } {
  const work = changes(receipt.kind, parsed, receipt.poll, ports)
  const appended = work.warnings.length + work.forecast.length
  if (work.owned + appended !== receipt.poll.new_rows) return storage('receipt intended row count mismatch')
  const polls = ports.readPolls().filter((row) => row.poll_id === receipt.poll.poll_id)
  if (polls.length > 1 || (polls.length === 1 && !same(normalizedPoll(polls[0]!), normalizedPoll(receipt.poll))))
    return storage('receipt poll collision')
  if (polls.length) {
    if (appended > 0) return storage('persisted poll missing feed rows')
    ports.clearPending(receipt.kind)
    return { appended: 0, touched: 0 }
  }
  if (work.warnings.length) ports.appendWarnings(work.warnings)
  if (work.forecast.length) ports.appendForecast(work.forecast)
  for (const touch of work.touches) ports.updateLastSeen(touch.rowNumber, touch.at)
  // Native appendPoll flushes both preceding feed writes and the poll before clear.
  ports.appendPoll(receipt.poll)
  ports.clearPending(receipt.kind)
  return { appended, touched: work.touches.length }
}
export function runMetPoll(kind: MetKind, ports: MetPollPorts): MetPollReport {
  register(ports, kind)
  let appendedRows = 0
  let touchedWarnings = 0
  const recoveredPollIds: string[] = []
  const pending = ports.readPending(kind)
  const receipt = decodeMetReceipt(pending === null ? null : JSON.stringify(pending), kind)
  if (receipt) {
    const recovered = archive(ports, kind, receipt.rawFileId, receipt.sha256)
    const result = finish(receipt, recovered.parsed, ports)
    appendedRows += result.appended
    touchedWarnings += result.touched
    recoveredPollIds.push(String(receipt.poll.poll_id))
  }
  const pollId = ports.newPollId()
  const started = ports.now()
  let response: MetHttpResponse | undefined
  let parsed: ParsedMetWarning[] | ParsedMetForecast[] | undefined
  let error: string | undefined
  try {
    response = ports.fetch(CONFIG[kind].url)
  } catch (failure) {
    error = message(failure)
  }
  const received = ports.now()
  if (response) {
    if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300)
      error = `HTTP ${response.status}`
    else {
      try {
        parsed = parse(kind, response)
      } catch (failure) {
        error = message(failure)
      }
    }
  }
  const poll: Row<'polls'> = {
    poll_id: pollId,
    source_kind: CONFIG[kind].sourceKind,
    source_id: CONFIG[kind].id,
    started_at: toMytIso(started),
    received_at: toMytIso(received),
    http_status: response?.status ?? 0,
    latency_ms: received.getTime() - started.getTime(),
    outcome: 'error',
    new_rows: 0
  }
  if (parsed === undefined || response === undefined) {
    poll.error = error ?? 'MET source failed'
    ports.appendPoll(poll)
    ports.evaluate()
    return { poll, recoveredPollIds, appendedRows, touchedWarnings, rawCreated: false }
  }
  const work = changes(kind, parsed, poll, ports)
  poll.new_rows = work.warnings.length + work.forecast.length
  const previous = ports
    .readPolls()
    .filter(
      (row) =>
        row.source_kind === CONFIG[kind].sourceKind &&
        row.source_id === CONFIG[kind].id &&
        (row.outcome === 'ok' || row.outcome === 'unchanged')
    )
    .at(-1)
  let rawFileId: string | undefined
  if (previous) {
    if (!nonempty(previous.raw_file_id)) return storage('successful poll missing raw ID')
    pollMetadata(normalizedPoll(previous), kind, previous.raw_file_id)
    const prior = archive(ports, kind, previous.raw_file_id)
    if (
      prior.raw.bytes.length === response.bytes.length &&
      prior.raw.bytes.every((byte, i) => byte === response.bytes[i])
    )
      rawFileId = previous.raw_file_id
  }
  const rawCreated = rawFileId === undefined
  if (rawFileId === undefined) {
    const stamp = String(poll.received_at).slice(0, 19).replaceAll('-', '').replace('T', '-').replaceAll(':', '')
    rawFileId = ports.createRaw(`${kind}-${stamp}.json`, response.bytes)
  }
  if (!nonempty(rawFileId)) return storage('archive returned empty ID')
  poll.raw_file_id = rawFileId
  poll.outcome = rawCreated ? 'ok' : 'unchanged'
  const next = decodeMetReceipt(
    JSON.stringify({ version: 1, kind, poll, rawFileId, sha256: ports.hashBytes(response.bytes) }),
    kind
  )!
  ports.savePending(kind, next)
  const result = finish(next, parsed, ports)
  appendedRows += result.appended
  touchedWarnings += result.touched
  ports.evaluate()
  return { poll: next.poll, recoveredPollIds, appendedRows, touchedWarnings, rawCreated }
}
export function runMetHandler(runtime: {
  kind: MetKind
  withLock<T>(fn: () => T): T
  ports: MetPollPorts
}): MetPollReport {
  return runtime.withLock(() => runMetPoll(runtime.kind, runtime.ports))
}
export function verifyMetWarningText(ports: MetPollPorts): MetTextVerification {
  const rows = ports.readWarnings()
  const report: MetTextVerification = {
    status: rows.length ? 'match' : 'no_data',
    rowsChecked: rows.length,
    comparedFields: 0,
    matchedFields: 0,
    problems: []
  }
  const polls = ports.readPolls()
  const cache = new Map<string, ParsedMetWarning[] | Error>()
  for (const { row } of rows) {
    const warningKey = String(row.warning_key ?? '')
    const problem = (field: string, reason: string) => {
      report.problems.push({ warningKey, field, reason })
    }
    report.comparedFields += 2
    const matches = polls.filter((poll) => poll.poll_id === row.poll_id)
    if (
      matches.length !== 1 ||
      matches[0]!.source_kind !== 'met_warning' ||
      matches[0]!.source_id !== 'met_warning' ||
      typeof matches[0]!.http_status !== 'number' ||
      Number(matches[0]!.http_status) < 200 ||
      Number(matches[0]!.http_status) >= 300 ||
      !['ok', 'unchanged'].includes(String(matches[0]!.outcome))
    ) {
      problem('poll_id', 'Missing or wrong source poll')
      continue
    }
    const id = matches[0]!.raw_file_id
    if (!nonempty(id)) {
      problem('raw_file_id', 'Missing raw file ID')
      continue
    }
    if (!cache.has(id)) {
      try {
        cache.set(id, parse('warning', ports.readRaw(id)) as ParsedMetWarning[])
      } catch (error) {
        cache.set(id, new Error(message(error)))
      }
    }
    const parsed = cache.get(id)!
    if (parsed instanceof Error) {
      problem('raw_file_id', `Raw decode failed: ${parsed.message}`)
      continue
    }
    const source = parsed.find((item) => item.warning_key === row.warning_key)
    if (!source) {
      problem('warning_key', 'Key absent from this revision archive')
      continue
    }
    for (const field of ['text_en', 'text_bm'] as const) {
      if (source[field] === row[field]) report.matchedFields++
      else problem(field, 'Published field mismatch')
    }
  }
  if (report.problems.length) report.status = 'mismatch'
  return report
}
