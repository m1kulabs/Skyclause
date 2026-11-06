'use client'

import type { AnalysisMetric, Grade } from '@skyclause/contracts'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { Badge } from '#ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '#ui/card'
import { t } from './catalogue'

export interface GradeCardProps {
  grade: Grade
  metric?: AnalysisMetric | null
  period?: { from: string; to: string } | null
  replay?: boolean
  source?: string | null
  locale?: 'en' | 'ms'
}

export function GradeCard({
  grade,
  metric = null,
  period = null,
  replay = false,
  source = null,
  locale = 'en'
}: GradeCardProps) {
  const n = metric?.n ?? 0
  const value = metric?.x
  const low = metric?.low ?? null
  const high = metric?.high ?? null
  const showBar = n > 0 && low !== null && high !== null && value !== null && value !== undefined

  return (
    <Card data-grade={grade.id}>
      <CardHeader>
        <CardTitle className="tabular-nums">
          {value === null || value === undefined
            ? t('data.grade.n_zero', {}, locale)
            : t(
                'data.grade.value_label',
                { metric: metric?.metric ?? grade.outcome, value: formatNumber(value, locale) },
                locale
              )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm tabular-nums">
          {n === 0 ? t('data.grade.n_zero', {}, locale) : t('data.grade.n', { count: n }, locale)}
        </p>
        {period ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              'data.grade.period',
              { from: formatDate(period.from, locale), to: formatDate(period.to, locale) },
              locale
            )}
          </p>
        ) : null}
        {showBar ? (
          <div
            role="img"
            aria-label={t('data.grade.interval_label', { low: low as number, high: high as number }, locale)}
            className="relative mt-3 h-6 w-full rounded bg-muted"
          >
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded bg-foreground/70"
              style={{
                left: `${(low as number) * 100}%`,
                width: `${Math.max(0, (high as number) - (low as number)) * 100}%`
              }}
            />
            <div
              className="absolute top-0 h-full w-[2px] bg-foreground"
              style={{ left: `calc(${(value as number) * 100}% - 1px)` }}
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {n === 0 ? t('data.grade.empty', {}, locale) : t('data.grade.n_zero', {}, locale)}
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {source ? <span>{source}</span> : null}
          {replay ? <Badge variant="outline">{t('data.grade.replay', {}, locale)}</Badge> : null}
        </p>
      </CardContent>
    </Card>
  )
}
