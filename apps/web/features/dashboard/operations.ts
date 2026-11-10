import {
  listMyMemberships as memberships,
  getMyPreferences,
  updateMyPreferences
} from '@skyclause/contracts/api/first-party/me'
import { getBundle } from '@skyclause/contracts/api/v1/bundles'
import { getCall } from '@skyclause/contracts/api/v1/calls'
import { getDashboard } from '@skyclause/contracts/api/v1/dashboard'
import { listProjects } from '@skyclause/contracts/api/v1/projects'
import { searchOrganisation } from '@skyclause/contracts/api/v1/search'
import { getProjectStrip } from '@skyclause/contracts/api/v1/strip'
import { createApiFetch } from '../../lib/api-fetch'
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
export type DashboardMembership = ReturnType<
  typeof dashboardOperations.listMyMemberships.response.parse
>['data'][number]

export interface DashboardRead {
  dashboard: Dashboard
  projects: DashboardProject[]
  bundles: Array<{ summary: DashboardReview; detail: DashboardBundle }>
  firstCall: DashboardCall | null
  strip: DashboardStrip | null
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

  const [dashboard, projects] = await Promise.all([
    dashboardApi('getDashboard', { org, headers: forwarded, signal, cache: 'no-store' }),
    allPages((cursor) =>
      dashboardApi('listProjects', {
        org,
        headers: forwarded,
        query: { limit: 200, cursor },
        signal,
        cache: 'no-store'
      })
    )
  ])
  const summaries = sortNeedsReviewBySla(dashboard.needs_review.data)
  const details = await Promise.all(
    summaries.map((summary) =>
      dashboardApi('getBundle', { org, headers: forwarded, params: { id: summary.id }, signal, cache: 'no-store' })
    )
  )
  const bundles = summaries.map((summary, index) => ({ summary, detail: details[index]! }))
  const firstBundle = bundles[0]
  const lead = firstBundle?.detail.calls.find((call) => call.window_id) ?? firstBundle?.detail.calls[0]
  const [firstCall, strip] = firstBundle
    ? await Promise.all([
        lead
          ? dashboardApi('getCall', { org, headers: forwarded, params: { id: lead.id }, signal, cache: 'no-store' })
          : Promise.resolve(null),
        dashboardApi('getProjectStrip', {
          org,
          headers: forwarded,
          params: { id: firstBundle.detail.project_id },
          signal,
          cache: 'no-store'
        })
      ])
    : [null, null]

  return { dashboard, projects, bundles, firstCall, strip }
}
