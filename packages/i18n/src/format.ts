import { t } from './index'

type Locale = 'en' | 'ms'
type DateValue = Date | number | string

const TIME_ZONE = 'Asia/Kuala_Lumpur'

function intlLocale(locale: Locale): string {
  return locale === 'ms' ? 'ms-MY' : 'en-MY'
}

function asDate(value: DateValue): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Locale-independent wall-clock parts for schedules that use a project time zone. */
export function zonedDateTimeParts(value: DateValue, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(asDate(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value

  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    weekday: part('weekday'),
    hour: Number(part('hour')),
    minute: Number(part('minute')),
    second: Number(part('second'))
  }
}

function dateParts(value: DateValue, locale: Locale, withWeekday = false) {
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withWeekday ? { weekday: 'long' as const } : {})
  }).formatToParts(asDate(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value

  return {
    day: part('day'),
    month: part('month'),
    year: part('year'),
    ...(withWeekday ? { weekday: part('weekday') } : {})
  }
}

export function formatTime(value: DateValue, locale: Locale): string {
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(asDate(value))

  return t('format.time', { time, zone: t('format.zone', {}, locale) }, locale)
}

export function formatDate(value: DateValue, locale: Locale): string {
  return t('format.date', dateParts(value, locale), locale)
}

export function formatDateLong(value: DateValue, locale: Locale): string {
  return t('format.dateLong', dateParts(value, locale, true), locale)
}

export function formatDateTime(value: DateValue, locale: Locale): string {
  return t('format.dateTime', { date: formatDate(value, locale), time: formatTime(value, locale) }, locale)
}

export function formatAge(value: DateValue, locale: Locale): string {
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))

  if (ageMinutes > 90) {
    return t('format.ageHour', { value: Math.round(ageMinutes / 60) }, locale)
  }

  return t('format.ageMinute', { value: ageMinutes }, locale)
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale)).format(value)
}

export function formatDateKeyAt(value: DateValue, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(asDate(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatList(values: string[], locale: Locale): string {
  return new Intl.ListFormat(intlLocale(locale), { style: 'long', type: 'conjunction' }).format(values)
}

export function formatTimeZoneName(timeZone: string, locale: Locale): string {
  if (timeZone === 'Asia/Kuala_Lumpur') return 'MYT'
  try {
    const parts = new Intl.DateTimeFormat(intlLocale(locale), {
      timeZone,
      timeZoneName: 'short'
    }).formatToParts(new Date())
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone
  } catch {
    return timeZone
  }
}
