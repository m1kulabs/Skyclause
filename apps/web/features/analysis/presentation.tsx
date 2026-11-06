import type { AnalysisMetric } from '@skyclause/contracts'
import { formatDate, formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Card, CardContent } from '#ui/card'
import { Button } from '#ui/button'
import { ApiProblem } from '../../lib/api-fetch'
import { t } from './catalogue'
import { metricValue, rateMetrics, type Locale } from './model'
import type { Metric } from './operations'
import en from '../../../../packages/i18n/catalogue/en/analysis.json'

export function metricName(name: string, locale: Locale) {
  return name in en.metrics ? t(`analysis.metrics.${name}`, {}, locale) : t('analysis.metricUnknown', { name }, locale)
}

export function outcomeName(outcome: string, noCall: boolean, locale: Locale) {
  const key = noCall ? 'no_call' : outcome
  return key in en.outcomes
    ? t(`analysis.outcomes.${key}`, {}, locale)
    : t('analysis.outcomeUnknown', { reason: key.replaceAll('_', ' ') }, locale)
}

export function rangeText(from: string, to: string, locale: Locale) {
  return t('analysis.period', { from: formatDate(from, locale), to: formatDate(to, locale) }, locale)
}

export function featureOff(error: unknown) {
  return (
    error instanceof ApiProblem &&
    error.status === 403 &&
    (error.body.type?.split('/').at(-1) === 'feature-off' || error.body.code === 'feature-off')
  )
}

export function Failure({ operation, error, locale }: { operation: string; error: unknown; locale: Locale }) {
  return (
    <div role="alert" className="analysis-error">
      <p>{t(featureOff(error) ? 'analysis.featureOff' : 'analysis.failed', { operation }, locale)}</p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        {t('analysis.retry', {}, locale)}
      </Button>
    </div>
  )
}

export function EmptyBlock({ message = 'noRows', locale }: { message?: string; locale: Locale }) {
  return <p className="analysis-empty">{t(`analysis.${message}`, {}, locale)}</p>
}

export function Time({ at, locale }: { at: string; locale: Locale }) {
  return <time dateTime={at}>{formatDateTime(at, locale)}</time>
}

export function metricText(metric: AnalysisMetric, locale: Locale) {
  const value = metricValue(metric)
  if (value === null) return t(metric.n === 0 ? 'analysis.n' : 'analysis.missing', { n: 0 }, locale)
  if (rateMetrics.has(metric.metric) || /percentage_error|forecast_error/.test(metric.metric)) {
    return t('analysis.percent', { value: formatNumber(Math.round(value * 1000) / 10, locale) }, locale)
  }
  return /p50|p95|delay|minutes/.test(metric.metric)
    ? t('analysis.minutes', { value: formatNumber(value, locale) }, locale)
    : formatNumber(value, locale)
}

export function WilsonInterval({ metric, locale }: { metric: AnalysisMetric; locale: Locale }) {
  const value = metricValue(metric)
  if (!rateMetrics.has(metric.metric) || metric.n === 0) return null
  if (value === null || metric.low === null || metric.high === null) {
    return <p>{t('analysis.unavailableInterval', {}, locale)}</p>
  }
  return (
    <>
      <svg
        viewBox="0 0 200 24"
        role="img"
        aria-label={t(
          'analysis.wilson',
          { low: formatNumber(metric.low!, locale), high: formatNumber(metric.high!, locale) },
          locale
        )}
        className="analysis-wilson"
      >
        <line x1="0" y1="12" x2="200" y2="12" stroke="var(--border)" />
        <line x1={metric.low! * 200} y1="12" x2={metric.high! * 200} y2="12" stroke="var(--chart-2)" strokeWidth="6" />
        <line
          data-point-tick
          x1={value! * 200}
          y1="4"
          x2={value! * 200}
          y2="20"
          stroke="var(--foreground)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p>
        {t(
          'analysis.wilson',
          { low: formatNumber(metric.low!, locale), high: formatNumber(metric.high!, locale) },
          locale
        )}
      </p>
    </>
  )
}

/** Local metric figure; the shared GradeCard retains its Grade-only contract and remains owned by #172. */
export function MetricFigure({
  metric,
  from,
  to,
  source,
  locale
}: {
  metric: Metric
  from: string
  to: string
  source: string
  locale: Locale
}) {
  const rate = rateMetrics.has(metric.metric)
  return (
    <Card className="analysis-metric" data-metric={metric.metric}>
      <CardContent>
        <h3>{metricName(metric.metric, locale)}</h3>
        <p className="analysis-value">{metricText(metric, locale)}</p>
        {metric.n > 0 && <p>{t('analysis.n', { n: formatNumber(metric.n, locale) }, locale)}</p>}
        {metric.n > 0 && metric.x !== null && rate && (
          <p>{t('analysis.count', { x: formatNumber(metric.x, locale), n: formatNumber(metric.n, locale) }, locale)}</p>
        )}
        <WilsonInterval metric={metric} locale={locale} />
        {metric.n === 0 && <p>{t('analysis.next', {}, locale)}</p>}
        <p className="analysis-muted">{rangeText(from, to, locale)}</p>
        <p className="analysis-muted">{t('analysis.source', { source }, locale)}</p>
      </CardContent>
    </Card>
  )
}
