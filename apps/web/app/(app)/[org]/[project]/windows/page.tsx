import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getOrgPrincipal } from '../../../../../lib/principal'
import { WindowsPage } from '../../../../../features/windows/windows-page'
import { FirstRunProgress } from '../../../../../features/onboarding/first-run-progress'
import { t } from '../../../../../features/windows/catalogue'
import { prefersMalay } from '../../../../../lib/preferred-language'

export const metadata = { title: t('windows.title') }

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  const { principal } = await getOrgPrincipal(org)
  // PRD routes: a project's windows are its members', a share-link holder's for the shared project and a Commons
  // guest's, as the ledger's are; the API scopes a link or a guest token to its project. Everyone else, signed out
  // included, gets the not-found page.
  const member = principal?.kind === 'session' && !!principal.role
  if (!member && principal?.kind !== 'share_link' && principal?.kind !== 'guest_token') notFound()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  // The first-run steps are an Owner's or Admin's (they read and skip the organisation's steps): the window step
  // brings them here, so the steps continue here too, and disappear once every step is done.
  const firstRun =
    principal?.kind === 'session' && (principal.role === 'owner' || principal.role === 'admin') ? (
      <FirstRunProgress org={org} locale={locale} />
    ) : null
  return <WindowsPage key={`${org}/${project}`} org={org} project={project} firstRun={firstRun} locale={locale} />
}
