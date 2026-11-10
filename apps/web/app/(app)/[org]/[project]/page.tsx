import { Suspense } from 'react'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { slugSchema } from '@skyclause/contracts'
import { prefersMalay } from '../../../../lib/preferred-language'
import { ProjectOverview } from '../../../../features/overview/project-overview'
import { t } from '../../../../features/overview/catalogue'

export default async function Page({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project } = await params
  if (!slugSchema.safeParse(org).success || !slugSchema.safeParse(project).success) notFound()
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'
  return (
    <Suspense
      fallback={
        <main className="overview-page" data-project-overview aria-busy="true">
          <h1>{t('overview.title', {}, locale)}</h1>
        </main>
      }
    >
      <ProjectOverview org={org} project={project} locale={locale} />
    </Suspense>
  )
}
