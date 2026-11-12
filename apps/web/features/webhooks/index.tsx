import { Suspense } from 'react'
import type { Principal } from '@skyclause/contracts'
import { Skeleton } from '#ui/skeleton'
import { NotBuilt } from '../data-components/states'
import { Webhooks } from './client'
import { t } from './catalogue'

/**
 * Webhooks for the principal the page resolved: under `/{org}` that is the organisation's (`getOrgPrincipal`, which
 * fills a real session's `orgId` and role), never the bare session, whose role is null outside an organisation (#647).
 */
export function WebhookFeature({
  principal,
  settings = false,
  locale = 'en'
}: {
  principal: Principal | null
  settings?: boolean
  locale?: 'en' | 'ms'
}) {
  const content =
    !principal || principal.kind !== 'session' || principal.isGuest ? (
      <p className="type-text">{t('webhooks.guest', {}, locale)}</p>
    ) : !principal.orgId ? (
      // `/developers/webhooks` names no organisation, so a real session has none to read webhooks for there; and no
      // webhook operation has a handler yet (e-webhooks). It says so rather than asking for a role or a choice.
      <NotBuilt title={t('webhooks.unavailable', {}, locale)} />
    ) : !['owner', 'admin'].includes(principal.role ?? '') ? (
      <p className="type-text">{t('webhooks.member', {}, locale)}</p>
    ) : (
      <Suspense
        fallback={
          <div className="grid gap-2">
            <Skeleton className="h-10 w-full rounded-full" />
            <Skeleton className="h-10 w-3/4 rounded-full" />
            <p role="status" className="sr-only">
              {t('webhooks.loading', {}, locale)}
            </p>
          </div>
        }
      >
        <Webhooks org={principal.orgId} settings={settings} locale={locale} />
      </Suspense>
    )
  return (
    <section
      aria-label={t(settings ? 'webhooks.endpoints' : 'webhooks.title', {}, locale)}
      className="grid min-w-0 gap-6"
    >
      {!settings && <h1 className="type-title">{t('webhooks.title', {}, locale)}</h1>}
      {content}
    </section>
  )
}
