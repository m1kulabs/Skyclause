import { Suspense } from 'react'
import { getPrincipal } from '../../lib/principal'
import { Skeleton } from '#ui/skeleton'
import { Webhooks } from './client'
import { t } from './catalogue'

export async function WebhookFeature({
  settings = false,
  locale = 'en'
}: {
  settings?: boolean
  locale?: 'en' | 'ms'
}) {
  const principal = await getPrincipal()
  const content =
    !principal || principal.kind !== 'session' || principal.isGuest ? (
      <p className="type-text">{t('webhooks.guest', {}, locale)}</p>
    ) : !['owner', 'admin'].includes(principal.role ?? '') ? (
      <p className="type-text">{t('webhooks.member', {}, locale)}</p>
    ) : !principal.orgId ? (
      <p className="type-text">{t('webhooks.missing_org', {}, locale)}</p>
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
