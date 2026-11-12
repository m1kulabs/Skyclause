import { Skeleton } from '#ui/skeleton'
import { formatNumber } from '@skyclause/i18n/format'
import { t } from './catalogue'
import type { Counts } from './index'

type Locale = 'en' | 'ms'

const figures = ['confirmed', 'unconfirmed', 'suppressed'] as const
const quiet = ['bounced', 'complained', 'unsubscribed'] as const

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
          <span data-numeric>{t('subscribers.total', { count: counts.total }, locale)}</span>
          {quiet.map((status) => (
            <span key={status} data-numeric>
              {t(
                'subscribers.count_item',
                { name: t(`subscribers.status_${status}`, {}, locale), count: counts[status] },
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
  rows
}: {
  title: string
  rows: { key: string; label: string; count: number; title?: string }[]
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
            <span
              className="min-w-0 [overflow-wrap:anywhere]"
              title={row.title}
              translate={row.title ? 'no' : undefined}
            >
              {row.label}
            </span>
            <span data-numeric className="text-right font-semibold">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Where notices go: the row's own fill is the bar, drawn from the same counts as the figures. */
export function Reach({ counts, locale }: { counts: Counts; locale: Locale }) {
  if (!counts.by_channel.length && !counts.by_window.length) return null
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {counts.by_channel.length > 0 && (
        <MeasureList
          title={t('subscribers.by_channel', {}, locale)}
          rows={counts.by_channel.map((item) => ({
            key: item.channel,
            label: t(`subscribe.${item.channel}_channel`, {}, locale),
            count: item.count
          }))}
        />
      )}
      {counts.by_window.length > 0 && (
        <MeasureList
          title={t('subscribers.by_window', {}, locale)}
          rows={counts.by_window.map((item) => ({
            key: item.window_id,
            label: `…${item.window_id.slice(-8)}`,
            title: item.window_id,
            count: item.count
          }))}
        />
      )}
    </div>
  )
}
