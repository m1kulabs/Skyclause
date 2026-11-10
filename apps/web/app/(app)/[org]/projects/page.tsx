import { notFound } from 'next/navigation'
import { ProjectsList } from '../../../../features/projects-list/projects-list'
import { getOrgPrincipal } from '../../../../lib/principal'

/** `/{org}/projects`: the organisation's projects with per-pack modes, review counts and signal health. */
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org } = await params
  const query = await searchParams
  const { principal } = await getOrgPrincipal(org)
  if (principal?.kind !== 'session' || !principal.orgId) notFound()
  const role = principal.role
  const canCreate = role === 'owner' || role === 'admin'
  const archived = query.archived === '1'
  return <ProjectsList org={org} canCreate={canCreate} archived={archived} />
}
