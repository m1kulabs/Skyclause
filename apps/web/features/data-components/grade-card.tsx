'use client'

import type { AnalysisMetric, Grade } from '@skyclause/contracts'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { Card, CardContent, CardHeader, CardTitle } from '#ui/card'
import { ReplayMark } from '../brand/replay-mark'
import { t } from './catalogue'
import { isRateMetric, metricInterval, metricName, metricText, metricValue, percentText } from './metrics'

export interface GradeCardProps {
  grade: Grade
  metric?: AnalysisMetric | null
  period?: { from: string; to: string } | null
  replay?: boolean
  source?: string | null
  locale?: 'en' | 'ms'
}

/**
 * One graded figure: the metric's name (never its API key), the figure on the metric's own scale (a share as a
 * percentage, read as the analysis screen reads it), `x of n` for a share with its n, and the Wilson interval in words
 * and as a bar. Without a measure it says so (n=0).
 */
export function GradeCard({
  grade,
  metric = null,
  period = null,
  replay = false,
  source = null,
  locale = 'en'
}: GradeCardProps) {
  const n = metric?.n ?? 0
  const value = metric ? metricValue(metric) : null
  const rate = metric ? isRateMetric(metric) : false
  const low = metric?.low ?? null
  const high = metric?.high ?? null
  const showBar = rate && n > 0 && low !== null && high !== null && value !== null
  const words = metric ? metricInterval(metric, locale) : null

  return (
    <Card data-grade={grade.id}>
      <CardHeader>
        <CardTitle>{metric ? metricName(metric.metric, locale) : t('data.grade.n_zero', {}, locale)}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="type-figure" data-numeric>
          {metric && n > 0 ? metricText(metric, locale) : t('data.grade.n_zero', {}, locale)}
        </p>
        <p className="mt-1 type-small text-muted-foreground" data-numeric>
          {rate && metric && metric.x !== null && n > 0
            ? `${t('data.grade.count', { x: formatNumber(metric.x, locale), n: formatNumber(n, locale) }, locale)} · `
            : ''}
          {n === 0 ? t('data.grade.n_zero', {}, locale) : t('data.grade.n', { count: n }, locale)}
        </p>
        {period ? (
          <p className="mt-1 type-small text-muted-foreground">
            {t(
              'data.grade.period',
              { from: formatDate(period.from, locale), to: formatDate(period.to, locale) },
              locale
            )}
          </p>
        ) : null}
        {showBar ? (
          <>
            <div
              role="img"
              aria-label={t(
                'data.grade.interval_label',
                { low: percentText(low, locale), high: percentText(high, locale) },
                locale
              )}
              className="relative mt-3 h-6 w-full rounded-full bg-raised"
              data-wilson-interval
            >
              <div
                className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-muted-foreground"
                style={{
                  left: `${low * 100}%`,
                  width: `${Math.max(0, high - low) * 100}%`
                }}
              />
              <div
                className="absolute top-0 h-full w-1 rounded-full bg-foreground"
                style={{ left: `calc(${value * 100}% - 2px)` }}
              />
            </div>
            <p className="mt-1 type-small text-muted-foreground" data-numeric>
              {words}
            </p>
          </>
        ) : (
          <p className="mt-2 type-small text-muted-foreground">
            {n === 0 ? t('data.grade.empty', {}, locale) : rate ? t('data.grade.no_interval', {}, locale) : null}
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 type-small text-muted-foreground">
          {source ? <span>{source}</span> : null}
          {replay ? <ReplayMark locale={locale} /> : null}
        </p>
      </CardContent>
    </Card>
  )
}
