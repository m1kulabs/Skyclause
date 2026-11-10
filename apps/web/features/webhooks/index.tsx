import { Suspense } from 'react'
import { getPrincipal } from '../../lib/principal'
import { Webhooks } from './client'
import { t } from './catalogue'

export async function WebhookFeature({ settings = false }: { settings?: boolean }) {
  const principal = await getPrincipal()
  const content =
    !principal || principal.kind !== 'session' || principal.isGuest ? (
      <p>{t('webhooks.guest')}</p>
    ) : !['owner', 'admin'].includes(principal.role ?? '') ? (
      <p>{t('webhooks.member')}</p>
    ) : !principal.orgId ? (
      <p>{t('webhooks.missing_org')}</p>
    ) : (
      <Suspense fallback={<p role="status">{t('webhooks.loading')}</p>}>
        <Webhooks org={principal.orgId} settings={settings} />
      </Suspense>
    )
  return (
    <section aria-label={t(settings ? 'webhooks.endpoints' : 'webhooks.title')}>
      {!settings && <h1 className="text-[26px] font-bold">{t('webhooks.title')}</h1>}
      {content}
    </section>
  )
}
