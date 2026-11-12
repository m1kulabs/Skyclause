import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { AnalysisPage } from '../../../../features/analysis/analysis-page'
import { getOrgPrincipal } from '../../../../lib/principal'
import { prefersMalay } from '../../../../lib/preferred-language'
import { t } from '../../../../features/analysis/catalogue'
import { settingsLocale } from '../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('analysis.title', {}, await settingsLocale()) }
}

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const { principal } = await getOrgPrincipal(org)
  // PRD: the organisation roll-up is its members'.
  if (principal?.kind !== 'session' || !principal.role) notFound()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return <AnalysisPage org={org} locale={locale} />
}
