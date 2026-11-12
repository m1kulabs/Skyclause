'use client'

import { useId, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { Button } from '#ui/button'
import { formatDate, formatDateCompact, formatNumber } from '@skyclause/i18n/format'
import { t } from './catalogue'
import { axisTicks, rateMetrics, type LiveSeries, type Locale } from './model'
import { EmptyBlock, metricName, metricText, Time, WilsonInterval } from './presentation'

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
            <table>
              <caption className="sr-only">{label}</caption>
              <thead>
                <tr>
                  {['at', 'value', 'sampleSize', 'origin'].map((key) => (
                    <th key={key} scope="col" data-figure={key === 'value' || key === 'sampleSize' ? '' : undefined}>
                      {t(`analysis.${key}`, { n: '' }, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.map((point, index) => (
                  <tr key={`${point.at}-${index}`} data-origin={point.kind}>
                    <td>
                      <Time at={point.at} locale={locale} />
                    </td>
                    <td data-figure="">
                      <span data-numeric>{metricText(point.metric, locale)}</span>
                      <WilsonInterval metric={point.metric} locale={locale} />
                    </td>
                    <td data-figure="" data-numeric>
                      {t('analysis.n', { n: formatNumber(point.metric.n, locale) }, locale)}
                    </td>
                    <td>{t('analysis.live', {}, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
