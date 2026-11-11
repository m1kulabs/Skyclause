import { t } from '@skyclause/i18n'
import { formatNumber, formatTime } from '@skyclause/i18n/format'
import type { BlockedInput, ClauseResult, InputValue, Mode, Pack, Verdicts } from '@skyclause/contracts/api/shared'
import type { StripInput } from '@skyclause/elements'
import './catalogue'

export interface HeroWindow {
  date: string
  startMin: number
  endMin: number
}

export const STEP_MIN = 15
export const DAY_MIN = 1440
export const CLOCK_SOURCE = 'clock:Asia/Kuala_Lumpur'
const MYT_OFFSET_MS = 8 * 3600_000

export function localDateOf(now: Date): string {
  return new Date(now.getTime() + MYT_OFFSET_MS).toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10)
}

export function addDaysLocalDate(date: string, days: number): string {
  return addDays(date, days)
}

export function datesTodayPlusSeven(now: Date): string[] {
  const today = localDateOf(now)
  return Array.from({ length: 8 }, (_, i) => addDays(today, i))
}

/** The server's no-JS window: the next hour boundary in MYT, rolling the date past midnight. */
export function nextHourWindow(now: Date): HeroWindow {
  const myt = new Date(now.getTime() + MYT_OFFSET_MS)
  const floorMyt = Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), myt.getUTCHours())
  const startUtc = new Date(floorMyt + 3600_000 - MYT_OFFSET_MS)
  const endUtc = new Date(startUtc.getTime() + 3600_000)
  const toMin = (d: Date) => {
    const mytOf = new Date(d.getTime() + MYT_OFFSET_MS)
    return mytOf.getUTCHours() * 60 + mytOf.getUTCMinutes()
  }
  return { date: localDateOf(startUtc), startMin: toMin(startUtc), endMin: toMin(endUtc) }
}

export function parseLocalTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes % STEP_MIN === 0 ? minutes : null
}

