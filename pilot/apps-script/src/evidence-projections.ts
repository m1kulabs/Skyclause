import { toMytIso } from '../../shared/time.ts'
import type { Cell, Row } from './schema.ts'

export interface EvidenceStoredRows {
  readings: readonly Row<'readings'>[]
  warnings: readonly Row<'warnings'>[]
  forecast: readonly Row<'forecast'>[]
  glossary: readonly Row<'glossary'>[]
  ledger: readonly Row<'ledger'>[]
  grades: readonly Row<'grades'>[]
  windows: readonly Omit<Row<'windows'>, 'title'>[]
  now: readonly Row<'now'>[]
  probation: readonly Row<'probation'>[]
}

export type PublicScalar = string | number | boolean | null
export interface EvidenceReading {
  source_id: string
  source_kind: string
  metric: string
  unit: string
  observed_at: string
  received_at: string
  value: string | number
  revision: number
}
export interface EvidenceWarning {
  warning_key: string | null
  issued: string | null
  title_en: string | null
  title_bm: string | null
  valid_from: string | null
  valid_to: string | null
  heading_en: string | null
  text_en: string | null
  instruction_en: string | null
  heading_bm: string | null
  text_bm: string | null
  instruction_bm: string | null
  first_seen_at: string | null
  names_kl: boolean
}
export interface EvidenceForecast {
  date: string | null
  location_id: string | null
  morning_forecast: string | null
  afternoon_forecast: string | null
  night_forecast: string | null
  summary_forecast: string | null
  summary_when: string | null
  min_temp: number | null
  max_temp: number | null
  first_seen_at: string | null
  afternoon_thunderstorm: boolean | null
}
export interface EvidenceGlossary {
  ms_phrase: string | null
  en_gloss: string | null
}
export interface EvidenceWindow {
  window_id: string | null
  subscriber_id: string | null
  kind: string | null
  date: string | null
  start_myt: string | null
  end_myt: string | null
  language: string | null
  status: string | null
  declared_at: string | null
}
export interface EvidenceGrade {
  grade_id: string | null
  window_id: string | null
  call_id: string | null
  proposed_mode: string | null
  decision: string | null
  observed_mode: string | null
  outcome: string | null
  mode_diff: PublicScalar
  shadow_fired_no_call: boolean | null
  graded_at: string | null
  clause_version_hash: string | null
}
export interface EvidenceLedger {
  entry_id: string | null
  kind: string | null
  pack: string | null
  bundle_id: string | null
  call_id: string | null
  'window_id or night_id': string | null
  trigger: string | null
  source_ref: string | null
  mode: string | null
  fired: PublicScalar
  agrees: PublicScalar
  snapshot_id: string | null
  crossing_at: string | null
  drafted_at: string | null
  approved_at: string | null
  sent_at: string | null
  corrects: string | null
  recorded_at: string | null
  hash: string | null
  body?: { version_n: number; content_hash: string }
}
export interface EvidenceFrame {
  frame_file_id: string | null
  device_time: string | null
}
export interface EvidenceNow {
  snapshot_id: string | null
  scope: string | null
  span_from: string | null
  span_to: string | null
  'w.rain_max_60m_mm': number | null
  'w.rain_max_4h_mm': number | null
  'site.api_max': number | null
  'site.api_max_station': string | null
  'site.api_0600': number | null
  'w.met_kl_warning_in_force': boolean | null
  'w.met_warning_keys': string | null
  'site.camera_far_ratio_last3': string | null
  'site.gauge_rain_last3frames_mm': number | null
  age_min_gauge: number | null
  age_min_apims: number | null
  age_min_met: number | null
  age_min_camera: number | null
  state_gauge: string | null
  state_apims: string | null
  state_met: string | null
  state_camera: string | null
  'site.met_afternoon_thunderstorm': boolean | null
}
export interface EvidencePackData {
  readings: readonly EvidenceReading[]
  warnings: readonly EvidenceWarning[]
  forecast: readonly EvidenceForecast[]
  glossary: readonly EvidenceGlossary[]
  ledger: readonly EvidenceLedger[]
  grades: readonly EvidenceGrade[]
  windows: readonly EvidenceWindow[]
  now: readonly EvidenceNow[]
  frames: readonly EvidenceFrame[]
}

