'use client'

import { brandStates } from '@skyclause/elements'
import { formatClock, formatDateCompact } from '@skyclause/i18n/format'
import { t as brandText } from '@skyclause/i18n/brand'
import { Skeleton } from '#ui/skeleton'
import { Glyph } from '../brand/glyph'
import { cn } from '#lib/utils'
import { localDate } from './model'
import { DAY_MS, axisOf, dayStart, instantAt, segmentsOf, share, ticksOf, type Axis, type Segment } from './day-model'
import type { WindowView, FeedView, BundleView, NightView, DayView } from './operations'
import { WindowEntry } from './window-entry'
import { VirtualRows } from './virtual-rows'
import { useNow } from './use-media'
import { t } from './catalogue'

export interface ViewProps {
  windows: WindowView[]
  dates: string[]
  root: string
  feeds: FeedView[]
  bundles: BundleView[]
  nights: NightView[]
  days?: DayView[]
  onEdit: (id: string) => void
  /** The id of the window just saved: its row is marked so the new window is found on the strip. */
  added?: string
}

const LANE = 32
const PAD = 4

/** The minutes after midnight of a night's period on its own date, clipped to the day. */
function nightMinutes(night: NightView, date: string, which: 'arrival' | 'exit') {
  const start = which === 'arrival' ? night.arrival_start : night.exit_start
  const end = which === 'arrival' ? night.arrival_end : night.exit_end
  if (!start || !end) return null
  const origin = dayStart(date)
  const from = Math.max(0, (Date.parse(start) - origin) / 60_000)
  const to = Math.min(DAY_MS / 60_000, (Date.parse(end) - origin) / 60_000)
  return to > from ? { from, to } : null
}

function TrackCapsule({ segment, axis, crowdLane }: { segment: Segment; axis: Axis; crowdLane: boolean }) {
  const { capsule, lane } = segment
  const left = share(segment.from, axis)
  const right = share(segment.to, axis)
  const mode = capsule.state ? brandText(brandStates[capsule.state].word, {}, 'en') : null
  // With a Crowd lane on the day the word names its pack, so the two lanes cannot be mixed up.
  const word =
    mode && crowdLane
      ? brandText('brand.badge_with_pack', { pack: brandText(`brand.packs.${lane}`, {}, 'en'), mode }, 'en')
      : mode
  return (
    <span
      data-window={segment.window.id}
      data-lane={lane}
      data-mark={capsule.call ?? 'pending'}
      data-tone={capsule.tone === 'pending' ? 'no-call' : capsule.tone}
      data-pending={capsule.tone === 'pending' || undefined}
      className="@container absolute flex h-7 min-w-6 items-center justify-center gap-1.5 rounded-full px-1.5 tone-fill data-pending:border-dotted"
      style={{
        left: `${left.toFixed(3)}%`,
        width: `max(24px, ${(right - left).toFixed(3)}%)`,
        top: PAD + (lane === 'crowd' ? LANE : 0)
      }}
    >
      {capsule.state ? <Glyph state={capsule.state} /> : null}
      {word ? <span className="hidden truncate type-small font-medium @[8rem]:inline">{word}</span> : null}
    </span>
  )
}

