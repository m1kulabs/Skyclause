import type { ReadingInput, Source } from '../contract'
import { SchemaError } from '../errors'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function utcTimestamp(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+08:00)?$/.test(raw)) {
    throw new SchemaError('Invalid JPS timestamp')
  }
  const local = raw.slice(0, 19)
  const milliseconds = Date.parse(`${local}+08:00`)
  // Round-trip in MYT to reject calendar rollovers and hour 24.
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds + 8 * 60 * 60 * 1000).toISOString().slice(0, 19) !== local
  ) {
    throw new SchemaError(`Invalid JPS timestamp: ${raw}`)
  }
  return new Date(milliseconds).toISOString()
}

export function parseJpsRainfall(raw: unknown, source: Source): ReadingInput<'jps_rain'>[] {
  if (!record(raw) || raw.stationId !== source.externalId || !Array.isArray(raw.data)) {
    throw new SchemaError('Expected JPS stationId and data array for the bound source')
  }
  const seen = new Map<string, number>()
  const readings: ReadingInput<'jps_rain'>[] = []
  for (const row of raw.data) {
    if (!record(row) || typeof row.rf !== 'number' || !Number.isFinite(row.rf)) {
      throw new SchemaError('Expected a JPS row with finite numeric rf')
    }
    const observedAt = utcTimestamp(row.timestamp)
    if (seen.has(observedAt)) {
      if (seen.get(observedAt) !== row.rf) throw new SchemaError(`Conflicting JPS timestamp: ${observedAt}`)
      continue
    }
    seen.set(observedAt, row.rf)
    readings.push({ sourceId: source.id, metric: 'rain_5m_mm', observedAt, value: row.rf, valueJson: null, unit: 'mm' })
  }
  return readings
}
