import { notFound } from 'next/navigation'
import { getPrincipal } from '../../../../../lib/principal'
import { Subscribers } from '../../../../../features/subscribers'
import { maySeeSettings } from '../../../../../features/settings/access'

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { org, project } = await params
  const principal = await getPrincipal()
  // Match #96's session-only page gates until the real auth owner replaces its can() placeholder.
  if (
    principal?.kind !== 'session' ||
    principal.isGuest ||
    principal.orgId !== org ||
    !principal.role ||
    !['owner', 'admin', 'approver'].includes(principal.role)
  )
    notFound()
  const manage = maySeeSettings(principal, { scope: 'project', section: 'channels', orgId: org })
  return (
    <Subscribers
      org={org}
      project={project}
      manage={manage}
      locale={(await searchParams).lang === 'ms' ? 'ms' : 'en'}
    />
  )
}
