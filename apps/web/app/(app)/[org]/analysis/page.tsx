import { headers } from 'next/headers'
import { AnalysisPage } from '../../../../features/analysis/analysis-page'
import { prefersMalay } from '../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return <AnalysisPage org={org} locale={locale} />
}
