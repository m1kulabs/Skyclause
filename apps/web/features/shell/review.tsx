'use client'

import { cn } from '#lib/utils'
import { buttonVariants } from '#ui/button'
import { useWaitingCount } from '../org-live'
import { reviewHref } from './navigation'
import { t } from './i18n'

/**
 * The approver's way in: the organisation dashboard's needs-review block. It prints a count only once the live stream
 * has said how many bundles wait, and never a zero.
 */
export function ReviewLink({ org }: { org: string }) {
  const count = useWaitingCount(org)
  const waiting = count !== null && count > 0 ? count : null
  const shown = waiting !== null && waiting > 99 ? '99+' : String(waiting)
  return (
    <a
      href={reviewHref(org)}
      className={cn(buttonVariants({ variant: 'secondary' }), 'shell-review')}
      aria-label={waiting === null ? undefined : t('app-shell.reviewWaiting', { count: waiting })}
      data-waiting={count ?? 'unknown'}
    >
      <span>{t('app-shell.review')}</span>
      {/* The figure is drawn from data-count: the link's visible text stays "Review", inside its accessible name. */}
      {waiting !== null && <span className="shell-review-count" aria-hidden="true" data-count={shown} />}
    </a>
  )
}
