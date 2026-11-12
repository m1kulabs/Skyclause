import { formatDateCompact, formatDateKey, formatTime } from '@skyclause/i18n/format'
import { t } from './i18n'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** When something happened, in words against `now`: "Just now", "9 min ago", "3 h ago", "Yesterday", then the date. */
export function timeInWords(at: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(at)) / MINUTE))
  if (minutes < 1) return t('bundles.words.now')
  if (minutes < 60) return t('bundles.words.minutes', { count: minutes })
  if (formatDateKey(at) === formatDateKey(now)) return t('bundles.words.hours', { count: Math.floor(minutes / 60) })
  if (formatDateKey(at) === formatDateKey(now - DAY)) return t('bundles.words.yesterday')
  return formatDateCompact(at, 'en')
}

/** A span of minutes as "8 min" or "1 h 05 min", always positive. */
export function minutesText(ms: number): string {
  const total = Math.max(0, Math.ceil(Math.abs(ms) / MINUTE))
  if (total < 60) return t('bundles.span.minutes', { minutes: total })
  return t('bundles.span.hours', { hours: Math.floor(total / 60), minutes: String(total % 60).padStart(2, '0') })
}

/**
 * The SLA countdown as a text-size capsule: minutes left, or minutes past due. The edge turns to ink in the last two
 * minutes and after, with the word, never a hue.
 */
export function SlaCapsule({ due, now }: { due: string; now: number }) {
  const left = Date.parse(due) - now
  const urgent = left <= 2 * MINUTE
  const text =
    left > 0
      ? t('bundles.sla_left', { span: minutesText(left) })
      : left > -MINUTE
        ? t('bundles.sla_now')
        : t('bundles.sla_over', { span: minutesText(left) })
  return (
    <time
      dateTime={due}
      className="bundle-sla"
      data-urgent={urgent || undefined}
      data-numeric
      aria-label={`${text} · ${t('bundles.sla', { time: formatTime(due, 'en') })}`}
    >
      {text}
    </time>
  )
}
