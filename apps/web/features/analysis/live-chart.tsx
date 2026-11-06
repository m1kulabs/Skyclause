'use client'

import { useId, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { Card, CardContent } from '#ui/card'
import { Button } from '#ui/button'
import { formatDate, formatNumber } from '@skyclause/i18n/format'
import { t } from './catalogue'
import { axisTicks, type LiveSeries, type Locale } from './model'
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

/** ANL-6: the only public chart entry point accepts LiveSeries, including its live-only rows. */
export function LiveChart({ series, metric, from, to, locale, n, columns = false, agreement = false }: LiveChartProps) {
  const [table, setTable] = useState(false)
  const id = useId()
  const label = metricName(metric, locale)
  const points = series.points
  const populated = n > 0 && points.some((point) => point.value !== null && point.metric.n > 0)
  const ticks = axisTicks(Math.max(agreement ? 1 : 0, ...points.map((point) => point.value ?? 0)))
  const summary = t(
    'analysis.summary',
    { metric: label, from: formatDate(from, locale), to: formatDate(to, locale) },
    locale
  )
  return (
    <Card data-live-chart={metric} className="analysis-chart-card">
      <CardContent>
        <div className="analysis-toolbar">
          <h3>{label}</h3>
          {populated && (
            <Button variant="ghost" aria-expanded={table} aria-controls={id} onClick={() => setTable(!table)}>
              {t(table ? 'analysis.view' : 'analysis.table', {}, locale)}
            </Button>
          )}
        </div>
        <p id={`${id}-summary`} className="analysis-muted">
          {summary}
        </p>
        <p>{t('analysis.n', { n: formatNumber(n, locale) }, locale)}</p>
        {agreement && <p className="analysis-kill-label">{t('analysis.killLine', {}, locale)}</p>}
        {!populated ? (
          <>
            <EmptyBlock message="emptyFinding" locale={locale} />
            <p>{t('analysis.next', {}, locale)}</p>
          </>
        ) : (
          <>
            <div hidden={table}>
              <ChartContainer
                config={{ value: { label, color: 'var(--chart-1)' } }}
                className="analysis-chart"
                aria-describedby={`${id}-summary`}
              >
                <ComposedChart
                  data={points}
                  accessibilityLayer
                  margin={{ top: 16, right: 12, bottom: 8, left: 0 }}
                  barCategoryGap={2}
                >
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="at"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={50}
                    tickFormatter={(value: string) => formatDate(value, locale)}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    ticks={ticks}
                    domain={[0, ticks.at(-1)!]}
                    width={46}
                    tickFormatter={(value: number) => formatNumber(value, locale)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null
                      const point = points.find((candidate) => candidate.at === payload[0]!.payload.at)
                      return point ? (
                        <div className="analysis-tooltip">
                          <Time at={point.at} locale={locale} />
                          <p>{metricText(point.metric, locale)}</p>
                          <p>{t('analysis.n', { n: point.metric.n }, locale)}</p>
                          <WilsonInterval metric={point.metric} locale={locale} />
                        </div>
                      ) : null
                    }}
                  />
                  {agreement && <ReferenceLine y={0.9} stroke="var(--chart-3)" strokeWidth={1} strokeDasharray="4 4" />}
                  {columns ? (
                    <Bar dataKey="value" name={label} fill="var(--chart-1)" radius={0} isAnimationActive={false} />
                  ) : (
                    <Line
                      dataKey="value"
                      name={label}
                      type="linear"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                </ComposedChart>
              </ChartContainer>
            </div>
            <div id={id} hidden={!table} className="analysis-table-frame">
              <table>
                <caption>{label}</caption>
                <thead>
                  <tr>
                    {['at', 'value', 'sampleSize', 'origin'].map((key) => (
                      <th key={key} scope="col">
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
                      <td>
                        <p>{metricText(point.metric, locale)}</p>
                        <WilsonInterval metric={point.metric} locale={locale} />
                      </td>
                      <td>{t('analysis.n', { n: formatNumber(point.metric.n, locale) }, locale)}</td>
                      <td>{t('analysis.live', {}, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
