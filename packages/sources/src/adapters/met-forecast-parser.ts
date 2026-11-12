import type { DiscoveredSource, ReadingInput, Source } from '../contract'
import { SOURCE_METRICS } from '../contract'
import { SchemaError } from '../errors'
import { glossMetForecastPhrase } from './met-forecast-gloss'
import type { z } from 'zod'

type ForecastValue = ReadingInput<'met_forecast'>['valueJson']
const rawSchema = SOURCE_METRICS.met_forecast.forecast_day.value_json.omit({ gloss_en: true })
type ForecastRaw = z.infer<typeof rawSchema>
const glossFields = [
  'morning_forecast',
  'afternoon_forecast',
  'night_forecast',
  'summary_forecast',
  'summary_when'
] as const

export function metForecastSource(sources: Source[]): Source {
  if (
    sources.length !== 1 ||
    sources[0]!.kind !== 'met_forecast' ||
    !sources[0]!.externalId.trim() ||
    !sources[0]!.name.trim()
  ) {
    throw new SchemaError('Expected exactly one bound MET forecast source')
  }
  return sources[0]!
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validatedRow(value: unknown): ForecastRaw {
  if (!rawSchema.safeParse(value).success) throw new SchemaError('Invalid MET forecast record')
  const row = value as ForecastRaw
  // Round-trip rejects impossible local dates regardless of date-parser rollover rules.
  const ms = Date.parse(`${row.date}T00:00:00+08:00`)
  if (!Number.isFinite(ms) || new Date(ms + 8 * 3600_000).toISOString().slice(0, 10) !== row.date) {
    throw new SchemaError('Invalid MET forecast date')
  }
  return row
}

export function parseMetForecast(raw: unknown, sources: Source[]): ReadingInput<'met_forecast'>[] {
  const source = metForecastSource(sources)
  if (!Array.isArray(raw)) throw new SchemaError('Expected MET forecast array')
  const readings: ReadingInput<'met_forecast'>[] = []
  const seen = new Map<string, string>()
  for (const value of raw) {
    if (
      !record(value) ||
      !record(value.location) ||
      typeof value.location.location_id !== 'string' ||
      !value.location.location_id.trim() ||
      typeof value.location.location_name !== 'string' ||
      !value.location.location_name.trim()
    ) {
      throw new SchemaError('Ambiguous MET forecast location identity')
    }
    if (value.location.location_id !== source.externalId) continue
    const row = validatedRow(value)
    // Include nested location fields and extras in duplicate comparison.
    const fingerprint = JSON.stringify(row, (_key, current: unknown) =>
      record(current) ? Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b))) : current
    )
    if (seen.has(row.date)) {
      if (seen.get(row.date) !== fingerprint) throw new SchemaError(`Conflicting MET forecast day: ${row.date}`)
      continue
    }
    seen.set(row.date, fingerprint)
    const gloss: Record<string, string> = {}
    for (const field of glossFields) {
      const phrase = row[field]
      const known = glossMetForecastPhrase(phrase)
      if (known !== undefined) gloss[field] = known
    }
    readings.push({
      sourceId: source.id,
      metric: 'forecast_day',
      observedAt: new Date(`${row.date}T00:00:00+08:00`).toISOString(),
      value: /ribut petir/i.test(row.afternoon_forecast) ? 1 : 0,
      valueText: row.afternoon_forecast,
      valueJson: { ...row, gloss_en: gloss } as ForecastValue,
      unit: null,
      itemKey: row.date
    })
  }
  if (!readings.length) throw new SchemaError(`No MET forecast rows for ${source.externalId}`)
  return readings
}

export function parseMetForecastCatalogue(raw: unknown): DiscoveredSource[] {
  if (!Array.isArray(raw) || !raw.length) throw new SchemaError('Expected nonempty MET forecast catalogue')
  const sources = new Map<string, DiscoveredSource>()
  for (const value of raw) {
    const row = validatedRow(value)
    const { location_id: externalId, location_name: name } = row.location
    if (sources.has(externalId) && sources.get(externalId)!.name !== name)
      throw new SchemaError(`Conflicting MET location: ${externalId}`)
    sources.set(externalId, {
      externalId,
      name,
      lat: null,
      lon: null,
      url: 'https://api.data.gov.my/weather/forecast/',
      meta: { location_name: name }
    })
  }
  return [...sources.values()]
}
