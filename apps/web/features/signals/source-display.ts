import { formatNumber, formatTime } from '@skyclause/i18n/format'
import { errorsWithinLastDay, wilsonInterval } from './model'
import type { EvaluatedSource, ProjectSource, ProjectStrip } from './operations'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

/** What the source's state adds to its status mark: when a pending input starts, how long a Pi has been offline... */
export function stateDetail(source: EvaluatedSource, locale: Locale): string | null {
  if (source.state.state === 'pending' && source.state.pending_until) {
    return t('signals.pending_until', { time: formatTime(source.state.pending_until, locale) }, locale)
  }
  if (source.kind === 'pi' && (source.state.state === 'stale' || source.state.state === 'error')) {
    return t('signals.pi_offline', { time: formatTime(source.state.since, locale) }, locale)
  }
  if (source.kind === 'camera' && source.state.state === 'probation' && source.probation?.probation) {
    const { n, agreement } = source.probation
    if (agreement === null) return t('signals.probation_unknown', { n }, locale)
    const interval = wilsonInterval(Math.round(n * agreement), n)
    if (!interval) return t('signals.probation_unknown', { n }, locale)
    const percent = (value: number) => formatNumber(value, locale, { maximumFractionDigits: 1 })
    return t(
      'signals.probation',
      { n, agreement: percent(agreement * 100), low: percent(interval.low * 100), high: percent(interval.high * 100) },
      locale
    )
  }
  return null
}

/** The newest value split into its figure and the rest (unit, class), so the figure can be set apart. */
export function latestParts(
  source: EvaluatedSource,
  strip: ProjectStrip,
  locale: Locale
): { figure: string | null; rest: string } | null {
  const text = latestLabel(source, strip, locale)
  if (text === undefined) return null
  const match = /^(-?[\d.,]+)(?:\s(.*))?$/su.exec(text)
  return match ? { figure: match[1]!, rest: match[2] ?? '' } : { figure: null, rest: text }
}

function latestLabel(source: EvaluatedSource, strip: ProjectStrip, locale: Locale): string | undefined {
  const reading = source.latest_reading
  if (source.kind === 'jps_rain') {
    const input = strip.inputs.find(
      (value) => value.source_ids.includes(source.id) && value.name.includes('rain_60m_mm')
    )
    const series = strip.series['site.rain_60m_mm']
    const seriesValue = series?.at(-1)?.[1]
    const value = typeof input?.value === 'number' ? input.value : seriesValue
    if (value !== null && value !== undefined)
      return t('signals.rain_latest', { value: formatNumber(value, locale) }, locale)
  }
  if (!reading) return undefined
  if (source.kind === 'met_warning') return reading.value_text ?? undefined
  const value = reading.value === null ? null : formatNumber(reading.value, locale)
  if (value === null) return reading.value_text ?? undefined
  const unit = reading.unit ?? ''
  const classification =
    typeof reading.value_json === 'object' &&
    reading.value_json !== null &&
    !Array.isArray(reading.value_json) &&
    typeof reading.value_json.class === 'string'
      ? reading.value_json.class
      : null
  return classification
    ? t('signals.latest_value_class', { value, unit, class: classification }, locale)
    : t('signals.latest_value', { value, unit }, locale)
}

export function lastSourceError(
  source: ProjectSource,
  now: number
): ProjectSource['recent_errors'][number] | undefined {
  return errorsWithinLastDay(source.recent_errors, now).at(0)
}
