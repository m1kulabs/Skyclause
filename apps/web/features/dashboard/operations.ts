import {
  listMyMemberships as memberships,
  getMyPreferences,
  updateMyPreferences
} from '@skyclause/contracts/api/first-party/me'
import { getBundle, listProjectBundles } from '@skyclause/contracts/api/v1/bundles'
import { getCall } from '@skyclause/contracts/api/v1/calls'
import { getDashboard } from '@skyclause/contracts/api/v1/dashboard'
import { listProjectDays } from '@skyclause/contracts/api/v1/days'
import { listGrades } from '@skyclause/contracts/api/v1/grades'
import { listNights } from '@skyclause/contracts/api/v1/nights'
import { listProjects } from '@skyclause/contracts/api/v1/projects'
import { searchOrganisation } from '@skyclause/contracts/api/v1/search'
import { listProjectSources } from '@skyclause/contracts/api/v1/sources'
import { getProjectStrip } from '@skyclause/contracts/api/v1/strip'
import { listWindows } from '@skyclause/contracts/api/v1/windows'
import { ApiProblem, createApiFetch } from '../../lib/api-fetch'
import { composeDashboard, dashboardBlocks, type DashboardBlocks } from './compose'
import { sortNeedsReviewBySla } from './model'

type JsonSchema<Route> = Route extends {
  responses: { 200: { content: { 'application/json': { schema: infer Schema } } } }
}
  ? Schema
  : never
type RouteLike = {
  method: string
  path: string
  responses: { 200: { content: { 'application/json': { schema: { parse(value: unknown): unknown } } } } }
}
type ApiRequest = { params?: unknown; query?: unknown; body?: unknown }

function operation<const Route extends RouteLike, const Request extends ApiRequest>(
  route: Route,
  request: Request
): {
  method: string
  path: Route['path']
  request: Request
  response: JsonSchema<Route>
} {
  return {
    method: route.method.toUpperCase(),
    path: route.path,
    request,
    response: route.responses[200].content['application/json'].schema as JsonSchema<Route>
  }
}

export const dashboardOperations = {
  getDashboard: operation(getDashboard, {}),
  listProjects: operation(listProjects, { query: listProjects.request.query }),
  getBundle: operation(getBundle, { params: getBundle.request.params }),
  getCall: operation(getCall, { params: getCall.request.params }),
  getProjectStrip: operation(getProjectStrip, { params: getProjectStrip.request.params }),
  // While getDashboard is not built (501), the dashboard is composed from these per-project reads.
  listProjectBundles: operation(listProjectBundles, {
    params: listProjectBundles.request.params,
    query: listProjectBundles.request.query
  }),
  listWindows: operation(listWindows, { params: listWindows.request.params, query: listWindows.request.query }),
  listProjectSources: operation(listProjectSources, {
    params: listProjectSources.request.params,
    query: listProjectSources.request.query
  }),
  listProjectDays: operation(listProjectDays, {
    params: listProjectDays.request.params,
    query: listProjectDays.request.query
  }),
  listNights: operation(listNights, { params: listNights.request.params, query: listNights.request.query }),
  listGrades: operation(listGrades, { params: listGrades.request.params, query: listGrades.request.query }),
  searchOrganisation: operation(searchOrganisation, { query: searchOrganisation.request.query }),
  listMyMemberships: operation(memberships, { query: memberships.request.query }),
  getMyPreferences: operation(getMyPreferences, {}),
  updateMyPreferences: {
    method: updateMyPreferences.method.toUpperCase(),
    path: updateMyPreferences.path,
    request: { body: updateMyPreferences.request.body.content['application/json'].schema },
    response: updateMyPreferences.responses[200].content['application/json'].schema
  }
}

const firstPartyOperations = {
  listMyMemberships: dashboardOperations.listMyMemberships,
  getMyPreferences: dashboardOperations.getMyPreferences,
  updateMyPreferences: dashboardOperations.updateMyPreferences
}

export const dashboardApi = createApiFetch(dashboardOperations)
export const paletteMemberApi = createApiFetch(firstPartyOperations, { organization: false })
export const paletteProjectApi = createApiFetch({ listProjects: dashboardOperations.listProjects })
export const paletteSearchApi = createApiFetch({ searchOrganisation: dashboardOperations.searchOrganisation })

