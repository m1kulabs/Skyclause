import { toMytIso } from '../../shared/time.ts'
import { metNamesKl } from './met-warning.ts'
import type { Row } from './schema.ts'

export const MET_WARNING_ENDPOINT = 'https://api.data.gov.my/weather/warning/'
export const MET_FORECAST_ENDPOINT =
  'https://api.data.gov.my/weather/forecast/?contains=Kuala%20Lumpur@location__location_name'
export type MetKind = 'warning' | 'forecast'

export interface ParsedMetWarning {
  warning_key: string
  issued: string
  title_en: string
  title_bm: string
  valid_from: string
  valid_to: string
  heading_en: string
  text_en: string
  instruction_en: string
  heading_bm: string
  text_bm: string
  instruction_bm: string
  names_kl: boolean
}

export interface ParsedMetForecast {
  date: string
  location_id: 'Ds058'
  morning_forecast: string
  afternoon_forecast: string
  night_forecast: string
  summary_forecast: string
  summary_when: string
  min_temp: number
  max_temp: number
  afternoon_thunderstorm: boolean
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`MET ${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, nullable = false): string {
  if (nullable && value === null) return ''
  if (typeof value !== 'string') throw new Error(`MET ${field} must be a string`)
  if (value.length > 50000) throw new Error(`MET ${field} exceeds 50000 UTF-16 units`)
  return value
}

function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid MET date')
  const parsed = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid MET date')
  }
  return value
}

function timestamp(value: unknown, field: string, nullable = false, explicit = false): string {
  if (nullable && value === null) return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\+08:00)?$/.test(value)) {
    throw new Error(`Invalid MET ${field}: expected MYT instant`)
  }
  if (explicit && !value.endsWith('+08:00')) throw new Error(`Invalid MET ${field}: explicit MYT required`)
  const normalized = value.endsWith('+08:00') ? value : `${value}+08:00`
  const parsed = Date.parse(normalized)
  if (!Number.isFinite(parsed) || toMytIso(new Date(parsed)) !== normalized) throw new Error(`Invalid MET ${field}`)
  return normalized
}

function unique<T>(rows: T[], key: (row: T) => string): T[] {
  const found = new Map<string, T>()
  for (const row of rows) {
    const identity = key(row)
    const previous = found.get(identity)
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(row)) {
      throw new Error('Conflicting MET duplicate')
    }
    if (previous === undefined) found.set(identity, row)
  }
  return [...found.values()]
}

export function parseMetWarnings(payload: unknown): ParsedMetWarning[] {
  if (!Array.isArray(payload)) throw new Error('MET warnings must be an array')
  const rows = payload.map((entry): ParsedMetWarning => {
    const row = object(entry, 'warning row')
    const issue = object(row.warning_issue, 'warning_issue')
    const issued = timestamp(issue.issued, 'issued')
    const title_en = text(issue.title_en, 'title_en')
    const title_bm = text(issue.title_bm, 'title_bm')
    const valid_from = timestamp(row.valid_from, 'valid_from', true)
    const valid_to = timestamp(row.valid_to, 'valid_to', true)
    if (valid_from && valid_to && Date.parse(valid_from) > Date.parse(valid_to)) {
      throw new Error('MET warning validity is reversed')
    }
    const text_en = text(row.text_en, 'text_en')
    const text_bm = text(row.text_bm, 'text_bm')
    return {
      warning_key: text(`${issued}·${title_en}·${valid_from}`, 'warning_key'),
      issued,
      title_en,
      title_bm,
      valid_from,
      valid_to,
      heading_en: text(row.heading_en, 'heading_en'),
      text_en,
      instruction_en: text(row.instruction_en, 'instruction_en', true),
      heading_bm: text(row.heading_bm, 'heading_bm'),
      text_bm,
      instruction_bm: text(row.instruction_bm, 'instruction_bm', true),
      names_kl: metNamesKl({ title_en, text_en, text_bm })
    }
  })
  return unique(rows, (row) => row.warning_key)
}

function temperature(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`Invalid MET ${field}: expected integer`)
  return value
}

export function parseMetForecast(payload: unknown): ParsedMetForecast[] {
  if (!Array.isArray(payload)) throw new Error('MET forecasts must be an array')
  const rows: ParsedMetForecast[] = []
  for (const entry of payload) {
    const row = object(entry, 'forecast row')
    const location = object(row.location, 'location')
    const locationId = text(location.location_id, 'location_id')
    if (locationId.trim() === '') throw new Error('MET location_id is missing')
    if (locationId !== 'Ds058') continue
    text(location.location_name, 'location_name')
    const min_temp = temperature(row.min_temp, 'min_temp')
    const max_temp = temperature(row.max_temp, 'max_temp')
    if (min_temp > max_temp) throw new Error('MET min_temp exceeds max_temp')
    const afternoon_forecast = text(row.afternoon_forecast, 'afternoon_forecast')
    rows.push({
      date: date(row.date),
      location_id: 'Ds058',
      morning_forecast: text(row.morning_forecast, 'morning_forecast'),
      afternoon_forecast,
      night_forecast: text(row.night_forecast, 'night_forecast'),
      summary_forecast: text(row.summary_forecast, 'summary_forecast'),
      summary_when: text(row.summary_when, 'summary_when'),
      min_temp,
      max_temp,
      afternoon_thunderstorm: /ribut petir/i.test(afternoon_forecast)
    })
  }
  if (rows.length === 0) throw new Error('No MET forecast for Ds058')
  return unique(rows, (row) => row.date)
}

export function validateMetWarningRow(row: Row<'warnings'>): string[] {
  const problems: string[] = []
  for (const field of ['issued', 'first_seen_at', 'last_seen_at'] as const) {
    try {
      timestamp(row[field], field, false, true)
    } catch (error) {
      problems.push((error as Error).message)
    }
  }
  for (const field of ['warning_key', 'poll_id'] as const) {
    if (typeof row[field] !== 'string' || row[field] === '') problems.push(`${field} is missing`)
    else if (row[field].length > 50000) problems.push(`${field} exceeds 50000 UTF-16 units`)
  }
  if (
    typeof row.http_status !== 'number' ||
    !Number.isInteger(row.http_status) ||
    row.http_status < 0 ||
    row.http_status > 599
  ) {
    problems.push('http_status must be an integer from 0 to 599')
  }
  if (typeof row.latency_ms !== 'number' || !Number.isFinite(row.latency_ms) || row.latency_ms < 0) {
    problems.push('latency_ms must be a nonnegative number')
  }
  if (typeof row.names_kl !== 'boolean') problems.push('names_kl must be a boolean')
  for (const field of ['instruction_en', 'instruction_bm', 'valid_from', 'valid_to'] as const) {
    if (typeof row[field] !== 'string') problems.push(`${field} must be a normalized string`)
  }
  for (const field of ['valid_from', 'valid_to'] as const) {
    if (row[field] === '') continue
    try {
      timestamp(row[field], field, false, true)
    } catch (error) {
      problems.push((error as Error).message)
    }
  }
  try {
    const parsed = parseMetWarnings([
      {
        ...row,
        warning_issue: { issued: row.issued, title_en: row.title_en, title_bm: row.title_bm },
        valid_from: row.valid_from === '' ? null : row.valid_from,
        valid_to: row.valid_to === '' ? null : row.valid_to
      }
    ])[0]!
    if (row.warning_key !== parsed.warning_key) problems.push('warning_key does not match published fields')
    if (row.names_kl !== parsed.names_kl) problems.push('names_kl does not match published fields')
  } catch (error) {
    problems.push((error as Error).message)
  }
  return problems
}
