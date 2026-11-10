import { recordWebVital } from '@skyclause/config'
import { analyticsEvent, resolvePublicProject } from '@skyclause/db'
import type { ApiDeps } from '../context'
import type { IngestBody } from './body'

// #111's writes: browser events become `analytics_event` rows under `withSystem('analytics-ingest')`, vitals become
// points on the OTel histogram `skyclause.web_vitals` and never rows.

export type BrowserIngest = Extract<IngestBody, { name: string }>
export type VitalIngest = Extract<IngestBody, { type: 'vital' }>

/**
 * One browser-event row. `project` (`{orgSlug}/{slug}`) resolves to IDs for a public project only; a private or
 * unknown project is dropped, never an error. The write carries IDs only: no IP, user agent, referrer or account.
 */
export async function ingestBrowserEvent(deps: ApiDeps, body: BrowserIngest): Promise<void> {
  let orgId: string | null = null
  let projectId: string | null = null
  if (body.project) {
    const [orgSlug, slug] = body.project.split('/') as [string, string]
    const found = await deps.withPublicReader((tx) => resolvePublicProject(tx, { orgSlug, slug }))
    if (found) {
      orgId = found.orgId
      projectId = found.id
    }
  }
  await deps.withSystem('analytics-ingest', (tx) =>
    tx.insert(analyticsEvent).values({ orgId, projectId, name: body.name, props: body.props })
  )
}

/** One point on `skyclause.web_vitals` (attributes `metric` and `route_group`); a no-op until telemetry starts. */
export function ingestVital(body: VitalIngest): void {
  recordWebVital({ metric: body.metric, value: body.value, route_group: body.route_group })
}
