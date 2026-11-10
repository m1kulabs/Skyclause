import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getOrgPrincipal } from '../../../lib/principal'
import { OrgLive } from '../../../features/org-live'

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

  return (
    <>
      <OrgLive org={org} />
      {children}
    </>
  )
}
