import { formatClock, formatDate } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import type { BundleView, FeedView, WindowView } from './operations'
import { t } from './catalogue'
import { callState } from './day-model'
import { localDate } from './model'

export { callState }

/** "15:30–16:00 MYT"; a window that ends on another day names that day. */
export function windowRange(window: WindowView) {
  const from = formatClock(window.starts_at, 'en')
  const to = formatClock(window.ends_at, 'en')
  const endDate = localDate(window.ends_at)
  return endDate === localDate(window.starts_at)
    ? t('windows.range', { from, to })
    : t('windows.range_day', { from, to, date: formatDate(`${endDate}T12:00:00+08:00`, 'en') })
}

function Calls({
  window,
  root,
  bundles,
  compact
}: {
  window: WindowView
  root: string
  bundles: BundleView[]
  compact: boolean
}) {
  const calls = (['sky', 'crowd'] as const).flatMap((pack) =>
    window.latest_calls[pack] ? [{ pack, call: window.latest_calls[pack] }] : []
  )
  if (!calls.length) return <span className="type-small text-muted-foreground">{t('windows.no_call_yet')}</span>
  return (
    <>
      {calls.map(({ pack, call }) => {
        const state = callState(call, bundles)
        return (
          <a
            key={pack}
            href={`${root}/bundles/${encodeURIComponent(call.bundle_id)}`}
            data-call-mark={state}
            className={
              compact
                ? 'flex min-h-6 min-w-0 flex-col items-start gap-0.5 rounded-xl'
                : 'inline-flex min-h-6 items-center gap-2 rounded-full pr-2 hover:bg-accent'
            }
          >
            <ModeBadge mode={call.mode ?? 'no_call'} pack={pack} />
            <span className="type-small whitespace-nowrap">{t(`windows.${state}`)}</span>
          </a>
        )
      })}
    </>
  )
}

/**
 * One window as a list row under its day's track: when, what it is called (the control that opens it), its calls as
 * links to their bundles, and where it came from. The list row is the link: the capsule above is only a picture.
 */
export function WindowEntry({
  window,
  root,
  bundles,
  feeds,
  onEdit,
  added = false,
  compact = false
}: {
  window: WindowView
  root: string
  bundles: BundleView[]
  feeds: FeedView[]
  onEdit: (id: string) => void
  added?: boolean
  compact?: boolean
}) {
  const feed = window.ics_feed_id ? feeds.find((item) => item.id === window.ics_feed_id) : undefined
  const hybrid = (['sky', 'crowd'] as const).some((pack) => window.latest_calls[pack]?.mode === 'hybrid_recommended')
  return (
    <div
      data-window-id={window.id}
      data-added={added || undefined}
      className={
        compact
          ? 'flex min-w-0 flex-col gap-1'
          : 'grid min-w-0 gap-x-4 gap-y-1 md:grid-cols-[9.5rem_minmax(0,1fr)_auto] md:items-start'
      }
    >
      <time
        dateTime={window.starts_at}
        data-numeric
        className={
          compact ? 'type-small whitespace-nowrap text-muted-foreground' : 'type-body min-h-6 py-0.5 whitespace-nowrap'
        }
      >
        {windowRange(window)}
      </time>
      <div className="flex min-w-0 flex-col">
        <button
          type="button"
          data-window-edit
          onClick={() => onEdit(window.id)}
          className="min-h-6 w-fit max-w-full py-0.5 text-left type-body font-medium break-words underline decoration-1 underline-offset-3 hover:decoration-2"
        >
          {window.title}
        </button>
        {!compact && (
          <div className="flex flex-wrap gap-x-3 type-small text-muted-foreground">
            <span>{t(`windows.${window.kind}`)}</span>
            {window.guest && <span>{t('windows.guest')}</span>}
            {window.series_id && <p>{t('windows.series', { id: window.series_id })}</p>}
            {window.ics_feed_id && (
              <p>
                {t(feed ? 'windows.feed' : 'windows.feed_missing', {
                  url: feed?.url ?? feed?.filename ?? window.ics_feed_id,
                  id: window.ics_feed_id
                })}
              </p>
            )}
          </div>
        )}
        {hybrid && <p className="type-small text-muted-foreground">{t('windows.hybrid_note')}</p>}
      </div>
      <div
        className={
          compact ? 'flex flex-col items-start gap-1' : 'flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end'
        }
      >
        <Calls window={window} root={root} bundles={bundles} compact={compact} />
      </div>
    </div>
  )
}

export function WindowDate({ value }: { value: string }) {
  return <time dateTime={value}>{formatDate(`${value}T12:00:00+08:00`, 'en')}</time>
}
