import { formatInputDateTime } from '@skyclause/i18n/format'

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]
export interface WindowDraft {
  title: string
  kind: 'class' | 'event' | 'commute_wave'
  date: string
  start: string
  end: string
  repeat: boolean
  days: Weekday[]
  repeatEnd: 'until' | 'count'
  until: string
  count: string
  skips: string
}
export type FieldErrors = Partial<Record<keyof WindowDraft | 'url' | 'file' | 'scope', string>>
const DAY = 86_400_000

export function localDate(value: string | Date = new Date()): string {
  // A date input/URL value; visible dates use the shared formatter.
  return formatInputDateTime(value).slice(0, 10)
}

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10)
}

export function instant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+08:00`).toISOString()
}

export function skipDates(draft: WindowDraft): string[] {
  return draft.skips.split(/[\s,]+/).filter(Boolean)
}

export function validateWindow(draft: WindowDraft, now = new Date()): FieldErrors {
  const errors: FieldErrors = {}
  if (!draft.title.trim() || draft.title.length > 200) errors.title = 'title_required'
  if (!validDate(draft.date)) errors.date = 'required'
  for (const field of ['start', 'end'] as const) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft[field])) errors[field] = 'required'
  }
  if (!errors.date && !errors.start && !errors.end) {
    const start = Date.parse(instant(draft.date, draft.start))
    const end = Date.parse(instant(draft.date, draft.end))
    if (end < start || (end === start && draft.kind !== 'commute_wave')) errors.end = 'end_before_start'
    else if (end - start > DAY / 2) errors.end = 'too_long'
    if (start > now.getTime() + 90 * DAY) errors.date = 'too_far'
    if (start < now.getTime()) errors.start = 'past'
  }
  if (draft.repeat) {
    if (!draft.days.length) errors.days = 'days_required'
    if (draft.repeatEnd === 'until' && (!validDate(draft.until) || draft.until < draft.date))
      errors.until = 'until_invalid'
    if (
      draft.repeatEnd === 'count' &&
      (!/^\d+$/.test(draft.count) || Number(draft.count) < 1 || !Number.isSafeInteger(Number(draft.count)))
    )
      errors.count = 'count_invalid'
    if (skipDates(draft).some((date) => !validDate(date))) errors.skips = 'skips_invalid'
  }
  return errors
}

/** A form preview only. The windows service owns series materialisation and ICS parsing. */
export function previewOccurrences(draft: WindowDraft): string[] {
  if (!validDate(draft.date)) return []
  if (!draft.repeat) return [draft.date]
  if (!draft.days.length || (draft.repeatEnd === 'until' && !validDate(draft.until))) return []
  const skips = new Set(skipDates(draft))
  const occurrences: string[] = []
  let matched = 0
  for (let offset = 0; offset < 90; offset++) {
    const date = addDays(draft.date, offset)
    if (draft.repeatEnd === 'until' && date > draft.until) break
    const weekday = WEEKDAYS[(new Date(date).getUTCDay() + 6) % 7]!
    if (!draft.days.includes(weekday)) continue
    matched++
    if (draft.repeatEnd === 'count' && matched > Number(draft.count)) break
    if (!skips.has(date)) occurrences.push(date)
  }
  return occurrences
}

export function windowBody(draft: WindowDraft) {
  return {
    title: draft.title.trim(),
    kind: draft.kind,
    starts_at: instant(draft.date, draft.start),
    ends_at: instant(draft.date, draft.end),
    tz: 'Asia/Kuala_Lumpur',
    ...(draft.repeat
      ? {
          recurrence: {
            frequency: 'weekly' as const,
            days_of_week: draft.days,
            ...(draft.repeatEnd === 'until' ? { until: draft.until } : { count: Number(draft.count) }),
            skip_dates: skipDates(draft)
          }
        }
      : {})
  }
}

export function calendarDays(from: string): string[] {
  const first = `${from.slice(0, 7)}-01`
  const start = addDays(first, -((new Date(first).getUTCDay() + 6) % 7))
  const next = new Date(first)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const length = Math.ceil((Date.parse(next.toISOString().slice(0, 10)) - Date.parse(start)) / DAY / 7) * 7
  return Array.from({ length }, (_, index) => addDays(start, index))
}