export function toLocalTime(minutes: number): string {
  const clamped = Math.min(1425, Math.max(0, minutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function snapToStep(minutes: number): number {
  return Math.round(minutes / STEP_MIN) * STEP_MIN
}

/** Range limits: one date, 00:00 to 23:45, at least one 15-minute step. */
export function clampWindow(startMin: number, endMin: number): { start: number; end: number } {
  let start = Math.min(1410, Math.max(0, snapToStep(startMin)))
  let end = Math.min(1425, Math.max(15, snapToStep(endMin)))
  if (end <= start) end = Math.min(1425, start + STEP_MIN)
  if (end <= start) start = end - STEP_MIN
  return { start, end }
}

export function parseWindowFromSearch(query: string, now: Date): HeroWindow | null {
  const params = new URLSearchParams(query)
  const date = params.get('date')
  const start = params.get('start')
  const end = params.get('end')
  if (!date || !start || !end) return null
  if (!datesTodayPlusSeven(now).includes(date)) return null
  const startMin = parseLocalTime(start)
  const endMin = parseLocalTime(end)
  if (startMin === null || endMin === null) return null
  const clamped = clampWindow(startMin, endMin)
  return { date, startMin: clamped.start, endMin: clamped.end }
}

export function windowInstants(win: HeroWindow): { from: string; to: string } {
  const [y, m, d] = win.date.split('-').map(Number)
  const midnightUtc = Date.UTC(y!, m! - 1, d!) - MYT_OFFSET_MS
  return {
    from: new Date(midnightUtc + win.startMin * 60_000).toISOString(),
    to: new Date(midnightUtc + win.endMin * 60_000).toISOString()
  }
}

export function dayBounds(win: { date: string }): { from: string; to: string } {
  const [y, m, d] = win.date.split('-').map(Number)
  const fromMs = Date.UTC(y!, m! - 1, d!) - MYT_OFFSET_MS
  return { from: new Date(fromMs).toISOString(), to: new Date(fromMs + 24 * 3600_000).toISOString() }
}

// Display model over the response's Verdicts (public.ts). One entry per pack.
export interface GroupedClause {
  key: string
  result: ClauseResult['result']
  blocked_by: ClauseResult['blocked_by']
  inputs: InputValue[]
  openFrom: string | null
}

export interface GroupedVerdict {
  pack: Pack
  mode: Mode | null
  fired: GroupedClause[]
  blocked: GroupedClause[]
  notOpen: GroupedClause[]
  inputs: InputValue[]
  freshCount: number
  errorCount: number
}

export function groupedVerdicts(verdicts: readonly Verdicts[]): GroupedVerdict[] {
  return verdicts.map((v) => {
    const all = [...v.site, ...v.windows, ...v.nights]
    const fired = all.flatMap((verdict) =>
      verdict.clauses
        .filter((clause) => clause.result === 'fired')
        .map((clause) => ({
          key: clause.key,
          result: clause.result,
          blocked_by: clause.blocked_by,
          inputs: clause.inputs,
          openFrom: verdict.open_from
        }))
    )
    const blocked = all.flatMap((verdict) =>
      verdict.clauses
        .filter((clause) => clause.result === 'blocked')
        .map((clause) => ({
          key: clause.key,
          result: clause.result,
          blocked_by: clause.blocked_by,
          inputs: clause.inputs,
          openFrom: verdict.open_from
        }))
    )
    const notOpen = all.flatMap((verdict) =>
      verdict.clauses
        .filter((clause) => clause.result === 'not_open')
        .map((clause) => ({
          key: clause.key,
          result: clause.result,
          blocked_by: clause.blocked_by,
          inputs: clause.inputs,
          openFrom: verdict.open_from ?? clause.span?.from ?? null
        }))
    )
    const seen = new Set<string>()
    const inputs: InputValue[] = []
    for (const clause of all.flatMap((verdict) => verdict.clauses)) {
      for (const input of clause.inputs) {
        const key = `${input.name}|${input.source_ids[0] ?? ''}`
        if (!seen.has(key)) {
          seen.add(key)
          inputs.push(input)
        }
      }
    }
    return {
      pack: v.pack,
      mode: v.windows[0]?.mode ?? v.site[0]?.mode ?? v.nights[0]?.mode ?? null,
      fired,
      blocked,
      notOpen,
      inputs,
      freshCount: inputs.filter((input) => input.state === 'fresh').length,
      errorCount: inputs.filter((input) => input.state === 'error').length
    }
  })
}

export function blockedLineOf(input: { clause: string; blocked: BlockedInput }): string {
  return t(
    'landing-hero.no_call_for',
    {
      clause: input.clause,
      input: input.blocked.name,
      station: input.blocked.source_id ?? '',
      time: formatTime(input.blocked.since, 'en')
    },
    'en'
  )
}

export function errorLineOf(input: Pick<InputValue, 'name' | 'since' | 'observed_at'>): string {
  const at = input.since ?? input.observed_at
  return t('landing-hero.couldnt_reach', { input: input.name, time: at ? formatTime(at, 'en') : '' }, 'en')
}

export function notOpenLineOf(clause: string, openFrom: string): string {
  return t('landing-hero.evaluates_from', { clause, time: formatTime(openFrom, 'en') }, 'en')
}

export function ageMinutesOf(input: Pick<InputValue, 'age_s' | 'observed_at'>, evaluatedAt: string): string {
  const minutes =
    input.age_s !== null && input.age_s !== undefined
      ? Math.round(input.age_s / 60)
      : input.observed_at
        ? Math.max(0, Math.round((Date.parse(evaluatedAt) - Date.parse(input.observed_at)) / 60_000))
        : 0
  return minutes > 90
    ? t('format.ageHour', { value: Math.round(minutes / 60) }, 'en')
    : t('format.ageMinute', { value: minutes }, 'en')
}

export function valueOf(input: Pick<InputValue, 'value' | 'unit'>): string | null {
  if (input.value === null || input.value === undefined) return null
  const text = typeof input.value === 'number' ? formatNumber(input.value, 'en') : String(input.value)
  return t('landing-hero.input_value', { value: text, unit: input.unit }, 'en')
}

export function hasGaugeError(inputs: readonly InputValue[]): boolean {
  return inputs.some((input) => input.name.includes('rain') && (input.state === 'error' || input.state === 'stale'))
}

/** The POST /e body of spec §2: counts and enums only, after its response. */
export function beaconEventOf(grouped: readonly GroupedVerdict[]) {
  const modes = grouped.flatMap((group) => (group.mode ? [group.mode] : []))
  return {
    name: 'landing_window_set' as const,
    props: {
      modes,
      inputs_fresh: grouped.reduce((sum, group) => sum + group.freshCount, 0),
      inputs_error: grouped.reduce((sum, group) => sum + group.errorCount, 0)
    }
  }
}

const RAIN_60 = 'site.rain_60m_mm'

/** The response's derived-only strip (D32): the 60-minute lane across the picked day, never 5-minute readings. */
export function stripOf(
  values: readonly InputValue[],
  win: HeroWindow,
  evaluatedAt: string,
  _now?: string
): StripInput | null {
  const bounds = dayBounds(win)
  const rain60 = values
    .flatMap((value) =>
      value.name === RAIN_60 && typeof value.value === 'number' && value.observed_at
        ? [{ at: value.observed_at, value: value.value }]
        : []
    )
    .filter((point) => point.at >= bounds.from && point.at <= bounds.to)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (rain60.length < 2) return null
  const instants = windowInstants(win)
  return {
    from: bounds.from,
    to: bounds.to,
    now: evaluatedAt,
    window: { from: instants.from, to: instants.to },
    rain5: [],
    rain60
  }
}