function text(value: Cell | undefined): string | null {
  return typeof value === 'string' ? value : null
}
function number(value: Cell | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function boolean(value: Cell | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null
}
function scalar(value: Cell | undefined): PublicScalar {
  return text(value) ?? number(value) ?? boolean(value)
}
function instant(value: Cell | undefined): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? toMytIso(value) : null
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? toMytIso(new Date(ms)) : null
}
function localTime(value: Cell | undefined): string | null {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : instant(value)
}
function day(value: Cell | undefined): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : (instant(value)?.slice(0, 10) ?? null)
}
function jsonArray(value: Cell | undefined): unknown[] | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
function warningKeys(value: Cell | undefined): string | null {
  const parsed = jsonArray(value)
  return parsed && parsed.every((key) => typeof key === 'string') ? JSON.stringify(parsed) : null
}
function cameraRatios(value: Cell | undefined): string | null {
  const parsed = jsonArray(value)
  if (!parsed) return null
  const ratios: { value: number; observed_at: string }[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    const observedAt = typeof row.observed_at === 'string' ? instant(row.observed_at) : null
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || !observedAt) return null
    ratios.push({ value: row.value, observed_at: observedAt })
  }
  return JSON.stringify(ratios)
}
function firedClauses(value: Cell | undefined): PublicScalar {
  if (typeof value !== 'string') return number(value) ?? boolean(value)
  const parsed = jsonArray(value)
  if (!parsed) return null
  const clauses: (string | { clause: string; inputs: string[] })[] = []
  for (const item of parsed) {
    if (typeof item === 'string') {
      clauses.push(item)
      continue
    }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null
    const row = item as Record<string, unknown>
    if (
      typeof row.clause !== 'string' ||
      !Array.isArray(row.inputs) ||
      !row.inputs.every((input): input is string => typeof input === 'string')
    )
      return null
    clauses.push({ clause: row.clause, inputs: row.inputs })
  }
  return JSON.stringify(clauses)
}
function clauseBody(row: Row<'ledger'>): EvidenceLedger['body'] {
  if (row.kind !== 'clause_version' || typeof row.body !== 'string') return undefined
  let body: unknown
  try {
    body = JSON.parse(row.body)
  } catch {
    return undefined
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const values = body as Record<string, unknown>
  if (
    typeof values.version_n !== 'number' ||
    !Number.isInteger(values.version_n) ||
    values.version_n < 1 ||
    typeof values.content_hash !== 'string' ||
    !/^[a-f0-9]+$/i.test(values.content_hash)
  )
    return undefined
  return { version_n: values.version_n, content_hash: values.content_hash }
}

// Rebuild at the storage boundary: no arbitrary row, body or extra key reaches assembly.
export function projectEvidenceRows(rows: EvidenceStoredRows): EvidencePackData {
  return {
    readings: rows.readings.flatMap((row): EvidenceReading[] => {
      const source_id = text(row.source_id),
        source_kind = text(row.source_kind),
        metric = text(row.metric),
        unit = text(row.unit)
      const observed_at = instant(row.observed_at),
        received_at = instant(row.received_at),
        revision = number(row.revision)
      const value = number(row.value) ?? text(row.value)
      return source_id &&
        source_kind &&
        metric &&
        unit !== null &&
        observed_at &&
        received_at &&
        revision !== null &&
        value !== null
        ? [{ source_id, source_kind, metric, unit, observed_at, received_at, value, revision }]
        : []
    }),
    warnings: rows.warnings.map((r) => ({
      warning_key: text(r.warning_key),
      issued: instant(r.issued),
      title_en: text(r.title_en),
      title_bm: text(r.title_bm),
      valid_from: instant(r.valid_from),
      valid_to: instant(r.valid_to),
      heading_en: text(r.heading_en),
      text_en: text(r.text_en),
      instruction_en: text(r.instruction_en),
      heading_bm: text(r.heading_bm),
      text_bm: text(r.text_bm),
      instruction_bm: text(r.instruction_bm),
      first_seen_at: instant(r.first_seen_at),
      names_kl: r.names_kl === true
    })),
    forecast: rows.forecast.map((r) => ({
      date: day(r.date),
      location_id: text(r.location_id),
      morning_forecast: text(r.morning_forecast),
      afternoon_forecast: text(r.afternoon_forecast),
      night_forecast: text(r.night_forecast),
      summary_forecast: text(r.summary_forecast),
      summary_when: text(r.summary_when),
      min_temp: number(r.min_temp),
      max_temp: number(r.max_temp),
      first_seen_at: instant(r.first_seen_at),
      afternoon_thunderstorm: boolean(r.afternoon_thunderstorm)
    })),
    glossary: rows.glossary.map((r) => ({ ms_phrase: text(r.ms_phrase), en_gloss: text(r.en_gloss) })),
    windows: rows.windows.map((r) => ({
      window_id: text(r.window_id),
      subscriber_id: text(r.subscriber_id),
      kind: text(r.kind),
      date: day(r.date),
      start_myt: localTime(r.start_myt),
      end_myt: localTime(r.end_myt),
      language: text(r.language),
      status: text(r.status),
      declared_at: instant(r.declared_at)
    })),
    ledger: rows.ledger.map((r) => {
      const body = clauseBody(r)
      return {
        entry_id: text(r.entry_id),
        kind: text(r.kind),
        pack: text(r.pack),
        bundle_id: text(r.bundle_id),
        call_id: text(r.call_id),
        'window_id or night_id': text(r['window_id or night_id']),
        trigger: text(r.trigger),
        source_ref: text(r.source_ref),
        mode: text(r.mode),
        fired: firedClauses(r.fired),
        agrees: scalar(r.agrees),
        snapshot_id: instant(r.snapshot_id),
        crossing_at: instant(r.crossing_at),
        drafted_at: instant(r.drafted_at),
        approved_at: instant(r.approved_at),
        sent_at: instant(r.sent_at),
        corrects: text(r.corrects),
        recorded_at: instant(r.recorded_at),
        hash: text(r.hash),
        ...(body ? { body } : {})
      }
    }),
    grades: rows.grades.map((r) => ({
      grade_id: text(r.grade_id),
      window_id: text(r.window_id),
      call_id: text(r.call_id),
      proposed_mode: text(r.proposed_mode),
      decision: text(r.decision),
      observed_mode: text(r.observed_mode),
      outcome: text(r.outcome),
      mode_diff: scalar(r.mode_diff),
      shadow_fired_no_call: boolean(r.shadow_fired_no_call),
      graded_at: instant(r.graded_at),
      clause_version_hash: text(r.clause_version_hash)
    })),
    frames: rows.probation.map((r) => ({ frame_file_id: text(r.frame_file_id), device_time: instant(r.device_time) })),
    now: rows.now.map((r) => ({
      snapshot_id: instant(r.snapshot_id),
      scope: text(r.scope),
      span_from: instant(r.span_from),
      span_to: instant(r.span_to),
      'w.rain_max_60m_mm': number(r['w.rain_max_60m_mm']),
      'w.rain_max_4h_mm': number(r['w.rain_max_4h_mm']),
      'site.api_max': number(r['site.api_max']),
      'site.api_max_station': text(r['site.api_max_station']),
      'site.api_0600': number(r['site.api_0600']),
      'w.met_kl_warning_in_force': boolean(r['w.met_kl_warning_in_force']),
      'w.met_warning_keys': warningKeys(r['w.met_warning_keys']),
      'site.camera_far_ratio_last3': cameraRatios(r['site.camera_far_ratio_last3']),
      'site.gauge_rain_last3frames_mm': number(r['site.gauge_rain_last3frames_mm']),
      age_min_gauge: number(r.age_min_gauge),
      age_min_apims: number(r.age_min_apims),
      age_min_met: number(r.age_min_met),
      age_min_camera: number(r.age_min_camera),
      state_gauge: text(r.state_gauge),
      state_apims: text(r.state_apims),
      state_met: text(r.state_met),
      state_camera: text(r.state_camera),
      'site.met_afternoon_thunderstorm': boolean(r['site.met_afternoon_thunderstorm'])
    }))
  }
}