export type Dashboard = ReturnType<typeof dashboardOperations.getDashboard.response.parse>
export type DashboardProject = ReturnType<typeof dashboardOperations.listProjects.response.parse>['data'][number]
export type DashboardBundle = ReturnType<typeof dashboardOperations.getBundle.response.parse>
export type DashboardCall = ReturnType<typeof dashboardOperations.getCall.response.parse>
export type DashboardStrip = ReturnType<typeof dashboardOperations.getProjectStrip.response.parse>
export type DashboardReview = Dashboard['needs_review']['data'][number]
type ListItem<Operation extends keyof typeof dashboardOperations> =
  ReturnType<(typeof dashboardOperations)[Operation]['response']['parse']> extends { data: Array<infer Item> }
    ? Item
    : never
export type DashboardWindow = ListItem<'listWindows'>
export type DashboardSource = ListItem<'listProjectSources'>
export type DashboardDay = ListItem<'listProjectDays'>
export type DashboardNight = ListItem<'listNights'>
export type DashboardGrade = ListItem<'listGrades'>
export type DashboardMembership = ReturnType<
  typeof dashboardOperations.listMyMemberships.response.parse
>['data'][number]

export interface DashboardRead extends DashboardBlocks {
  /** Every live project in the organisation, for names and the first project's links. */
  projects: DashboardProject[]
  /**
   * How many of those projects the blocks cover: all of them when getDashboard answers; while it is not built, the
   * most recently active few, said on screen when there are more.
   */
  covered: number
  /** What today's window states come from: getDashboard's engine verdicts, or each window's latest call. */
  windowsBasis: 'engine_verdict' | 'latest_call'
  firstCall: DashboardCall | null
  strip: DashboardStrip | null
  /** When the read landed: the countdowns and the strip's "now" count from it, the same on the server and client. */
  readAt: string
}

export async function allPages<Item>(
  read: (cursor?: string) => Promise<{ data: Item[]; next_cursor: string | null }>
): Promise<Item[]> {
  const items: Item[] = []
  const seen = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    items.push(...page.data)
    cursor = page.next_cursor ?? undefined
    if (cursor && seen.has(cursor)) throw new Error('Repeated dashboard cursor')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return items
}

/** A read the page can do without: null when it fails, so the block it decorates still renders. */
const optional = <Value>(read: Promise<Value>): Promise<Value | null> => read.catch(() => null)

/**
 * The organisation dashboard: getDashboard when it answers; while it is not built (501), composed from the reads that
 * are (`composeDashboard`). Any other failure of getDashboard, or of the projects list, fails the page.
 */
export async function readDashboard(
  org: string,
  requestHeaders = new Headers(),
  signal?: AbortSignal
): Promise<DashboardRead> {
  const forwarded = new Headers()
  for (const name of ['cookie', 'authorization']) {
    const value = requestHeaders.get(name)
    if (value) forwarded.set(name, value)
  }
  const common = { org, headers: forwarded, signal, cache: 'no-store' as const }

  const [dashboard, projects] = await Promise.all([
    dashboardApi('getDashboard', common).catch((error: unknown) => {
      if (error instanceof ApiProblem && error.status === 501) return null
      throw error
    }),
    allPages((cursor) => dashboardApi('listProjects', { ...common, query: { limit: 200, cursor, include: 'summary' } }))
  ])
  const live = projects.filter((project) => !project.archived_at)

  let blocks: DashboardBlocks
  let covered = live.length
  if (dashboard) {
    const summaries = sortNeedsReviewBySla(dashboard.needs_review.data)
    const details = await Promise.all(
      summaries.map((summary) => dashboardApi('getBundle', { ...common, params: { id: summary.id } }))
    )
    blocks = dashboardBlocks(
      dashboard,
      summaries.map((summary, index) => ({ summary, detail: details[index]! }))
    )
  } else {
    const composed = await composeDashboard(dashboardApi, {
      org,
      projects: live,
      headers: forwarded,
      signal,
      now: new Date()
    })
    blocks = composed.blocks
    covered = composed.shown.length
  }

  const firstBundle = blocks.needs_review.ok ? blocks.needs_review.data[0] : undefined
  const lead = firstBundle?.detail.calls.find((call) => call.window_id) ?? firstBundle?.detail.calls[0]
  const [firstCall, strip] = firstBundle
    ? await Promise.all([
        lead ? optional(dashboardApi('getCall', { ...common, params: { id: lead.id } })) : Promise.resolve(null),
        optional(dashboardApi('getProjectStrip', { ...common, params: { id: firstBundle.detail.project_id } }))
      ])
    : [null, null]

  return {
    ...blocks,
    projects: live,
    covered,
    windowsBasis: dashboard ? 'engine_verdict' : 'latest_call',
    firstCall,
    strip,
    readAt: new Date().toISOString()
  }
}
