import type { ReactNode } from 'react'
import { layoutStrip, stripShare, type StripWindow } from '@skyclause/elements'
import { formatClock, formatDate, formatTime } from '@skyclause/i18n/format'
import { Glyph } from '../brand/glyph'
import { StatusMark } from '../brand/status-mark'
import { t } from './catalogue'
import { ClockTicks } from './clock-ticks'

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

/**
 * The day strip: one capsule per window on a track one day long, filled by its call's mode, with "now" marked. The
 * capsules are a picture of the day; the list under them carries every time, word and link. It has no hooks and no
 * client code: a server component (a public page) can render it without shipping script. Import it from
 * `data-components/day-strip`, not the index, which also loads the client components.
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
  const layout = layoutStrip({ from, to, now, windows, rain5: [], rain60: [], locale })
  const at = (x: number) => `${(stripShare(layout, x) * 100).toFixed(3)}%`
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
      <div className="relative h-10 rounded-full bg-surface in-data-[slot=card]:bg-raised" aria-hidden="true">
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
      <ClockTicks from={from} to={to} locale={locale} />
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
                    <a
                      href={href}
                      className="inline-flex min-h-6 min-w-0 items-center break-words underline underline-offset-3 hover:decoration-2"
                    >
                      {mark.title}
                    </a>
                  ) : (
                    <span className="min-w-0 break-words">{mark.title}</span>
                  )
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}
      {list && marks.length > MAX_ROWS ? (
        <p className="type-small text-muted-foreground">
          {t(
            marks.length - MAX_ROWS === 1 ? 'data.day.more_one' : 'data.day.more',
            { count: marks.length - MAX_ROWS },
            locale
          )}
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
  /** Replaces the sentence under the track ("No windows on 12 November 2026."), for an empty read that spans more than that day. */
  caption?: ReactNode
  locale?: 'en' | 'ms'
}

/**
 * A successful read with no windows: the empty track, the day's hours, one sentence and the next action. Free of hooks
 * and client code, like DayStrip: a server component can render both without shipping script.
 */
export function EmptyDay({ from, to, now, action = null, caption, locale = 'en' }: EmptyDayProps) {
  const layout = layoutStrip({ from, to, now, rain5: [], rain60: [], locale })
  const at = (x: number) => `${(stripShare(layout, x) * 100).toFixed(3)}%`
  return (
    <figure data-empty-day className="flex w-full flex-col gap-2">
      <div className="relative h-10 rounded-full bg-surface in-data-[slot=card]:bg-raised" aria-hidden="true">
        {layout.nowInSpan ? (
          <span
            data-now
            className="absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full bg-ink"
            style={{ left: at(layout.nowX) }}
          />
        ) : null}
      </div>
      <ClockTicks from={from} to={to} locale={locale} />
      <figcaption className="flex flex-wrap items-center gap-3">
        <span>{caption ?? t('data.day.empty', { date: formatDate(from, locale) }, locale)}</span>
        {action}
      </figcaption>
    </figure>
  )
}
