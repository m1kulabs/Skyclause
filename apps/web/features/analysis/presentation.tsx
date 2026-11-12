import type { AnalysisMetric } from '@skyclause/contracts'
import { formatDate, formatDateTime, formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { Skeleton } from '#ui/skeleton'
import { ApiProblem } from '../../lib/api-fetch'
import { SourceError } from '../data-components/states'
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

/**
 * A read that failed or is not built, named in the block that needed it. A pack switched off for the organisation is
 * not a failure: it says so and what to do instead.
 */
export function Failure({
  source,
  error,
  at,
  retry,
  locale
}: {
  source: string
  error: unknown
  at?: string | null
  retry?: () => void
  locale: Locale
}) {
  if (featureOff(error))
    return (
      <p role="alert" className="analysis-error analysis-notice">
        {t('analysis.featureOff', {}, locale)}
      </p>
    )
  return (
    <div className="analysis-error">
      <SourceError
        source={source}
        status={error instanceof ApiProblem ? error.status : null}
        at={at ?? null}
        retry={
          retry ? (
            <Button variant="outline" onClick={retry}>
              {t('analysis.retry', {}, locale)}
            </Button>
          ) : null
        }
        locale={locale}
      />
    </div>
  )
}

export function EmptyBlock({ message = 'noRows', locale }: { message?: string; locale: Locale }) {
  return <p className="analysis-empty">{t(`analysis.${message}`, {}, locale)}</p>
}

export function Time({ at, locale }: { at: string; locale: Locale }) {
  return <time dateTime={at}>{formatDateTime(at, locale)}</time>
}

const percent = (value: number, locale: Locale) =>
  t('analysis.percent', { value: formatNumber(Math.round(value * 1000) / 10, locale) }, locale)

export function metricText(metric: AnalysisMetric, locale: Locale) {
  const value = metricValue(metric)
  if (value === null) return t(metric.n === 0 ? 'analysis.n' : 'analysis.missing', { n: 0 }, locale)
  if (rateMetrics.has(metric.metric) || /percentage_error|forecast_error/.test(metric.metric)) {
    return percent(value, locale)
  }
  return /p50|p95|delay|minutes/.test(metric.metric)
    ? t('analysis.minutes', { value: formatNumber(value, locale) }, locale)
    : formatNumber(value, locale)
}

/** The interval in words, on the value's own scale (a share as a percentage). */
export function intervalText(metric: AnalysisMetric, locale: Locale) {
  return t('analysis.wilson', { low: percent(metric.low!, locale), high: percent(metric.high!, locale) }, locale)
}

/**
 * A share on its 0–100% track: the track a capsule, the Wilson interval a capsule inside it, the value a 2px tick.
 * Lengths are percentages of the drawn width, so the capsule ends stay round at any width.
 */
export function IntervalBar({ metric, value, label }: { metric: AnalysisMetric; value: number; label: string }) {
  const at = (share: number) => `${Math.min(100, Math.max(0, share * 100))}%`
  return (
    <svg className="analysis-interval" width="100%" height="16" role="img" aria-label={label}>
      <rect x="0" y="4" width="100%" height="8" rx="4" className="analysis-interval-track" />
      <rect
        x={at(metric.low!)}
        y="4"
        width={at(Math.max(0, metric.high! - metric.low!))}
        height="8"
        rx="4"
        className="analysis-interval-span"
      />
      <line data-point-tick x1={at(value)} x2={at(value)} y1="0" y2="16" strokeWidth="2" />
    </svg>
  )
}

/** The Wilson 95% interval of a share, in words and as a bar; nothing for n=0 or a figure that is not a share. */
export function WilsonInterval({ metric, locale }: { metric: AnalysisMetric; locale: Locale }) {
  const value = metricValue(metric)
  if (!rateMetrics.has(metric.metric) || metric.n === 0) return null
  if (value === null || metric.low === null || metric.high === null) {
    return <p className="analysis-sub">{t('analysis.unavailableInterval', {}, locale)}</p>
  }
  const words = intervalText(metric, locale)
  return (
    <span className="analysis-wilson">
      <IntervalBar metric={metric} value={value} label={words} />
      <span className="analysis-sub" aria-hidden="true">
        {words}
      </span>
    </span>
  )
}

/**
 * The answer: one figure set large with its count, its n and its Wilson 95% interval in words and as a bar, over the
 * period it covers. With n=0 it says so and draws nothing.
 */
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
  const value = metricValue(metric)
  return (
    <div className="analysis-answer" data-metric={metric.metric}>
      <p className="analysis-answer-name">{metricName(metric.metric, locale)}</p>
      {metric.n === 0 ? (
        <>
          <p className="analysis-answer-figure analysis-answer-empty">{t('analysis.emptyFinding', {}, locale)}</p>
          <p className="analysis-answer-words">{t('analysis.next', {}, locale)}</p>
        </>
      ) : (
        <>
          <p className="analysis-answer-figure" data-numeric>
            {metricText(metric, locale)}
          </p>
          <p className="analysis-answer-words">
            {metric.x !== null && rate && (
              <span>
                {t('analysis.count', { x: formatNumber(metric.x, locale), n: formatNumber(metric.n, locale) }, locale)}
              </span>
            )}
            <span data-numeric>{t('analysis.n', { n: formatNumber(metric.n, locale) }, locale)}</span>
          </p>
          {rate &&
            (value !== null && metric.low !== null && metric.high !== null ? (
              <div className="analysis-answer-interval">
                <p className="analysis-answer-words">{intervalText(metric, locale)}</p>
                <IntervalBar metric={metric} value={value} label={intervalText(metric, locale)} />
                <p className="analysis-scale" aria-hidden="true">
                  <span>{percent(0, locale)}</span>
                  <span>{percent(1, locale)}</span>
                </p>
              </div>
            ) : (
              <p className="analysis-sub">{t('analysis.unavailableInterval', {}, locale)}</p>
            ))}
        </>
      )}
      <p className="analysis-sub">
        {rangeText(from, to, locale)}
        <span className="analysis-dot" aria-hidden="true" />
        {source}
      </p>
    </div>
  )
}

