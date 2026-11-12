'use client'

import { useMemo, type ReactNode } from 'react'
import { layoutStrip, type StripWindow } from '@skyclause/elements'
import { formatClock, formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'

export interface DayStripProps {
  /** The span the strip shows, usually one MYT day or one afternoon. */
  from: string
  to: string
  now: string
  /** Every window of the span with its call's state, from a successful read. A failed read is a SourceError instead. */
  windows: readonly StripWindow[]
  /** Each window's page by window id; the list row is the link (a short window's capsule is too small to be a target). */
  hrefs?: Readonly<Record<string, string>>
  /** List the windows under the strip with their times and calls (default). */
  list?: boolean
  /** The one next action an empty day offers, such as declaring a window. */
  emptyAction?: ReactNode
  /** Set inside another figure (WindowStrip): the strip renders as a plain block with no figure of its own. */
  embedded?: boolean
  locale?: 'en' | 'ms'
}

const MAX_ROWS = 50
const HOUR = 3_600_000

/** Ticks on the hour across the span: every hour up to six hours, every two up to twelve, else every three. */
function hourTicks(from: string, to: string): string[] {
  const start = Date.parse(from)
  const end = Date.parse(to)
  const hours = (end - start) / HOUR
  const step = (hours <= 6 ? 1 : hours <= 12 ? 2 : 3) * HOUR
  const ticks: string[] = []
  for (let at = Math.ceil(start / step) * step; at <= end; at += step) ticks.push(new Date(at).toISOString())
  return ticks
}

function Ticks({ from, to, locale }: { from: string; to: string; locale: 'en' | 'ms' }) {
  const span = Math.max(1, Date.parse(to) - Date.parse(from))
  return (
    <div className="relative h-5 type-small text-muted-foreground">
      {hourTicks(from, to).map((at) => {
        const share = (Date.parse(at) - Date.parse(from)) / span
        return (
          <time
            key={at}
            dateTime={at}
            className="absolute top-0 whitespace-nowrap"
            style={{
              left: `${(share * 100).toFixed(3)}%`,
              transform: share < 0.04 ? 'none' : share > 0.96 ? 'translateX(-100%)' : 'translateX(-50%)'
            }}
          >
            {formatClock(at, locale)}
          </time>
        )
      })}
    </div>
  )
}

/**
 * The day strip: one capsule per window on a track one day long, filled by its call's mode, with "now" marked. The
 * capsules are a picture of the day; the list under them carries every time, word and link.
 */
export function DayStrip({
  from,
  to,
  now,
  windows,
  hrefs,
  list = true,
  emptyAction = null,
  embedded = false,
  locale = 'en'
}: DayStripProps) {
  const layout = useMemo(
    () => layoutStrip({ from, to, now, windows, rain5: [], rain60: [], locale }),
    [from, to, now, windows, locale]
  )
  const span = layout.plotRight - layout.plotLeft
  const at = (x: number) => `${(((x - layout.plotLeft) / span) * 100).toFixed(3)}%`
  const date = formatDate(from, locale)
  const marks = layout.windowMarks

  if (!marks.length)
    return embedded ? null : <EmptyDay from={from} to={to} now={now} action={emptyAction} locale={locale} />
  const Frame = embedded ? 'div' : 'figure'
  const Caption = embedded ? 'p' : 'figcaption'

  return (
    <Frame
      className="day-strip flex w-full flex-col gap-2"
      aria-label={embedded ? undefined : t('data.day.label', { date }, locale)}
    >
      <Caption className="flex flex-wrap gap-x-2 type-small text-muted-foreground">
        <span>
          {marks.length === 1
            ? t('data.day.summary_one', { date }, locale)
            : t('data.day.summary', { count: marks.length, date }, locale)}
        </span>
        {layout.nowInSpan ? (
          <time dateTime={now}>{t('data.day.now', { time: formatTime(now, locale) }, locale)}</time>
        ) : null}
      </Caption>
      <div className="relative h-10 rounded-full bg-surface" aria-hidden="true">
        {marks.map((mark) => {
          const tone = mark.tone === 'pending' ? 'no-call' : mark.tone
          return (
            <span
              key={mark.id}
              data-window={mark.id}
              data-tone={mark.draft ? undefined : tone}
              data-draft={mark.draft || undefined}
              data-pending={mark.tone === 'pending' || undefined}
              className="@container absolute top-1 bottom-1 flex min-w-6 items-center justify-center gap-1.5 rounded-full px-1.5 tone-fill data-draft:border-2 data-draft:border-dotted data-draft:border-ink data-pending:border-dotted"
              style={{ left: at(mark.x1), width: `max(24px, calc(${at(mark.x2)} - ${at(mark.x1)}))` }}
            >
              {mark.state ? <Glyph state={mark.state} /> : null}
              {mark.word ? (
                <span className="hidden truncate text-[13px] leading-4 font-medium @[9rem]:inline">{mark.word}</span>
              ) : null}
            </span>
          )
        })}
        {layout.nowInSpan ? (
          <span
            data-now
            className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: at(layout.nowX) }}
          />
        ) : null}
      </div>
      <Ticks from={from} to={to} locale={locale} />
      {list ? (
        <ol className="flex flex-col" aria-label={t('data.day.list', {}, locale)}>
          {marks.slice(0, MAX_ROWS).map((mark) => {
            const href = hrefs?.[mark.id]
            const range = (
              <time dateTime={mark.from} className="whitespace-nowrap">
                {t(
                  'data.day.range',
                  { from: formatClock(mark.from, locale), to: formatClock(mark.to, locale) },
                  locale
                )}
              </time>
            )
            return (
              <li
                key={mark.id}
                data-window-row={mark.id}
                className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-1.5 last:border-b-0"
              >
                {range}
                {mark.state ? (
                  <StatusMark state={mark.state} locale={locale} />
                ) : (
                  <span className="type-small text-muted-foreground">{t('data.day.pending', {}, locale)}</span>
                )}
                {mark.draft ? (
                  <span className="type-small text-muted-foreground">{t('data.day.draft', {}, locale)}</span>
                ) : null}
                {mark.title ? (
                  href ? (
                    <a href={href} className="inline-flex min-h-6 items-center underline underline-offset-3">
                      {mark.title}
                    </a>
                  ) : (
                    <span>{mark.title}</span>
                  )
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      {list && marks.length > MAX_ROWS ? (
        <p className="type-small text-muted-foreground">
          {t('data.day.more', { count: marks.length - MAX_ROWS }, locale)}
        </p>
      ) : null}
    </Frame>
  )
}

export interface EmptyDayProps {
  from: string
  to: string
  now: string
  /** The one next action, such as declaring a window. */
  action?: ReactNode
  locale?: 'en' | 'ms'
}

/** A successful read with no windows: the empty track, the day's hours, one sentence and the next action. */
export function EmptyDay({ from, to, now, action = null, locale = 'en' }: EmptyDayProps) {
  const layout = useMemo(() => layoutStrip({ from, to, now, rain5: [], rain60: [], locale }), [from, to, now, locale])
  const span = layout.plotRight - layout.plotLeft
  const at = (x: number) => `${(((x - layout.plotLeft) / span) * 100).toFixed(3)}%`
  return (
    <figure data-empty-day className="flex w-full flex-col gap-2">
      <div className="relative h-10 rounded-full bg-surface" aria-hidden="true">
        {layout.nowInSpan ? (
          <span
            data-now
            className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: at(layout.nowX) }}
          />
        ) : null}
      </div>
      <Ticks from={from} to={to} locale={locale} />
      <figcaption className="flex flex-wrap items-center gap-3">
        <span>{t('data.day.empty', { date: formatDate(from, locale) }, locale)}</span>
        {action}
      </figcaption>
    </figure>
  )
}
