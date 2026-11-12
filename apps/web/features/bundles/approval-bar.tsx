'use client'

import { formatNumber } from '@skyclause/i18n/format'
import { Button } from '#ui/button'
import { counted, t, type Locale } from './i18n'
import type { Reach } from './model'
import { SlaCapsule } from './time'

/** The call the bar's Edit and Reject act on: the focused call, else the first one that can still be reviewed. */
export interface BarCall {
  name: string
  rejected: boolean
  onEdit: () => void
  onReject: () => void
}

/** "2 notices to 14 recipients", from counts, in the locale's own plural forms. */
export function reachText(reach: Pick<Reach, 'notices' | 'recipients'>, locale: Locale): Record<string, string> {
  return {
    notices: t(counted('bundles.notices', reach.notices), { count: formatNumber(reach.notices, locale) }, locale),
    recipients: t(
      counted('bundles.recipient_count', reach.recipients),
      { count: formatNumber(reach.recipients, locale) },
      locale
    )
  }
}

/** What pressing Approve does, in words beside it: what it sends and to whom, or that it only records rejections. */
function consequence(count: number, reach: Reach, locale: Locale): string {
  if (!count)
    return reach.rejected
      ? t(
          counted('bundles.consequence_rejections', reach.rejected),
          { count: formatNumber(reach.rejected, locale) },
          locale
        )
      : ''
  if (!reach.notices) return t('bundles.consequence_none', {}, locale)
  return t('bundles.consequence', reachText(reach, locale), locale)
}

/**
 * The decision bar, stuck to the bottom of the screen: the SLA countdown, Edit and Reject for the current call, and
 * Approve for the bundle with what it will send beside it, so none of them needs a scroll. One model on every width:
 * Approve acts at once, with no confirming step, because the approver has just read what it sends.
 */
export function ApprovalBar({
  count,
  reach,
  disabled,
  pending,
  sla,
  now,
  call,
  reason,
  onApprove,
  locale = 'en'
}: {
  count: number
  reach: Reach
  disabled: boolean
  pending: boolean
  sla: string | null
  now: number
  call?: BarCall
  /** Why Approve is disabled, when the reviewer can fix it: a missing verdict, a teaching line left in. */
  reason?: string
  onApprove: () => void
  locale?: Locale
}) {
  const label = pending
    ? t('bundles.pending', {}, locale)
    : count
      ? t(counted('bundles.approve', count), { count: formatNumber(count, locale) }, locale)
      : t('bundles.save_decisions', {}, locale)
  return (
    <footer className="bundle-approval-bar">
      <div className="bundle-approval-panel">
        {sla && <SlaCapsule due={sla} now={now} locale={locale} />}
        {call && (
          <div className="bundle-approval-call">
            <span className="bundle-approval-name" id="bundle-approval-name">
              {call.name}
            </span>
            <Button variant="outline" disabled={pending} aria-describedby="bundle-approval-name" onClick={call.onEdit}>
              {t('bundles.edit', {}, locale)}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              aria-describedby="bundle-approval-name"
              onClick={call.onReject}
            >
              {t(call.rejected ? 'bundles.restore' : 'bundles.reject', {}, locale)}
            </Button>
          </div>
        )}
        <div className="bundle-approval-decide">
          {/* Always mounted, so the reason or the consequence is announced as it changes. */}
          <p
            className="bundle-approval-reason"
            id="bundle-approval-consequence"
            role="status"
            data-blocked={reason ? '' : undefined}
          >
            {reason ?? consequence(count, reach, locale)}
          </p>
          <Button
            className="bundle-approve"
            disabled={disabled}
            aria-describedby="bundle-approval-consequence"
            onClick={onApprove}
          >
            {label}
          </Button>
        </div>
      </div>
    </footer>
  )
}
