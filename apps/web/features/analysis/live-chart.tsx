'use client'

import { useId, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { Button } from '#ui/button'
import { formatDate, formatDateCompact, formatNumber } from '@skyclause/i18n/format'
import { t } from './catalogue'
import { rateMetrics } from '../data-components/metrics'
import { axisTicks, type LivePoint, type LiveSeries, type Locale } from './model'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '#ui/table'
import { EmptyBlock, intervalText, metricName, metricText, Time } from './presentation'

export interface LiveChartProps {
  series: LiveSeries
  metric: string
  from: string
  to: string
  locale: Locale
  columns?: boolean
  agreement?: boolean
  n: number
}

/**
 * ANL-6: the only public chart entry point accepts LiveSeries, including its live-only rows. One series in the ink,
 * horizontal grid lines only, no legend (the heading names it), days in MYT on the axis, and a table view of the same
 * points.
 */
export function LiveChart({ series, metric, from, to, locale, n, columns = false, agreement = false }: LiveChartProps) {
  const [table, setTable] = useState(false)
  const id = useId()
  const label = metricName(metric, locale)
  const points = series.points
  const rate = rateMetrics.has(metric)
  const populated = n > 0 && points.some((point) => point.value !== null && point.metric.n > 0)
  // A share runs on its own 0–100% scale; a count or a duration gets round steps above its largest value.
  const ticks = rate
    ? [0, 0.25, 0.5, 0.75, 1]
    : axisTicks(Math.max(agreement ? 1 : 0, ...points.map((point) => point.value ?? 0)))
  const tickText = (value: number) =>
    rate
      ? t('analysis.percent', { value: formatNumber(Math.round(value * 1000) / 10, locale) }, locale)
      : formatNumber(value, locale)
  const summary = t(
    'analysis.summary',
    { metric: label, from: formatDate(from, locale), to: formatDate(to, locale) },
    locale
  )
  return (
    <div data-live-chart={metric} className="analysis-chart-block">
      <div className="analysis-chart-head">
        <h3>{t('analysis.overTime', { metric: label }, locale)}</h3>
        {populated && (
          <Button variant="ghost" size="sm" aria-expanded={table} aria-controls={id} onClick={() => setTable(!table)}>
            {t(table ? 'analysis.view' : 'analysis.table', {}, locale)}
          </Button>
        )}
      </div>
      <p id={`${id}-summary`} className="sr-only">
        {summary}
      </p>
      {agreement && <p className="analysis-kill-label">{t('analysis.killLine', {}, locale)}</p>}
      {!populated ? (
        <>
          <p>{t('analysis.n', { n: formatNumber(n, locale) }, locale)}</p>
          <EmptyBlock message="emptyFinding" locale={locale} />
          <p>{t('analysis.next', {}, locale)}</p>
        </>
      ) : (
        <>
          <div hidden={table}>
            <ChartContainer
              config={{ value: { label, color: 'var(--chart-emphasis)' } }}
              className="analysis-chart"
              aria-describedby={`${id}-summary`}
            >
              <ComposedChart
                data={points}
                accessibilityLayer
                margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
                barCategoryGap={4}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="at"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                  tickMargin={8}
                  tickFormatter={(value: string) => formatDateCompact(value, locale)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  ticks={ticks}
                  domain={[0, ticks.at(-1)!]}
                  width={52}
                  tickFormatter={tickText}
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null
                    const point = points.find((candidate) => candidate.at === payload[0]!.payload.at)
                    return point ? (
                      <div className="analysis-tooltip">
                        <Time at={point.at} locale={locale} />
                        <p data-numeric>{metricText(point.metric, locale)}</p>
                        <p>{t('analysis.n', { n: formatNumber(point.metric.n, locale) }, locale)}</p>
                      </div>
                    ) : null
                  }}
                />
                {agreement && <ReferenceLine y={0.9} stroke="var(--chart-ink)" strokeWidth={1} strokeDasharray="4 4" />}
                {columns ? (
                  <Bar dataKey="value" name={label} fill="var(--chart-emphasis)" radius={0} isAnimationActive={false} />
                ) : (
                  <Line
                    dataKey="value"
                    name={label}
                    type="linear"
                    stroke="var(--chart-emphasis)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ChartContainer>
            <p className="analysis-sub analysis-axis-note">{t('analysis.axisDays', {}, locale)}</p>
          </div>
          <div id={id} hidden={!table} className="analysis-table-frame">
            {/* Rows exist only while the table shows, 50 to a page. */}
            {table && <PointsTable points={points} label={label} locale={locale} />}
          </div>
        </>
      )}
    </div>
  )
}

const PAGE = 50

/** The chart's points as the shared table: each day's figure, its interval in words and its n, 50 days to a page. */
export function PointsTable({ points, label, locale }: { points: LivePoint[]; label: string; locale: Locale }) {
  const [page, setPage] = useState(0)
  const pages = Math.ceil(points.length / PAGE)
  const current = Math.min(page, Math.max(0, pages - 1))
  const shown = points.slice(current * PAGE, current * PAGE + PAGE)
  return (
    <>
      <Table compact>
        <TableCaption className="sr-only">{label}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('analysis.at', {}, locale)}</TableHead>
            <TableHead scope="col" numeric>
              {t('analysis.value', {}, locale)}
            </TableHead>
            <TableHead scope="col">{t('analysis.interval', {}, locale)}</TableHead>
            <TableHead scope="col" numeric>
              {t('analysis.sampleSize', {}, locale)}
            </TableHead>
            <TableHead scope="col">{t('analysis.origin', {}, locale)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((point, index) => (
            <TableRow key={`${point.at}-${index}`} data-origin={point.kind}>
              <TableCell phone="primary">
                <Time at={point.at} locale={locale} />
              </TableCell>
              <TableCell numeric phone="end">
                {metricText(point.metric, locale)}
              </TableCell>
              <TableCell label={t('analysis.interval', {}, locale)}>
                {intervalText(point.metric, locale) || t('analysis.missing', {}, locale)}
              </TableCell>
              <TableCell numeric label={t('analysis.sampleSize', {}, locale)}>
                {t('analysis.n', { n: formatNumber(point.metric.n, locale) }, locale)}
              </TableCell>
              <TableCell phone="hide">{t('analysis.live', {}, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pages > 1 && (
        <div className="analysis-pager">
          <p role="status" className="analysis-muted" data-numeric>
            {t(
              'analysis.rowsShown',
              {
                from: formatNumber(current * PAGE + 1, locale),
                to: formatNumber(current * PAGE + shown.length, locale),
                n: formatNumber(points.length, locale)
              },
              locale
            )}
          </p>
          <Button variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            {t('analysis.previousRows', {}, locale)}
          </Button>
          <Button variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            {t('analysis.nextRows', {}, locale)}
          </Button>
        </div>
      )}
    </>
  )
}
