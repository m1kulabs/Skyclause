'use client'

import { useId, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { formatDate, formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { ChartContainer, ChartTooltip } from '#ui/chart'
import { t } from './catalogue'
import type { NumericPoint } from './model'

export interface SignalChartPoint extends NumericPoint {
  record?: string
}

export interface SignalChartProps {
  title: string
  summary: string
  points: readonly SignalChartPoint[]
  locale: 'en' | 'ms'
  station?: string
  references?: readonly { value: number; label: string }[]
  baseline?: { value: number; label: string }
  yDomain?: [number, number]
  dateAxis?: boolean
}

export function SignalsChart({
  title,
  summary,
  points,
  locale,
  station,
  references = [],
  baseline,
  yDomain,
  dateAxis = false
}: SignalChartProps) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  const titleId = `${tableId}-title`
  const rows = points.map((point) => ({
    ...point,
    valueLabel: point.value === null ? t('signals.gap', {}, locale) : formatNumber(point.value, locale)
  }))

  return (
    <figure className="min-w-0 rounded-lg border border-border p-4" data-signal-chart aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-base font-semibold">
            {title}
          </h3>
          {station && (
            <p translate="no" className="text-xs text-muted-foreground tabular-nums">
              {station}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((value) => !value)}
          className="min-h-[34px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(pointer:coarse)]:min-h-[44px]"
        >
          {t(showTable ? 'signals.table_hide' : 'signals.table_show', {}, locale)}
        </Button>
      </div>
      <figcaption data-chart-summary className="mt-2 text-sm text-muted-foreground">
        {summary}
      </figcaption>
      <div hidden={showTable} className="mt-3 min-w-0">
        {points.length ? (
          <ChartContainer
            config={{ value: { label: title, color: 'var(--chart-1)' } }}
            className="h-64 w-full"
            aria-describedby={`${tableId}-summary`}
          >
            <LineChart data={points} accessibilityLayer margin={{ left: 0, right: 34, top: 16, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="at"
                axisLine={false}
                tickLine={false}
                minTickGap={54}
                tickFormatter={(value: string) => (dateAxis ? formatDate(value, locale) : formatTime(value, locale))}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                domain={yDomain ?? ['auto', 'auto']}
                tickFormatter={(value: number) => formatNumber(value, locale)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as SignalChartPoint | undefined
                  if (!active || !point) return null
                  return (
                    <div className="rounded-md border border-border bg-popover p-2 text-sm shadow-md">
                      <time dateTime={point.at}>{formatDateTime(point.at, locale)}</time>
                      <p>{point.value === null ? t('signals.gap', {}, locale) : formatNumber(point.value, locale)}</p>
                    </div>
                  )
                }}
              />
              {references.map((reference) => (
                <ReferenceLine
                  key={reference.label}
                  y={reference.value}
                  stroke="var(--chart-3)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  label={{
                    value: reference.label,
                    position: 'insideTopRight',
                    fill: 'var(--foreground)',
                    fontSize: 11
                  }}
                />
              ))}
              {baseline && (
                <ReferenceLine
                  y={baseline.value}
                  stroke="var(--chart-4)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  label={{ value: baseline.label, position: 'insideTopRight', fill: 'var(--foreground)', fontSize: 11 }}
                />
              )}
              <Line
                dataKey="value"
                name={title}
                type="linear"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('signals.empty', {}, locale)}</p>
        )}
      </div>
      <p id={`${tableId}-summary`} className="sr-only">
        {summary}
      </p>
      <div
        id={tableId}
        hidden={!showTable}
        role="region"
        aria-label={t('signals.chart_table_caption', { name: title }, locale)}
        /* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe scrollable-region-focusable requires the scroll container to be keyboard-focusable. */
        tabIndex={0}
        className="mt-3 max-h-96 overflow-auto"
      >
        <table className="w-full border-collapse text-sm tabular-nums">
          <caption className="text-left text-muted-foreground">
            {t('signals.chart_table_caption', { name: title }, locale)}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="border-b p-2 text-left">
                {t('signals.table_time', {}, locale)}
              </th>
              <th scope="col" className="border-b p-2 text-right">
                {t('signals.table_value', {}, locale)}
              </th>
              <th scope="col" className="border-b p-2 text-left">
                {t('signals.table_state', {}, locale)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((point, index) => (
              <tr key={`${point.at}-${index}`}>
                <th scope="row" className="border-b p-2 text-left font-normal">
                  <time dateTime={point.at}>{formatDateTime(point.at, locale)}</time>
                </th>
                <td className="border-b p-2 text-right">{point.valueLabel}</td>
                <td className="border-b p-2">
                  {point.record ??
                    (point.value === null ? t('signals.gap', {}, locale) : t('signals.reading', {}, locale))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
