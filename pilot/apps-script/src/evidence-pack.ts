import { toMytIso } from '../../shared/time.ts'
import { CAMERA_SOURCE_ID } from './camera.ts'
import type { EvidenceKind, ParsedEvidenceRequest } from './evidence-request.ts'
import type {
  EvidenceForecast,
  EvidenceFrame,
  EvidenceGlossary,
  EvidenceGrade,
  EvidenceLedger,
  EvidenceNow,
  EvidencePackData,
  EvidenceReading,
  EvidenceWarning,
  EvidenceWindow
} from './evidence-projections.ts'
import { BOUND_APIMS_STATION_IDS } from './indicators.ts'
import { JPS_METRIC, JPS_SOURCE_ID, JPS_SOURCE_KIND } from './jps.ts'

export interface EvidenceHeader {
  kind: EvidenceKind
  project_slug: string
  received_at: string
  assembled_at: string
  span_start: string | null
  span_end: string | null
  date_label: string | null
  start_time: string | null
  end_time: string | null
}
export interface EvidenceSeries {
  source_id: string
  source_kind: string
  metric: string
  unit: string
  rows: [string, string | number, number][]
  rain_60m?: [string, number | null][]
}
interface EvidenceSections {
  readings: EvidenceSeries[]
  warnings: EvidenceWarning[] | 'No warning record for this window'
  ledger: (EvidenceLedger & { grades: EvidenceGrade[] })[]
  frames: EvidenceFrame[] | 'No frames held for this window'
}
export type EvidencePack =
  | { header: EvidenceHeader & { kind: 'unsubscribe' | 'unparseable' } }
  | ({ header: EvidenceHeader & { kind: 'evidence' } } & EvidenceSections)
  | ({
      header: EvidenceHeader & { kind: 'call' }
      windows: EvidenceWindow[]
      now: EvidenceNow[]
      forecast?: EvidenceForecast
      glossary: EvidenceGlossary[]
    } & EvidenceSections)

const MINUTE = 60_000
function ms(value: string | null): number {
  return value === null ? NaN : Date.parse(value)
}
function available(value: string | null, cutoff: number): boolean {
  return value === null || ms(value) <= cutoff
}
function inSpan(value: string | null, start: number, end: number): boolean {
  return ms(value) > start && ms(value) <= end
}
function eventInSpan(value: string | null, start: number, end: number): boolean {
  return ms(value) >= start && ms(value) <= end
}
function overlaps(from: string | null, to: string | null, start: number, end: number): boolean {
  return ms(from) <= ms(to) && ms(from) <= end && ms(to) >= start
}
function windowInstant(day: string | null, value: string | null): string | null {
  return value && /^\d{2}:\d{2}$/.test(value) ? (day ? `${day}T${value}:00+08:00` : null) : value
}
function dateLabel(iso: string): string {
  const date = new Date(ms(iso) + 8 * 60 * MINUTE)
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}
function allowedReading(r: EvidenceReading): boolean {
  return (
    (r.source_kind === JPS_SOURCE_KIND &&
      r.source_id === JPS_SOURCE_ID &&
      r.metric === JPS_METRIC &&
      typeof r.value === 'number') ||
    (r.source_kind === 'apims' &&
      (BOUND_APIMS_STATION_IDS as readonly string[]).includes(r.source_id) &&
      r.metric === 'api' &&
      typeof r.value === 'number') ||
    (r.source_kind === 'camera' &&
      r.source_id === CAMERA_SOURCE_ID &&
      ((['contrast_near', 'contrast_far'].includes(r.metric) && typeof r.value === 'number') ||
        (r.metric === 'flag' && ['visible', 'obscured'].includes(String(r.value)))))
  )
}
function readingSeries(data: EvidencePackData, start: number, end: number, cutoff: number): EvidenceSeries[] {
  const groups = new Map<string, EvidenceReading[]>()
  for (const reading of data.readings) {
    if (
      !allowedReading(reading) ||
      ms(reading.received_at) > cutoff ||
      ms(reading.observed_at) > end ||
      ms(reading.observed_at) <= start - 60 * MINUTE
    )
      continue
    const key = JSON.stringify([reading.source_kind, reading.source_id, reading.metric, reading.unit])
    const group = groups.get(key) ?? []
    group.push(reading)
    groups.set(key, group)
  }
  const series: EvidenceSeries[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => ms(a.observed_at) - ms(b.observed_at) || a.revision - b.revision)
    const visible = group.filter((r) => inSpan(r.observed_at, start, end))
    const first = visible[0]
    if (!first) continue
    const item: EvidenceSeries = {
      source_id: first.source_id,
      source_kind: first.source_kind,
      metric: first.metric,
      unit: first.unit,
      rows: visible.map((r) => [r.observed_at, r.value, r.revision])
    }
    if (first.source_id === JPS_SOURCE_ID) {
      const latest = new Map<number, EvidenceReading>()
      for (const r of group) latest.set(ms(r.observed_at), r)
      item.rain_60m = [...new Set(visible.map((r) => r.observed_at))].map((at) => {
        let total = 0
        for (let step = 0; step < 12; step++) {
          const r = latest.get(ms(at) - step * 5 * MINUTE)
          if (!r || typeof r.value !== 'number') return [at, null]
          total += r.value
        }
        return [at, Math.round(total * 1e10) / 1e10]
      })
    }
    series.push(item)
  }
  return series
}
function selectWarnings(data: EvidencePackData, start: number, end: number, cutoff: number): EvidenceWarning[] {
  const latest = new Map<string, EvidenceWarning>()
  for (const row of data.warnings) {
    if (!row.warning_key || !available(row.first_seen_at, cutoff) || !available(row.issued, cutoff)) continue
    const current = latest.get(row.warning_key)
    if (
      !current ||
      (ms(row.issued) || 0) > (ms(current.issued) || 0) ||
      ((ms(row.issued) || 0) === (ms(current.issued) || 0) &&
        (ms(row.first_seen_at) || 0) >= (ms(current.first_seen_at) || 0))
    )
      latest.set(row.warning_key, row)
  }
  return [...latest.values()].filter(
    (r) =>
      r.names_kl &&
      !/no advisory|strong winds and rough seas/i.test(r.title_en ?? '') &&
      !/for malaysian waters/i.test(r.text_en ?? '') &&
      overlaps(r.valid_from, r.valid_to, start, end)
  )
}

