import { toMytIso } from '../../shared/time.ts'

export const APIMS_ENDPOINT = 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm'
export const APIMS_HISTORY_ENDPOINT = 'https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly'
export type ApimsStationId = 'CA16W' | 'CA19B' | 'CA17W'
export const APIMS_STATIONS: readonly { id: ApimsStationId; stateId: 14 | 10 | 16; name: string }[] = [
  { id: 'CA16W', stateId: 14, name: 'Cheras, W.P. KUALA LUMPUR' },
  { id: 'CA19B', stateId: 10, name: 'Petaling Jaya, SELANGOR' },
  { id: 'CA17W', stateId: 16, name: 'Putrajaya, W.P. PUTRAJAYA' }
]

export interface ParsedApimsReading {
  stationId: ApimsStationId
  observedAt: string
  value: number
  className?: string
}
export interface ApimsParseResult {
  readings: ParsedApimsReading[]
  diagnostics: string[]
}

function hour(raw: unknown, requireOffset = false): string {
  const pattern = requireOffset
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\+08:00$/
    : /^\d{4}-\d{2}-\d{2}T\d{2}:00:00(?:\+08:00)?$/
  if (typeof raw !== 'string' || !pattern.test(raw)) {
    throw new Error(`Invalid APIMS hour: ${String(raw)}`)
  }
  const iso = raw.endsWith('+08:00') ? raw : `${raw}+08:00`
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms) || toMytIso(new Date(ms)) !== iso) {
    throw new Error(`Invalid APIMS hour: ${raw}`)
  }
  return iso
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`APIMS ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function parse(
  payload: unknown,
  field: 'data' | 'api_table_hourly',
  allowed: readonly ApimsStationId[],
  end?: string
): ApimsParseResult {
  const rows = object(payload, 'payload')[field]
  if (!Array.isArray(rows)) throw new Error(`APIMS ${field} must be an array`)
  const readings: ParsedApimsReading[] = []
  const diagnostics: string[] = []
  const seen = new Map<string, number>()
  const endMs = end === undefined ? undefined : Date.parse(end)

  for (const entry of rows) {
    const row = object(entry, 'data row')
    if (typeof row.STATION_ID !== 'string' || row.STATION_ID.trim() === '') {
      throw new Error('Invalid APIMS STATION_ID')
    }
    const station = APIMS_STATIONS.find((station) => station.id === row.STATION_ID)
    if (!station || !allowed.includes(station.id)) continue
    if (row.STATE_ID !== station.stateId) throw new Error(`Invalid APIMS state for ${station.id}`)
    if (typeof row.STATION_LOCATION !== 'string' || row.STATION_LOCATION.trim() === '') {
      throw new Error(`Invalid APIMS station location for ${station.id}`)
    }
    const observedAt = hour(row[field === 'data' ? 'RECORD_DT' : 'DATETIME'])
    const observedMs = Date.parse(observedAt)
    if (endMs !== undefined && (observedMs < endMs - 24 * 60 * 60 * 1000 || observedMs > endMs)) {
      throw new Error(`APIMS ${station.id} hour ${observedAt} outside requested interval ending ${end}`)
    }
    const className = row.CLASS
    if ((field === 'data' || 'CLASS' in row) && (typeof className !== 'string' || className.trim() === '')) {
      throw new Error(`Invalid APIMS CLASS for ${station.id}`)
    }
    const value = row.API
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      diagnostics.push(`Invalid APIMS API for ${station.id} at ${observedAt}: ${String(value)}`)
      continue
    }
    const key = `${station.id}:${observedAt}`
    const previous = seen.get(key)
    if (previous !== undefined) {
      if (previous !== value) throw new Error(`Conflicting APIMS duplicate ${key}: ${previous} vs ${value}`)
      continue
    }
    seen.set(key, value)
    readings.push({
      stationId: station.id,
      observedAt,
      value,
      ...(typeof className === 'string' ? { className } : {})
    })
  }
  for (const stationId of new Set(allowed)) {
    if (!readings.some((row) => row.stationId === stationId)) {
      diagnostics.push(`No valid APIMS readings for ${stationId}`)
    }
  }
  return { readings, diagnostics }
}

export function parseApimsLatest(payload: unknown, allowed: readonly ApimsStationId[]): ApimsParseResult {
  return parse(payload, 'data', allowed)
}

export function parseApimsHistory(
  payload: unknown,
  request: { stationId: ApimsStationId; stateId: 14 | 10 | 16; end: string }
): ApimsParseResult {
  const end = hour(request.end, true)
  const station = APIMS_STATIONS.find((station) => station.id === request.stationId)
  if (!station || station.stateId !== request.stateId) throw new Error('Invalid APIMS history station/state request')
  return parse(payload, 'api_table_hourly', [request.stationId], end)
}

export function apimsHistoryUrl(stateId: number, end: string): string {
  const offsetless = hour(end, true).slice(0, -6)
  return `${APIMS_HISTORY_ENDPOINT}?stateid=${stateId}&datetime=${encodeURIComponent(offsetless)}`
}

export function apimsHistoryKey(stateId: number, end: string): string {
  return `apims:backfill:${stateId}:${hour(end, true)}`
}
