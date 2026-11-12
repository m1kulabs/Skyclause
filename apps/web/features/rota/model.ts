import { formatClock, formatDateCompact, formatDateKey } from '@skyclause/i18n/format'

export type Locale = 'en' | 'ms'

export interface RotaDay {
  date: string
  isoWeekday: number
}

function mytDate(now: Date): string {
  return formatDateKey(now)
}

function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

export function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function nextSevenDays(now = new Date()): RotaDay[] {
  const today = mytDate(now)
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(today, offset)
    return { date, isoWeekday: isoWeekday(date) }
  })
}

export function formatRotaDate(date: string, locale: Locale): string {
  return formatDateCompact(`${date}T12:00:00+08:00`, locale)
}

export function formatMytClock(value: string, locale: Locale): string {
  if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value
  return formatClock(value, locale)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
    ? `${parts[0]![0]}${parts.at(-1)![0]}`.toUpperCase()
    : (parts[0]?.slice(0, 2) ?? 'A').toUpperCase()
}

/** Minutes after midnight, MYT, of a shift's local "HH:MM" or of an instant. */
export function minutesOfDay(value: string): number {
  const clock = formatMytClock(value, 'en')
  const [hours, minutes] = clock.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}
