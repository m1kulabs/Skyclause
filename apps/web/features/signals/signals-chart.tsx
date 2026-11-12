'use client'

import { useId } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { formatDate, formatDateTime, formatNumber, formatTime } from '@skyclause/i18n/format'
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
  const id = useId()
  const titleId = `${id}-title`

  return (
    <figure className="min-w-0 rounded-xl bg-raised p-5" data-signal-chart aria-labelledby={titleId}>
      <div>
        <h3 id={titleId} className="type-card-title">
          {title}
        </h3>
        {station && (
          <p translate="no" data-numeric className="type-small text-muted-foreground">
            {station}
          </p>
        )}
      </div>
      <figcaption data-chart-summary className="mt-1 type-small text-muted-foreground">
        {summary}
      </figcaption>
      <div className="mt-3 min-w-0">
        {points.length ? (
          <ChartContainer
            config={{ value: { label: title, color: 'var(--chart-emphasis)' } }}
            className="h-64 w-full"
            aria-describedby={`${id}-summary`}
          >
            <LineChart data={points} accessibilityLayer margin={{ left: 0, right: 34, top: 16, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="at"
                axisLine={false}
                tickLine={false}
                minTickGap={54}
                tickFormatter={(value: string) => (dateAxis ? formatDate(value, locale) : formatTime(value, locale))}
                tick={{ fontSize: 13, fill: 'var(--chart-ink)' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                domain={yDomain ?? ['auto', 'auto']}
                tick={{ fontSize: 13, fill: 'var(--chart-ink)' }}
                tickFormatter={(value: number) => formatNumber(value, locale)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as SignalChartPoint | undefined
                  if (!active || !point) return null
                  return (
                    <div className="rounded-md bg-popover p-2 text-[13px] text-popover-foreground shadow-lg">
                      <time dateTime={point.at}>{formatDateTime(point.at, locale)}</time>
                      <p data-numeric>
                        {point.value === null ? t('signals.gap', {}, locale) : formatNumber(point.value, locale)}
                      </p>
                    </div>
                  )
                }}
              />
              {references.map((reference) => (
                <ReferenceLine
                  key={reference.label}
                  y={reference.value}
                  stroke="var(--chart-ink)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  label={{
                    value: reference.label,
                    position: 'insideTopRight',
                    fill: 'var(--foreground)',
                    fontSize: 13
                  }}
                />
              ))}
              {baseline && (
                <ReferenceLine
                  y={baseline.value}
                  stroke="var(--chart-ink)"
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  label={{ value: baseline.label, position: 'insideTopRight', fill: 'var(--foreground)', fontSize: 13 }}
                />
              )}
              <Line
                dataKey="value"
                name={title}
                type="linear"
                stroke="var(--chart-emphasis)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="py-8 text-center type-body text-muted-foreground">{t('signals.empty', {}, locale)}</p>
        )}
      </div>
      <p id={`${id}-summary`} className="sr-only">
        {summary}
      </p>
    </figure>
  )
}
