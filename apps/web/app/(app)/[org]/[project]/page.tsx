import { Suspense } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { slugSchema } from '@skyclause/contracts'
import { prefersMalay } from '../../../../lib/preferred-language'
import { getOrgPrincipal } from '../../../../lib/principal'
import { projectVisible } from '../../../../features/overview/server-gate'
import { ProjectOverview } from '../../../../features/overview/project-overview'
import { t } from '../../../../features/overview/catalogue'
import { settingsLocale } from '../../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('overview.title', {}, await settingsLocale()) }
}

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  if (!slugSchema.safeParse(org).success || !slugSchema.safeParse(project).success) notFound()
  // A signed-in account that is not a member of the organisation, or a member asking for a project they cannot see (a
  // mistyped or foreign slug), gets the not-found page like any unknown address, never a read error. The test
  // runtime's principal names no real organisation, so only a resolved one is checked here.
  const { principal, orgId, organisation } = await getOrgPrincipal(org)
  if (principal?.kind === 'session' && organisation && orgId) {
    if (!principal.role) notFound()
    if (!(await projectVisible(principal, orgId, project))) notFound()
  }
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <Suspense
      fallback={
        <div className="overview-page" data-project-overview aria-busy="true">
          <h1 className="type-title">{t('overview.title', {}, locale)}</h1>
        </div>
      }
    >
      <ProjectOverview org={org} project={project} locale={locale} />
    </Suspense>
  )
}
