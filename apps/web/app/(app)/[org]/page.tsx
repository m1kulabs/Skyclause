import { log } from '@skyclause/config'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ApiProblem } from '../../../lib/api-fetch'
import { ApiOriginError } from '../../../lib/api-origin'
import { DashboardPage } from '../../../features/dashboard/dashboard-page'
import { readDashboard, type DashboardRead } from '../../../features/dashboard/operations'

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params

  let initialData: DashboardRead | null = null
  let initialError: number | null = null

  if (process.env.APP_ENV !== 'test') {
    try {
      initialData = await readDashboard(org, new Headers(await headers()))
    } catch (error) {
      if (error instanceof ApiOriginError) log.error('dashboard cannot read the API', { error: error.message })
      if (error instanceof ApiProblem && error.status === 404) notFound()
      initialError = error instanceof ApiProblem ? error.status : null
    }
  }

  return <DashboardPage org={org} initialData={initialData} initialError={initialError} />
}
