'use client'

import { stripPlotSvg, stripShare, type StripLayout } from '@skyclause/elements'
import { formatDate } from '@skyclause/i18n/format'
import { Tooltip, TooltipContent, TooltipTrigger } from '#ui/tooltip'
import { t } from './catalogue'
import { ClockTicks } from './clock-ticks'

/**
 * The readings, drawn at real size: the lines are an SVG whose width follows the column while its height stays in
 * pixels, and every label is HTML at 13px laid out around it, so no text scales with the column. The x axis labels
 * whole MYT hours and thins as the column narrows. Each rain lane is titled with its unit above it, the rolling lane's
 * title also naming the Lebat line, so nothing is labelled on a curve; on a strip narrower than 24rem the Lebat name
 * moves under the chart, where a longer locale cannot push it past the edge. `layout` comes from `layoutStrip` with
 * `laneGap` 30 and a header band of 28 (when now is on the strip) plus 20 for the first lane's title.
 */
export function ReadingsChart({ layout, locale }: { layout: StripLayout; locale: 'en' | 'ms' }) {
  const pct = (x: number) => `${(stripShare(layout, x) * 100).toFixed(3)}%`
  const crossing = layout.crossings[0]
  const nowNearEnd = stripShare(layout, layout.nowX) > 0.8
  // A crossing is a rise through the Lebat line, so the free side of its mark is above and to the left (the curve is
  // under the line there): the label ends at the mark, clear of the line. Its left edge never passes the plot's own
  // (8.5rem holds the label). With no room above (the header or the lane over this one is too close) it sits under the
  // line to the right of the mark instead, where the curve is above.
  const lebat = (
    <>
      <svg aria-hidden="true" width="16" height="4" viewBox="0 0 16 4" className="shrink-0">
        <path d="M0 2h16" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      </svg>
      {t('data.strip.lebat_line', {}, locale)}
    </>
  )
  return (
    <div data-strip-chart className="@container flex w-full flex-col gap-1">
      <div className="flex flex-wrap justify-between gap-x-4 type-small text-muted-foreground">
        <span>{t('data.strip.chart_date', { date: formatDate(layout.from, locale) }, locale)}</span>
        {layout.isReplay && layout.replayBadge ? <span data-replay="true">{layout.replayBadge}</span> : null}
      </div>
      <div className="relative" style={{ height: layout.plotHeight }}>
        {layout.lanes
          .filter((lane) => lane.key === 'rain5' || lane.key === 'rain60')
          .map((lane) => (
            <span
              key={`${lane.key}-title`}
              data-lane-title={lane.key}
              className="absolute right-2 left-9 flex items-baseline justify-between gap-x-3 type-small whitespace-nowrap text-muted-foreground"
              style={{ top: lane.top - 20 }}
            >
              <span>{t(lane.key === 'rain5' ? 'data.strip.lane_rain5' : 'data.strip.lane_rain60', {}, locale)}</span>
              {lane.key === 'rain60' && layout.lebatY !== null ? (
                <span data-lebat-label className="hidden items-center gap-1.5 text-foreground @[24rem]:inline-flex">
                  {lebat}
                </span>
              ) : null}
            </span>
          ))}
        {layout.lanes.flatMap((lane) =>
          lane.ticks.map((tick) => (
            <span
              key={`${lane.key}-${tick.value}`}
              data-numeric
              className="absolute left-0 w-8 -translate-y-1/2 text-right type-small text-muted-foreground"
              style={{ top: tick.y }}
            >
              {tick.label}
            </span>
          ))
        )}
        <div className="absolute inset-y-0 right-2 left-9">
          <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: stripPlotSvg(layout) }} />
          {layout.warningMarks.map((mark) => (
            <span
              key={mark.id}
              aria-hidden="true"
              className="absolute top-0 h-1 rounded-full bg-foreground opacity-35"
              style={{ left: pct(mark.x1), width: `max(4px, calc(${pct(mark.x2)} - ${pct(mark.x1)}))` }}
            />
          ))}
          {layout.crowdMarks.map((mark) => (
            <span
              key={mark.id}
              aria-hidden="true"
              className="absolute top-0 h-1.5 rounded-full bg-foreground opacity-15"
              style={{ left: pct(mark.ax1), width: `max(4px, calc(${pct(mark.ax2)} - ${pct(mark.ax1)}))` }}
            />
          ))}
          {layout.errorMarks.map((mark) => (
            <svg
              key={`${mark.from}-${mark.to}`}
              aria-hidden="true"
              viewBox="0 0 8 8"
              className="absolute top-2 size-2 -translate-x-1/2 text-foreground"
              style={{ left: pct((mark.x1 + mark.x2) / 2) }}
              data-error="true"
            >
              <path d="M0 0 8 8M8 0 0 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          ))}
          {layout.nowInSpan ? (
            <span
              data-now-label
              className={`absolute top-2 type-small whitespace-nowrap text-foreground ${nowNearEnd ? '-translate-x-full pr-1.5' : 'pl-1.5'}`}
              style={{ left: pct(layout.nowX) }}
            >
              {t('data.strip.now_label', {}, locale)}
            </span>
          ) : null}
          {crossing ? (
            <span
              data-crossing-label
              className={`absolute type-small whitespace-nowrap text-foreground ${crossing.labelBeside ? 'pl-2' : '-translate-x-full pr-3'}`}
              style={
                crossing.labelBeside
                  ? { left: pct(crossing.x), top: crossing.y + 6 }
                  : { left: `max(${pct(crossing.x)}, 8.5rem)`, top: crossing.y - 30 }
              }
            >
              {crossing.label}
            </span>
          ) : null}
          {layout.crossings.map((mark) => (
            <Tooltip key={mark.at}>
              <TooltipTrigger
                className="absolute flex min-h-[34px] min-w-[34px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full motion-reduce:transition-none [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:min-w-[44px]"
                style={{ left: pct(mark.x), top: mark.y }}
                aria-label={mark.label}
              >
                <span data-crossing="true" className="block h-3 w-1.5 rounded-full bg-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <span className="tabular-nums">{mark.label}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="mr-2 ml-9">
        <ClockTicks from={layout.from} to={layout.to} locale={locale} />
      </div>
      {layout.lebatY !== null ? (
        <p data-lebat-legend className="mr-2 ml-9 flex items-center gap-1.5 type-small text-foreground @[24rem]:hidden">
          {lebat}
        </p>
      ) : null}
    </div>
  )
}
