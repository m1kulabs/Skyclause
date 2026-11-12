import { formatDateCompact, formatDateKey, formatNumber, formatTime } from '@skyclause/i18n/format'
import { t, type Locale } from './i18n'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** When something happened, in words against `now`: "Just now", "9 min ago", "3 h ago", "Yesterday", then the date. */
export function timeInWords(at: string, now: number, locale: Locale = 'en'): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(at)) / MINUTE))
  if (minutes < 1) return t('bundles.words.now', {}, locale)
  if (minutes < 60) return t('bundles.words.minutes', { count: formatNumber(minutes, locale) }, locale)
  if (formatDateKey(at) === formatDateKey(now))
    return t('bundles.words.hours', { count: formatNumber(Math.floor(minutes / 60), locale) }, locale)
  if (formatDateKey(at) === formatDateKey(now - DAY)) return t('bundles.words.yesterday', {}, locale)
  return formatDateCompact(at, locale)
}

/** A span of minutes as "8 min" or "1 h 05 min", always positive. */
export function minutesText(ms: number, locale: Locale = 'en'): string {
  const total = Math.max(0, Math.ceil(Math.abs(ms) / MINUTE))
  if (total < 60) return t('bundles.span.minutes', { minutes: formatNumber(total, locale) }, locale)
  return t(
    'bundles.span.hours',
    {
      hours: formatNumber(Math.floor(total / 60), locale),
      minutes: formatNumber(total % 60, locale, { minimumIntegerDigits: 2 })
    },
    locale
  )
}

/**
 * The SLA countdown as a text-size capsule: minutes left, or minutes past due. The edge turns to ink in the last two
 * minutes and after, with the word, never a hue.
 */
export function SlaCapsule({ due, now, locale = 'en' }: { due: string; now: number; locale?: Locale }) {
  const left = Date.parse(due) - now
  const urgent = left <= 2 * MINUTE
  const text =
    left > 0
      ? t('bundles.sla_left', { span: minutesText(left, locale) }, locale)
      : left > -MINUTE
        ? t('bundles.sla_now', {}, locale)
        : t('bundles.sla_over', { span: minutesText(left, locale) }, locale)
  return (
    <time
      dateTime={due}
      className="bundle-sla"
      data-urgent={urgent || undefined}
      data-numeric
      aria-label={`${text} · ${t('bundles.sla', { time: formatTime(due, locale) }, locale)}`}
    >
      {text}
    </time>
  )
}
