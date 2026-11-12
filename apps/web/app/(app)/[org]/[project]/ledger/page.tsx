import { Suspense } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getOrgPrincipal } from '../../../../../lib/principal'
import { LedgerPage } from '../../../../../features/ledger/page'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const { principal } = await getOrgPrincipal(org)
  // PRD: the ledger is its members', a share-link holder's for the shared project and a Commons guest's; the API
  // scopes a link or a guest token to its project. Everyone else, signed out included, gets the not-found page.
  const member = principal?.kind === 'session' && !!principal.role
  if (!member && principal?.kind !== 'share_link' && principal?.kind !== 'guest_token') notFound()
  const locale = (await headers()).get('accept-language')?.startsWith('ms') ? 'ms' : 'en'
  return (
    <Suspense>
      <LedgerPage org={org} projectSlug={project} principal={principal} locale={locale} />
    </Suspense>
  )
}
