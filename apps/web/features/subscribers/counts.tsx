import type { ReactNode } from 'react'
import { Skeleton } from '#ui/skeleton'
import { formatDateCompact, formatNumber, formatTime } from '@skyclause/i18n/format'
import { t } from './catalogue'
import type { Counts } from './index'
import type { WindowName } from './window-names'

type Locale = 'en' | 'ms'

const figures = ['confirmed', 'unconfirmed', 'suppressed'] as const
const quiet = ['bounced', 'complained', 'unsubscribed'] as const

/** The windows listed in a ranking, never more than this many rows. */
const WINDOW_ROWS = 12

/** The answer first: how many people will receive a notice, as figures in type with no tile around them. */
export function Figures({ counts, locale }: { counts: Counts | undefined; locale: Locale }) {
  return (
    <div className="grid min-w-0 gap-3" data-subscriber-counts>
      <dl className="m-0 flex flex-wrap gap-x-10 gap-y-3">
        {figures.map((status) => (
          <div key={status} className="grid gap-0.5">
            <dt className="type-body text-muted-foreground">{t(`subscribers.status_${status}`, {}, locale)}</dt>
            <dd className="type-title m-0" data-numeric data-subscriber-count={status}>
              {counts ? formatNumber(counts[status], locale) : <Skeleton className="h-8 w-12 rounded-full" />}
            </dd>
          </div>
        ))}
      </dl>
      {counts && (
        <p className="type-body flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span data-numeric>{t('subscribers.total', { count: formatNumber(counts.total, locale) }, locale)}</span>
          {quiet.map((status) => (
            <span key={status} data-numeric>
              {t(
                'subscribers.count_item',
                { name: t(`subscribers.status_${status}`, {}, locale), count: formatNumber(counts[status], locale) },
                locale
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

function MeasureList({
  title,
  rows,
  locale,
  note
}: {
  title: string
  rows: { key: string; label: ReactNode; count: number }[]
  locale: Locale
  note?: string
}) {
  const largest = Math.max(1, ...rows.map((row) => row.count))
  return (
    <section className="grid min-w-0 content-start gap-2 rounded-xl bg-card p-5" aria-label={title}>
      <h3 className="type-card-title">{title}</h3>
      <ul className="m-0 grid list-none gap-1 p-0">
        {rows.map((row) => (
          <li
            key={row.key}
            className="measure-row type-body flex min-h-9 items-center justify-between gap-3 px-3"
            style={{ '--share': Math.round((row.count / largest) * 100) } as React.CSSProperties}
          >
            <span className="min-w-0 [overflow-wrap:anywhere]">{row.label}</span>
            <span data-numeric className="text-right font-semibold">
              {formatNumber(row.count, locale)}
            </span>
          </li>
        ))}
      </ul>
      {note ? <p className="type-small m-0 text-muted-foreground">{note}</p> : null}
    </section>
  )
}

/** A window by its name and its time (an MYT time carries its zone), as the windows page names it: never by an identifier. */
function windowLabel(name: WindowName | undefined, locale: Locale): ReactNode {
  if (!name) return t('subscribers.window_gone', {}, locale)
  const when = `${formatDateCompact(name.starts_at, locale)}, ${formatTime(name.starts_at, locale)}`
  return t('subscribers.window_label', { title: name.title, when }, locale)
}

/**
 * Where notices go: the row's own fill is the bar, drawn from the same counts as the figures. Windows are named by the
 * project's windows read; `windows` is the answer to it, `windowsError` its failure shown in place of the card.
 */
export function Reach({
  counts,
  windows,
  windowsError,
  locale
}: {
  counts: Counts
  windows: ReadonlyMap<string, WindowName> | undefined
  windowsError?: ReactNode
  locale: Locale
}) {
  if (!counts.by_channel.length && !counts.by_window.length) return null
  const hidden = counts.by_window.length - WINDOW_ROWS
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {counts.by_channel.length > 0 && (
        <MeasureList
          title={t('subscribers.by_channel', {}, locale)}
          locale={locale}
          rows={counts.by_channel.map((item) => ({
            key: item.channel,
            label: t(`subscribe.${item.channel}_channel`, {}, locale),
            count: item.count
          }))}
        />
      )}
      {counts.by_window.length > 0 &&
        (windowsError ??
          (windows ? (
            <MeasureList
              title={t('subscribers.by_window', {}, locale)}
              locale={locale}
              rows={counts.by_window.slice(0, WINDOW_ROWS).map((item) => ({
                key: item.window_id,
                label: windowLabel(windows.get(item.window_id), locale),
                count: item.count
              }))}
              note={
                hidden > 0
                  ? t(
                      hidden === 1 ? 'subscribers.by_window_more_one' : 'subscribers.by_window_more_other',
                      {
                        count: formatNumber(hidden, locale)
                      },
                      locale
                    )
                  : undefined
              }
            />
          ) : (
            <Skeleton className="h-32 w-full rounded-xl" />
          )))}
    </div>
  )
}
