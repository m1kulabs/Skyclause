import type { AnalysisMetric } from '@skyclause/contracts'
import { formatNumber } from '@skyclause/i18n/format'
import en from '../../../../packages/i18n/catalogue/en/analysis.json'
import { t } from './catalogue'

type Locale = 'en' | 'ms'

/*
 * One reading and one name per analysis metric, for every screen that shows one (the grade card, the analysis screen).
 * `x` is a count for a share (`x` of `n`) and the figure itself for a scalar; `value` is the API's own figure for a
 * scalar. Names are the catalogue's `analysis.metrics.*`, never the API's key.
 */

/** The metrics that are shares of `n`: their `x` is a count, their figure is `x / n`, and they carry a Wilson interval. */
export const rateMetrics: ReadonlySet<string> = new Set([
  'precision',
  'recall',
  'false_alarm_ratio',
  'band_coverage',
  'agreement',
  'agent_shadow_agreement'
])

export const isRateMetric = (metric: Pick<AnalysisMetric, 'metric'>): boolean => rateMetrics.has(metric.metric)

/** The metric's figure on its own scale (a share as 0 to 1), or null when there is none (n=0, or no value). */
export function metricValue(metric: AnalysisMetric): number | null {
  if (metric.n === 0) return null
  if (metric.value !== undefined) return metric.value
  if (metric.x === null) return null
  return rateMetrics.has(metric.metric) ? metric.x / metric.n : metric.x
}

export function metricName(name: string, locale: Locale): string {
  return name in en.metrics ? t(`analysis.metrics.${name}`, {}, locale) : t('analysis.metricUnknown', { name }, locale)
}

/** A share as a percentage with one decimal at most ("87.5%"). */
export const percentText = (value: number, locale: Locale): string =>
  t('analysis.percent', { value: formatNumber(Math.round(value * 1000) / 10, locale) }, locale)

/** The figure in words: a share as a percentage, a duration in minutes, anything else as a number. */
export function metricText(metric: AnalysisMetric, locale: Locale): string {
  const value = metricValue(metric)
  if (value === null) return t(metric.n === 0 ? 'analysis.n' : 'analysis.missing', { n: 0 }, locale)
  if (rateMetrics.has(metric.metric) || /percentage_error|forecast_error/.test(metric.metric)) {
    return percentText(value, locale)
  }
  return /p50|p95|delay|minutes/.test(metric.metric)
    ? t('analysis.minutes', { value: formatNumber(value, locale) }, locale)
    : formatNumber(value, locale)
}

/** The Wilson 95% interval of a share in words, or null when the metric has none. */
export function metricInterval(metric: AnalysisMetric, locale: Locale): string | null {
  if (!rateMetrics.has(metric.metric) || metric.low === null || metric.high === null) return null
  return t('analysis.wilson', { low: percentText(metric.low, locale), high: percentText(metric.high, locale) }, locale)
}