/**
 * A figure as a row that measures: its name, a bar (the Wilson interval for a share, the share of the largest for a
 * duration), the value, its n and the interval in words. n=0 prints n=0 and draws no bar.
 */
export function MetricRow({
  metric,
  name,
  max,
  extra,
  locale
}: {
  metric: Metric
  name?: string
  /** The largest value among the rows, for a duration's bar. */
  max?: number
  extra?: string
  locale: Locale
}) {
  const value = metricValue(metric)
  const rate = rateMetrics.has(metric.metric)
  return (
    <li className="analysis-row" data-metric={metric.metric}>
      <span className="analysis-row-name">
        <span translate={name ? 'no' : undefined}>{name ?? metricName(metric.metric, locale)}</span>
        {extra && <span className="analysis-sub">{extra}</span>}
      </span>
      <span className="analysis-row-bar">
        {metric.n > 0 && value !== null ? (
          rate ? (
            metric.low !== null && metric.high !== null ? (
              <IntervalBar metric={metric} value={value} label={intervalText(metric, locale)} />
            ) : null
          ) : max ? (
            <svg className="analysis-interval" width="100%" height="16" aria-hidden="true">
              <rect x="0" y="4" width="100%" height="8" rx="4" className="analysis-interval-track" />
              <rect
                x="0"
                y="4"
                width={`${Math.min(100, (value / max) * 100)}%`}
                height="8"
                rx="4"
                className="analysis-interval-fill"
              />
            </svg>
          ) : null
        ) : null}
      </span>
      <span className="analysis-row-value" data-numeric>
        {metric.n === 0 ? t('analysis.n', { n: 0 }, locale) : metricText(metric, locale)}
      </span>
      <span className="analysis-row-n analysis-sub" data-numeric>
        {metric.n > 0 && t('analysis.n', { n: formatNumber(metric.n, locale) }, locale)}
      </span>
      <span className="analysis-row-interval analysis-sub">
        {metric.n > 0 && rate && value !== null && metric.low !== null && metric.high !== null
          ? intervalText(metric, locale)
          : metric.n > 0 && rate
            ? t('analysis.unavailableInterval', {}, locale)
            : null}
      </span>
    </li>
  )
}

/** Skeleton capsules at the size of the answer, its rows and its chart. */
export function Loading({ locale }: { locale: Locale }) {
  return (
    <div role="status" className="analysis-loading" data-analysis-loading>
      <span className="sr-only">{t('analysis.loading', {}, locale)}</span>
      <div className="analysis-answer" aria-hidden="true">
        <Skeleton className="h-4 w-24 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
        <Skeleton className="h-4 w-64 rounded-full" />
        <Skeleton className="h-4 w-full rounded-full" />
      </div>
      <div className="analysis-loading-rows" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-4 w-full rounded-full" />
        ))}
      </div>
      <Skeleton className="h-[200px] w-full rounded-xl" aria-hidden="true" />
    </div>
  )
}
