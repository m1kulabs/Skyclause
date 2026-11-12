import {
  ApiError,
  getAccountPreferences,
  getBundle,
  getCall,
  getCallExplanation,
  listProjectBundles
} from '@skyclause/api'
import { can } from '@skyclause/auth'
import { log } from '@skyclause/config'
import { withTenant } from '@skyclause/db'
import { getOrgPrincipal } from '../../lib/principal'
import type { CallDetail } from './operations'
import type { InitialReview } from './use-bundle-review'
import { approves, LIST_LIMIT } from './model'

/** D33's permalink host, as the `getCall` route picks it: the marketing origin under `HOST_MODE=multi`, else the app's. */
const permalinkOrigin = () =>
  (process.env.HOST_MODE === 'multi' && process.env.MARKETING_ORIGIN) || process.env.APP_ORIGIN!

/**
 * #372: the bundle and its calls for the page's first paint, read on the server through the services `/v1` serves, so
 * the review shows before the client's JavaScript has loaded, with the project's bundles for the list beside it. `useBundleReview` still reads it all again on load, with
 * the run, strip, preferences and role. Only a member's session that may view the organisation's projects gets one, as
 * the routes' `requireOrg` and `requirePermission('project.view')` allow. Otherwise, or when a read fails, the page
 * renders as the client reads it.
 */
export async function serverReview(org: string, bundleId: string): Promise<InitialReview | undefined> {
  const { principal, orgId } = await getOrgPrincipal(org)
  if (principal?.kind !== 'session' || !orgId || principal.orgId !== orgId || !can(principal, 'project.view')) return
  try {
    return await withTenant({ orgId, principal }, async (tx) => {
      const ctx = { principal, tx }
      const bundle = await getBundle(ctx, { id: bundleId })
      const calls: CallDetail[] = []
      // One transaction is one connection, so the reads take turns; each call merges as the client merges it.
      for (const { id } of bundle.calls) {
        const call = await getCall(ctx, { id, origin: permalinkOrigin() })
        calls.push({ ...call, ...(await getCallExplanation(ctx, { id })) })
      }
      const bundles = await listProjectBundles(ctx, { projectId: bundle.project_id, limit: LIST_LIMIT })
      const preferences = await getAccountPreferences(principal.accountId)
      const data = {
        bundle,
        calls,
        shortcuts: preferences?.shortcuts ?? true,
        canApprove: approves(principal.role),
        errors: []
      }
      const list = { status: 'ready' as const, rows: bundles.data, more: Boolean(bundles.next_cursor) }
      return { data, now: Date.now(), list }
    })
  } catch (error) {
    // A missing or out-of-scope bundle is the API's 404; anything else is worth a log line.
    if (!(error instanceof ApiError)) log.warn('bundle page server read failed', { bundleId, error: String(error) })
  }
}
