import { notFound } from 'next/navigation'
import { getOrgPrincipal } from '../../../../../lib/principal'
import { WindowsPage } from '../../../../../features/windows/windows-page'
import { t } from '../../../../../features/windows/catalogue'

export const metadata = { title: t('windows.title') }

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const { principal } = await getOrgPrincipal(org)
  // PRD routes: a project's windows are its members', a share-link holder's for the shared project and a Commons
  // guest's, as the ledger's are; the API scopes a link or a guest token to its project. Everyone else, signed out
  // included, gets the not-found page.
  const member = principal?.kind === 'session' && !!principal.role
  if (!member && principal?.kind !== 'share_link' && principal?.kind !== 'guest_token') notFound()
  return <WindowsPage key={`${org}/${project}`} org={org} project={project} />
}
