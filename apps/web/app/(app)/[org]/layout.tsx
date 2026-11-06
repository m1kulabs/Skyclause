import type { ReactNode } from 'react'
import { OrgLive } from '../../../features/org-live'

export default async function OrganisationLayout({
  children,
  params
}: {
  children: ReactNode
  params: Promise<{ org: string }>
}) {
  const { org } = await params
  return (
    <>
      <OrgLive org={org} />
      {children}
    </>
  )
}
