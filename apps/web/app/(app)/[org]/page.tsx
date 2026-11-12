import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { prefersMalay } from '../../../lib/preferred-language'
import { ApiProblem } from '../../../lib/api-fetch'
import { DashboardPage } from '../../../features/dashboard/dashboard-page'
import { readDashboard, type DashboardRead } from '../../../features/dashboard/operations'
import { t } from '../../../features/dashboard/catalogue'
import { settingsLocale } from '../../../features/settings/locale'

export async function generateMetadata() {
  return { title: t('dashboard.title', {}, await settingsLocale()) }
}

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  const locale = prefersMalay((await headers()).get('accept-language')) ? 'ms' : 'en'

  let initialData: DashboardRead | null = null
  let initialError: number | null = null
  let initialErrorAt: string | null = null

  if (process.env.APP_ENV !== 'test') {
    try {
      initialData = await readDashboard(org, new Headers(await headers()))
    } catch (error) {
      if (error instanceof ApiProblem && error.status === 404) notFound()
      initialError = error instanceof ApiProblem ? error.status : null
      initialErrorAt = new Date().toISOString()
    }
  }

  return (
    <DashboardPage
      org={org}
      locale={locale}
      initialData={initialData}
      initialError={initialError}
      initialErrorAt={initialErrorAt}
    />
  )
}
