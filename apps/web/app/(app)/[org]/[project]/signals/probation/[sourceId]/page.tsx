import { redirect } from 'next/navigation'
import { getOrgPrincipal } from '../../../../../../../lib/principal'
import { ProbationPanel } from '../../../../../../../features/probation/panel'
import { t } from '../../../../../../../features/probation/i18n'
import { settingsLocale } from '../../../../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('probation.title', {}, await settingsLocale()) }
}

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string; sourceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { org, project, sourceId } = await params
  // A member's role comes from the URL organisation's membership (#647); a bare session carries none.
  const { principal } = await getOrgPrincipal(org)
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  const query = await searchParams
  const view = typeof query.view === 'string' ? query.view : 'label'
  return (
    <ProbationPanel
      org={org}
      project={project}
      sourceId={sourceId}
      view={view}
      role={principal.role ?? null}
      locale={await settingsLocale()}
    />
  )
}