function Track({
  date,
  segments,
  axis,
  nights,
  now
}: {
  date: string
  segments: Segment[]
  axis: Axis
  nights: NightView[]
  now: number | null
}) {
  const crowdLane = segments.some((segment) => segment.lane === 'crowd')
  const idle = !segments.length && !nights.length
  const periods = nights.flatMap((night) =>
    (['arrival', 'exit'] as const).flatMap((which) => {
      const span = nightMinutes(night, date, which)
      return span ? [{ key: `${night.id}:${which}`, which, ...span }] : []
    })
  )
  const lanes = crowdLane ? 2 : 1
  const height = lanes * LANE + PAD + (periods.length ? 14 : 0)
  const minutesNow = now === null ? null : (now - dayStart(date)) / 60_000
  const weekend = [0, 6].includes(new Date(date).getUTCDay())
  return (
    <div
      aria-hidden={idle ? undefined : 'true'}
      data-track
      className={cn('relative rounded-full', weekend ? 'bg-raised' : 'bg-surface')}
      style={{ height }}
    >
      {idle && (
        <p className="absolute inset-y-0 left-4 flex items-center type-small text-muted-foreground">
          {t('windows.no_windows_day')}
        </p>
      )}
      {segments.map((segment) => (
        <TrackCapsule key={segment.key} segment={segment} axis={axis} crowdLane={crowdLane} />
      ))}
      {periods.map((period) => (
        <span
          key={period.key}
          data-period={period.which}
          className={cn(
            'absolute bottom-1 h-2.5 rounded-full',
            period.which === 'arrival'
              ? 'bg-muted-foreground'
              : 'border-2 border-dashed border-muted-foreground bg-transparent'
          )}
          style={{
            left: `${share(period.from, axis).toFixed(3)}%`,
            width: `max(10px, ${(share(period.to, axis) - share(period.from, axis)).toFixed(3)}%)`
          }}
        />
      ))}
      {minutesNow !== null && minutesNow >= axis.from && minutesNow <= axis.to ? (
        <span
          data-now
          className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${share(minutesNow, axis).toFixed(3)}%` }}
        />
      ) : null}
    </div>
  )
}

export function Night({ night }: { night: NightView }) {
  const period = (start: string | null, end: string | null) =>
    start && end ? t('windows.range', { from: formatClock(start, 'en'), to: formatClock(end, 'en') }) : null
  const arrival = period(night.arrival_start, night.arrival_end)
  const exit = period(night.exit_start, night.exit_end)
  return (
    <li data-night-row={night.id} className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-1.5 type-body">
      <span className="font-medium">
        {night.show_name ? t('windows.show_name', { name: night.show_name }) : t('windows.night', { date: night.date })}
      </span>
      {arrival && (
        <span className="type-small text-muted-foreground">
          {t('windows.arrival')}
          <time dateTime={night.arrival_start} data-numeric className="ml-1.5">
            {arrival}
          </time>
        </span>
      )}
      {exit ? (
        <span className="type-small text-muted-foreground">
          {t('windows.exit')}
          <time dateTime={night.exit_start!} data-numeric className="ml-1.5">
            {exit}
          </time>
        </span>
      ) : (
        <span className="type-small text-muted-foreground">{t('windows.no_exit')}</span>
      )}
    </li>
  )
}

function DayRow({
  date,
  windows,
  segments,
  axis,
  nights,
  day,
  now,
  root,
  feeds,
  bundles,
  onEdit,
  added
}: Pick<ViewProps, 'root' | 'feeds' | 'bundles' | 'onEdit' | 'added'> & {
  date: string
  windows: WindowView[]
  segments: Segment[]
  axis: Axis
  nights: NightView[]
  day?: DayView
  now: number | null
}) {
  const today = date === localDate()
  const weekend = [0, 6].includes(new Date(date).getUTCDay())
  const empty = !windows.length && !nights.length
  const rows = (window: WindowView) => (
    <WindowEntry
      window={window}
      root={root}
      feeds={feeds}
      bundles={bundles}
      onEdit={onEdit}
      added={window.id === added}
    />
  )
  return (
    <section
      data-day={date}
      data-today={today}
      data-weekend={weekend}
      aria-labelledby={`day-${date}`}
      className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[7.5rem_minmax(0,1fr)]"
    >
      <h2
        id={`day-${date}`}
        aria-current={today ? 'date' : undefined}
        className="type-body relative flex flex-wrap items-baseline gap-x-2 pb-2 font-medium current-mark md:block md:self-start md:pt-2"
      >
        <time dateTime={date}>{formatDateCompact(`${date}T12:00:00+08:00`, 'en')}</time>
        {today && (
          <span className="type-small font-normal text-muted-foreground md:block">{t('windows.today_mark')}</span>
        )}
      </h2>
      <div className="flex min-w-0 flex-col gap-1">
        <Track date={date} segments={segments} axis={axis} nights={nights} now={now} />
        {day?.storm_afternoon && (
          <a lang="ms" href={day.storm_afternoon.source_url} className="type-small w-fit underline underline-offset-3">
            {t('windows.met_wording', { wording: day.storm_afternoon.wording })}
          </a>
        )}
        {empty ? null : (
          <>
            {nights.length > 0 && (
              <ul className="flex flex-col" aria-label={t('windows.nights_label')}>
                {nights.map((night) => (
                  <Night key={night.id} night={night} />
                ))}
              </ul>
            )}
            {windows.length > 50 ? (
              <VirtualRows
                items={windows}
                label={t('windows.list_label', { date: formatDateCompact(`${date}T12:00:00+08:00`, 'en') })}
                className="max-h-[32rem] overflow-y-auto"
                render={(window) => (
                  <div data-window-row className="min-h-11 py-1.5">
                    {rows(window)}
                  </div>
                )}
              />
            ) : (
              windows.length > 0 && (
                <ol
                  className="flex flex-col"
                  aria-label={t('windows.list_label', { date: formatDateCompact(`${date}T12:00:00+08:00`, 'en') })}
                >
                  {windows.map((window) => (
                    <li key={window.id} data-window-row className="min-h-11 py-1.5">
                      {rows(window)}
                    </li>
                  ))}
                </ol>
              )
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * The day strip at full size: one row per day on one shared hour axis. Each window is a capsule filled by its call's
 * mode; the list under the track carries every time, word and link.
 */
export function Timeline({
  windows,
  dates,
  root,
  feeds,
  bundles,
  nights,
  days = [],
  onEdit,
  added,
  hideEmpty = false
}: ViewProps & { hideEmpty?: boolean }) {
  const now = useNow()
  const perDay = dates.map((date) => {
    const starting = windows
      .filter((window) => localDate(window.starts_at) === date)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title))
    return {
      date,
      windows: starting,
      segments: segmentsOf(date, windows, bundles),
      nights: nights.filter((night) => night.date === date)
    }
  })
  const bands = nights.flatMap((night) =>
    (['arrival', 'exit'] as const).flatMap((which) => nightMinutes(night, night.date, which) ?? [])
  )
  const axis = axisOf([...perDay.flatMap((day) => day.segments), ...bands])
  const ticks = ticksOf(axis)
  const shown = hideEmpty ? perDay.filter((day) => day.segments.length || day.nights.length) : perDay
  return (
    <div data-timeline className="flex flex-col">
      <div
        aria-hidden="true"
        className="sticky top-[var(--shell-bar-height,0px)] z-10 grid gap-x-6 bg-background py-1 md:grid-cols-[7.5rem_minmax(0,1fr)]"
      >
        <span className="hidden md:block" />
        <div className="relative h-5 type-small text-muted-foreground">
          {ticks.map((minute) => {
            const at = share(minute, axis)
            return (
              <time
                key={minute}
                dateTime={instantAt(dates[0]!, minute)}
                data-numeric
                className="absolute top-0 whitespace-nowrap"
                style={{
                  left: `${at.toFixed(3)}%`,
                  transform: at < 4 ? 'none' : at > 96 ? 'translateX(-100%)' : 'translateX(-50%)'
                }}
              >
                {formatClock(instantAt(dates[0]!, minute), 'en')}
              </time>
            )
          })}
        </div>
      </div>
      {shown.map((day) => (
        <DayRow
          key={day.date}
          date={day.date}
          windows={day.windows}
          segments={day.segments}
          axis={axis}
          nights={day.nights}
          day={days.find((item) => item.date === day.date)}
          now={now}
          root={root}
          feeds={feeds}
          bundles={bundles}
          onEdit={onEdit}
          added={added}
        />
      ))}
    </div>
  )
}

/** Loading: the same fourteen day rows with a skeleton capsule on each track, at the size of the real ones. */
export function TimelineSkeleton() {
  const shapes = [
    { left: 22, width: 30 },
    { left: 40, width: 12 },
    { left: 8, width: 24 },
    { left: 52, width: 34 },
    { left: 30, width: 18 }
  ]
  return (
    <div aria-hidden="true" data-timeline-skeleton className="flex flex-col">
      {Array.from({ length: 14 }, (_, index) => {
        const shape = shapes[index % shapes.length]!
        return (
          <div key={index} className="grid gap-x-6 gap-y-2 py-3 md:grid-cols-[7.5rem_minmax(0,1fr)]">
            <Skeleton className="h-5 w-24 rounded-full" />
            <div className="flex flex-col gap-2">
              <div className="relative h-9 rounded-full bg-surface">
                <Skeleton
                  className="absolute top-1 h-7 rounded-full bg-overlay"
                  style={{ left: `${shape.left}%`, width: `${shape.width}%` }}
                />
              </div>
              <Skeleton className="h-5 w-2/3 rounded-full" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
