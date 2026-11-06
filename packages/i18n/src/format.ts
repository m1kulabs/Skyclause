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
