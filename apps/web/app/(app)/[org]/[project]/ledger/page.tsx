import { Suspense } from 'react'
import { headers } from 'next/headers'
import { getPrincipal } from '../../../../../lib/principal'
import { LedgerPage } from '../../../../../features/ledger/page'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const principal = await getPrincipal()
  const locale = (await headers()).get('accept-language')?.startsWith('ms') ? 'ms' : 'en'
  return (
    <Suspense>
      <LedgerPage org={org} projectSlug={project} principal={principal} locale={locale} />
    </Suspense>
  )
}
