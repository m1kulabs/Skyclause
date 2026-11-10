import { redirect } from 'next/navigation'
import { getPrincipal } from '../../../../../../../lib/principal'
import { ProbationPanel } from '../../../../../../../features/probation/panel'
import { t } from '../../../../../../../features/probation/i18n'

export const metadata = { title: t('probation.title') }

export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ org: string; project: string; sourceId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const principal = await getPrincipal()
  if (principal?.kind !== 'session' || principal.isGuest) redirect('/sign-up')
  const { org, project, sourceId } = await params
  const query = await searchParams
  const view = typeof query.view === 'string' ? query.view : 'label'
  return <ProbationPanel org={org} project={project} sourceId={sourceId} view={view} role={principal.role ?? null} />
}
