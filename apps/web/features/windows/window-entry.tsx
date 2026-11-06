import { formatDate, formatTime } from '@skyclause/i18n/format'
import { ModeBadge } from '../brand/mode-badge'
import type { BundleView, FeedView, WindowView } from './operations'
import { t } from './catalogue'
import { localDate } from './model'
import styles from './windows.module.css'

export function callState(call: NonNullable<WindowView['latest_calls']['sky']>, bundles: BundleView[]) {
  const bundle = bundles.find((bundle) => bundle.id === call.bundle_id)
  return bundle?.state === 'needs_review' ? 'needs_review' : call.state
}

export function WindowEntry({
  window,
  root,
  bundles,
  feeds,
  onEdit,
  compact = false
}: {
  window: WindowView
  root: string
  bundles: BundleView[]
  feeds: FeedView[]
  onEdit: (id: string) => void
  compact?: boolean
}) {
  const calls = (['sky', 'crowd'] as const).flatMap((pack) =>
    window.latest_calls[pack] ? [{ pack, call: window.latest_calls[pack] }] : []
  )
  return (
    <div className={styles.entry}>
      <button type="button" data-window-edit className={styles.identity} onClick={() => onEdit(window.id)}>
        <span>{window.title}</span>
        {!compact && (
          <span className={styles.meta}>
            <WindowDate value={localDate(window.starts_at)} />
            {t('windows.period', { from: formatTime(window.starts_at, 'en'), to: formatTime(window.ends_at, 'en') })}
          </span>
        )}
      </button>
      {window.guest && <span>{t('windows.guest')}</span>}
      {calls.map(({ pack, call }) => (
        <a
          key={pack}
          href={`${root}/bundles/${encodeURIComponent(call.bundle_id)}`}
          data-call-mark={callState(call, bundles)}
          className={styles.call}
        >
          <ModeBadge mode={call.mode ?? 'no_call'} pack={pack} />
          {t('windows.call', {
            pack: t(`windows.${pack}`),
            mode: t(`windows.${call.mode ?? 'no_call'}`),
            state: t(`windows.${callState(call, bundles)}`)
          })}
        </a>
      ))}
      {calls.some(({ call }) => call.mode === 'hybrid_recommended') && (
        <p className={styles.meta}>{t('windows.hybrid_note')}</p>
      )}
      {!compact && (
        <>
          {!calls.length && <p className={styles.meta}>{t('windows.no_calls')}</p>}
          {window.series_id && <p className={styles.meta}>{t('windows.series', { id: window.series_id })}</p>}
          {window.ics_feed_id && (
            <p className={styles.meta}>
              {t(feeds.some((feed) => feed.id === window.ics_feed_id) ? 'windows.feed' : 'windows.feed_missing', {
                url:
                  feeds.find((feed) => feed.id === window.ics_feed_id)?.url ??
                  feeds.find((feed) => feed.id === window.ics_feed_id)?.filename ??
                  window.ics_feed_id,
                id: window.ics_feed_id
              })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function WindowDate({ value }: { value: string }) {
  return <time dateTime={value}>{formatDate(`${value}T12:00:00+08:00`, 'en')}</time>
}
