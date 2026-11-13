import {
  applyCalendar,
  claimDueIcsFeeds,
  extendDueWindowSeries,
  fetchCalendar,
  realCalendarTransport,
  recordCalendarFailure,
  recordNativeWindowFailure,
  type CalendarTransport,
  type IcsFeedClaim
} from '@skyclause/api/windows'
import {
  listDueNativeWindowSeries,
  listWindowDueProjects,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { log, type WorkerPart } from '../server'

const PROJECT_LIMIT = 32
const BATCH_SERIES_LIMIT = 16
const BATCH_FEED_LIMIT = 8
const SERIES_LIMIT = 2
const FEED_LIMIT = 1
interface Target {
  orgId: string
  projectId: string
}
interface WorkBudget {
  series: number
  feeds: number
}
interface Dependencies {
  now: () => Date
  transport: CalendarTransport
}
const principal = systemPrincipal('windows-due')
const tenant = <T>(target: Target, fn: Parameters<typeof withTenant<T>>[1]) =>
  withTenant({ orgId: target.orgId, principal }, fn)

/** HTTP is outside the committed claim and the fresh fenced apply transaction. */
export async function refreshClaimedIcsFeed(claim: IcsFeedClaim, deps: Dependencies) {
  const target = { orgId: claim.orgId, projectId: claim.projectId }
  let phase: 'fetch' | 'apply' = 'fetch'
  try {
    const result =
      claim.url === null
        ? { status: 'unchanged' as const }
        : await fetchCalendar(claim.url, { etag: claim.etag, lastModified: claim.lastModified }, deps.transport)
    phase = 'apply'
    const now = deps.now()
    await tenant(target, (tx) =>
      applyCalendar(
        { tx, principal },
        {
          feedId: claim.feedId,
          claimId: claim.claimId,
          result,
          now,
          memberAccess: { now }
        }
      )
    )
  } catch (error) {
    const now = deps.now()
    await tenant(target, (tx) =>
      recordCalendarFailure(
        { tx, principal },
        {
          feedId: claim.feedId,
          claimId: claim.claimId,
          now,
          error,
          phase
        }
      )
    )
    log('WARNING', 'calendar refresh failed', { feed_id: claim.feedId })
  }
}

export async function runWindowDueProject(
  target: Target,
  batchNow: Date,
  deps: Dependencies,
  budget: WorkBudget = { series: SERIES_LIMIT, feeds: FEED_LIMIT }
) {
  const seriesIds = budget.series
    ? await tenant(target, (tx) =>
        listDueNativeWindowSeries(tx, {
          projectId: target.projectId,
          now: batchNow,
          limit: Math.min(SERIES_LIMIT, budget.series)
        })
      )
    : []
  budget.series -= seriesIds.length
  for (const seriesId of seriesIds) {
    const input = { projectId: target.projectId, seriesId, now: deps.now() }
    try {
      await tenant(target, (tx) => extendDueWindowSeries({ tx, principal }, input))
    } catch {
      await tenant(target, (tx) => recordNativeWindowFailure({ tx, principal }, input))
      log('WARNING', 'native window extension failed', { series_id: seriesId })
    }
  }
  const claims = budget.feeds
    ? await tenant(target, (tx) =>
        claimDueIcsFeeds(tx, {
          projectId: target.projectId,
          now: deps.now(),
          limit: Math.min(FEED_LIMIT, budget.feeds),
          includeFiles: true
        })
      )
    : []
  budget.feeds -= claims.length
  for (const claim of claims) await refreshClaimedIcsFeed(claim, deps)
}

export function windowsPart(deps: Dependencies): WorkerPart {
  return {
    owner: 'windows',
    batch: {
      'windows-due': async (now) => {
        const projects = await withSystem('windows-due-projects', (tx) =>
          listWindowDueProjects(tx, { now, limit: PROJECT_LIMIT, stride: BATCH_FEED_LIMIT })
        )
        const budget = { series: BATCH_SERIES_LIMIT, feeds: BATCH_FEED_LIMIT }
        for (const target of projects) await runWindowDueProject(target, now, deps, budget)
      }
    }
  }
}
export const windows = windowsPart({ now: () => new Date(), transport: realCalendarTransport })
