import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { SignalsPage } from '../../../../../features/signals/signals-page'
import { t } from '../../../../../features/signals/catalogue'
import { getOrgPrincipal } from '../../../../../lib/principal'
import { prefersMalay } from '../../../../../lib/preferred-language'
import { settingsLocale } from '../../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('signals.title', {}, await settingsLocale()) }
}

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const { principal } = await getOrgPrincipal(org)
  // Members only, like the crawl's rule for every page under /{org} (#637); the organisation layout only checks
  // that the organisation exists (#596). Share-link access to project pages arrives with their share-link owner.
  if (principal?.kind !== 'session' || !principal.role) notFound()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  const canBind = principal.role === 'owner' || principal.role === 'admin'
  return <SignalsPage org={org} project={project} locale={locale} canBind={canBind} />
}
