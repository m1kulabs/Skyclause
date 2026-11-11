import { headers } from 'next/headers'
import { SignalsPage } from '../../../../../features/signals/signals-page'
import { prefersMalay } from '../../../../../lib/preferred-language'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return <SignalsPage org={org} project={project} locale={locale} />
}
