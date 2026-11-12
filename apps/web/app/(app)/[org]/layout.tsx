import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getOrgPrincipal } from '../../../lib/principal'
import { OrgLive } from '../../../features/org-live'
import { prefersMalay } from '../../../lib/preferred-language'

export default async function OrganisationLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  const { orgId } = await getOrgPrincipal(org)
  if (!orgId) notFound()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'

  return (
    <>
      <OrgLive org={org} locale={locale} />
      {children}
    </>
  )
}
