import type { Mode } from '@skyclause/contracts'
import { brandStates } from '@skyclause/elements'
import { formatClock, formatDate } from '@skyclause/i18n/format'
import { t as brandText } from '@skyclause/i18n/brand'
import { Glyph } from '../brand/glyph'
import { ModeBadge } from '../brand/mode-badge'
import type { BundleView, FeedView, WindowView } from './operations'
import { t, type Locale } from './catalogue'
import { callState } from './day-model'
import { localDate } from './model'

export { callState }

/** "15:30–16:00 MYT"; a window that ends on another day names that day. */
export function windowRange(window: WindowView, locale: Locale) {
  const from = formatClock(window.starts_at, locale)
  const to = formatClock(window.ends_at, locale)
  const endDate = localDate(window.ends_at)
  return endDate === localDate(window.starts_at)
    ? t('windows.range', { from, to }, locale)
    : t('windows.range_day', { from, to, date: formatDate(`${endDate}T12:00:00+08:00`, locale) }, locale)
}

/**
 * A call's mode in a month cell, where a capsule must stay on one line: the glyph and a short word (the pack's name
 * too when both packs call the window), cut off with an ellipsis rather than wrapped. The full name is its title, and
 * what a screen reader reads; the timeline's list carries it in full.
 */
function CompactMode({
  mode,
  pack,
  showPack,
  locale
}: {
  mode: Mode | 'no_call'
  pack: 'sky' | 'crowd'
  showPack: boolean
  locale: Locale
}) {
  const { level, tone, word } = brandStates[mode]
  const packName = brandText(`brand.packs.${pack}`, {}, locale)
  const full = brandText('brand.badge_with_pack', { pack: packName, mode: brandText(word, {}, locale) }, locale)
  const short = t(`windows.short_${mode}`, {}, locale)
  return (
    <span className="mode-badge" data-mode={mode} lang={locale} title={full}>
      <span className="mode-badge-pill min-w-0 whitespace-nowrap" data-status={level} data-tone={tone}>
        <Glyph state={mode} />
        <span className="truncate" aria-hidden="true">
          {showPack ? brandText('brand.badge_with_pack', { pack: packName, mode: short }, locale) : short}
        </span>
        <span className="sr-only" translate="no">
          {full}
        </span>
      </span>
    </span>
  )
}

function Calls({
  window,
  root,
  bundles,
  compact,
  locale
}: {
  window: WindowView
  root: string
  bundles: BundleView[]
  compact: boolean
  locale: Locale
}) {
  const calls = (['sky', 'crowd'] as const).flatMap((pack) =>
    window.latest_calls[pack] ? [{ pack, call: window.latest_calls[pack] }] : []
  )
  if (!calls.length)
    return <span className="type-small text-muted-foreground">{t('windows.no_call_yet', {}, locale)}</span>
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
                ? 'flex min-h-6 min-w-0 max-w-full flex-col items-start gap-0.5 rounded-xl hover:bg-accent'
                : 'inline-flex min-h-6 items-center gap-2 rounded-full pr-2 hover:bg-accent'
            }
          >
            {compact ? (
              <CompactMode mode={call.mode ?? 'no_call'} pack={pack} showPack={calls.length > 1} locale={locale} />
            ) : (
              <ModeBadge mode={call.mode ?? 'no_call'} pack={pack} locale={locale} />
            )}
            <span className="type-small whitespace-nowrap">{t(`windows.${state}`, {}, locale)}</span>
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
  locale,
  seriesName,
  added = false,
  compact = false
}: {
  window: WindowView
  root: string
  bundles: BundleView[]
  feeds: FeedView[]
  onEdit: (id: string) => void
  locale: Locale
  /** The name of the window's series (its first occurrence's title): the API names a series by an id only. */
  seriesName?: string
  added?: boolean
  compact?: boolean
}) {
  const feed = window.ics_feed_id ? feeds.find((item) => item.id === window.ics_feed_id) : undefined
  const feedSource = feed?.url ?? feed?.filename
  const hybrid = (['sky', 'crowd'] as const).some((pack) => window.latest_calls[pack]?.mode === 'hybrid_recommended')
  return (
    <div
      data-window-id={window.id}
      data-added={added || undefined}
      className={
        compact
          ? 'flex min-w-0 flex-col gap-1'
          : 'grid min-w-0 gap-x-4 gap-y-1 rounded-md md:grid-cols-[9.5rem_minmax(0,1fr)] md:items-start data-added:bg-raised lg:grid-cols-[9.5rem_minmax(12rem,1fr)_auto]'
      }
    >
      <time
        dateTime={window.starts_at}
        data-numeric
        className={
          compact ? 'type-small whitespace-nowrap text-muted-foreground' : 'type-body min-h-6 py-0.5 whitespace-nowrap'
        }
      >
        {windowRange(window, locale)}
      </time>
      <div className="flex min-w-0 flex-col">
        <button
          type="button"
          data-window-edit
          aria-description={t('windows.edit_hint', {}, locale)}
          onClick={() => onEdit(window.id)}
          className="min-h-6 w-fit max-w-full py-0.5 text-left type-body font-medium break-words underline decoration-1 underline-offset-3 hover:decoration-2"
        >
          {window.title}
        </button>
        {!compact && (
          <div className="flex min-w-0 flex-wrap gap-x-3 type-small text-muted-foreground">
            <span>{t(`windows.${window.kind}`, {}, locale)}</span>
            {window.guest && <span>{t('windows.guest', {}, locale)}</span>}
            {window.series_id && (
              <p>
                {seriesName && seriesName !== window.title ? (
                  <>
                    {t('windows.series', {}, locale)} <span translate="no">{seriesName}</span>
                  </>
                ) : (
                  t('windows.repeats', {}, locale)
                )}
              </p>
            )}
            {window.ics_feed_id && (
              <p className="min-w-0 [overflow-wrap:anywhere]">
                {feedSource ? (
                  <>
                    {t('windows.feed', {}, locale)} <span translate="no">{feedSource}</span>
                  </>
                ) : (
                  t('windows.feed_missing', {}, locale)
                )}
              </p>
            )}
          </div>
        )}
        {hybrid && <p className="type-small text-muted-foreground">{t('windows.hybrid_note', {}, locale)}</p>}
      </div>
      <div
        className={
          compact
            ? 'flex min-w-0 flex-col items-start gap-1'
            : 'flex flex-wrap items-center gap-x-3 gap-y-1 md:col-start-2 lg:col-start-3 lg:justify-end'
        }
      >
        <Calls window={window} root={root} bundles={bundles} compact={compact} locale={locale} />
      </div>
    </div>
  )
}

export function WindowDate({ value, locale }: { value: string; locale: Locale }) {
  return <time dateTime={value}>{formatDate(`${value}T12:00:00+08:00`, locale)}</time>
}