export function buildEvidencePack(
  request: ParsedEvidenceRequest,
  context: { projectSlug: string; receivedAt: string; assembledAt: string },
  data: EvidencePackData
): EvidencePack {
  const common = {
    project_slug: context.projectSlug,
    received_at: toMytIso(new Date(context.receivedAt)),
    assembled_at: toMytIso(new Date(context.assembledAt))
  }
  if (request.kind === 'unsubscribe' || request.kind === 'unparseable')
    return {
      header: {
        ...common,
        kind: request.kind,
        span_start: null,
        span_end: null,
        date_label: null,
        start_time: null,
        end_time: null
      }
    }
  const spanStart = request.spanStart!,
    spanEnd = request.spanEnd!
  const start = ms(spanStart),
    end = ms(spanEnd),
    cutoff = ms(context.assembledAt)
  const header = {
    ...common,
    span_start: spanStart,
    span_end: spanEnd,
    date_label: dateLabel(spanStart),
    start_time: spanStart.slice(11, 16),
    end_time:
      spanEnd.slice(11, 16) === '00:00' && spanEnd.slice(0, 10) !== spanStart.slice(0, 10)
        ? '24:00'
        : spanEnd.slice(11, 16)
  }
  const windows = data.windows.filter(
    (r) =>
      (request.kind !== 'call' || r.date === spanStart.slice(0, 10)) &&
      available(r.declared_at, cutoff) &&
      overlaps(windowInstant(r.date, r.start_myt), windowInstant(r.date, r.end_myt), start, end)
  )
  const windowIds = new Set(windows.map((r) => r.window_id).filter((id) => id !== null))
  const seenEntries = new Set<string>()
  const ledger = data.ledger
    .filter((r) => {
      if (!available(r.recorded_at, cutoff)) return false
      if (
        !(r['window_id or night_id'] !== null && windowIds.has(r['window_id or night_id'])) &&
        !eventInSpan(r.crossing_at, start, end)
      )
        return false
      if (r.entry_id && seenEntries.has(r.entry_id)) return false
      if (r.entry_id) seenEntries.add(r.entry_id)
      return true
    })
    .map((entry) => ({
      ...entry,
      grades: data.grades.filter(
        (g) =>
          available(g.graded_at, cutoff) &&
          ((g.window_id !== null && g.window_id === entry['window_id or night_id']) ||
            (g.call_id !== null && g.call_id === entry.call_id))
      )
    }))
  const warnings = selectWarnings(data, start, end, cutoff)
  const frames = data.frames.filter(
    (r) => r.frame_file_id && eventInSpan(r.device_time, start, end) && available(r.device_time, cutoff)
  )
  const sections: EvidenceSections = {
    readings: readingSeries(data, start, end, cutoff),
    warnings: warnings.length ? warnings : 'No warning record for this window',
    ledger,
    frames: frames.length ? frames : 'No frames held for this window'
  }
  if (request.kind === 'evidence') return { header: { ...header, kind: 'evidence' }, ...sections }
  const forecast = data.forecast
    .filter((r) => r.date === spanStart.slice(0, 10) && r.first_seen_at !== null && available(r.first_seen_at, cutoff))
    .sort((a, b) => ms(b.first_seen_at) - ms(a.first_seen_at))[0]
  const forecastText = forecast
    ? [
        forecast.morning_forecast,
        forecast.afternoon_forecast,
        forecast.night_forecast,
        forecast.summary_forecast,
        forecast.summary_when
      ]
        .filter((text) => text !== null)
        .join('\n')
        .toLowerCase()
    : ''
  return {
    header: { ...header, kind: 'call' },
    ...sections,
    windows,
    now: data.now.filter((r) => r.scope !== null && windowIds.has(r.scope) && available(r.snapshot_id, cutoff)),
    ...(forecast ? { forecast } : {}),
    glossary: data.glossary.filter((r) => r.ms_phrase && forecastText.includes(r.ms_phrase.toLowerCase()))
  }
}

export function serializeEvidencePack(
  kind: EvidenceKind,
  pack: EvidencePack
): { kind: EvidenceKind; packJson: string } {
  const packJson = JSON.stringify(pack)
  return packJson.length > 50_000 ? { kind: 'unparseable', packJson: '{"error":"pack too large"}' } : { kind, packJson }
}
