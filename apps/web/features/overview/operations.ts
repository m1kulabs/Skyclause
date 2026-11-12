import { listMyMemberships } from '@skyclause/contracts/api/first-party/me'
import { getProject } from '@skyclause/contracts/api/v1/projects'
import { listProjects } from '@skyclause/contracts/api/v1/projects'
import { streamBundles, listProjectBundles } from '@skyclause/contracts/api/v1/bundles'
import { listProjectDays } from '@skyclause/contracts/api/v1/days'
import { createRun } from '@skyclause/contracts/api/v1/runs'
import { listNights } from '@skyclause/contracts/api/v1/nights'
import { listProjectSources } from '@skyclause/contracts/api/v1/sources'
import { getProjectStrip } from '@skyclause/contracts/api/v1/strip'
import { getProjectVerdicts } from '@skyclause/contracts/api/v1/verdicts'
import { listWindows } from '@skyclause/contracts/api/v1/windows'
import { createApiFetch } from '../../lib/api-fetch'

function operation<
  const Route extends { method: string; path: string },
  const Request extends { params?: unknown; query?: unknown; body?: unknown },
  const Response extends { parse(value: unknown): unknown }
>(route: Route, request: Request, response: Response) {
  return {
    method: route.method.toUpperCase(),
    path: route.path,
    request,
    response
  }
}

export const overviewOperations = {
  listProjects: operation(
    listProjects,
    { query: listProjects.request.query },
    listProjects.responses[200].content['application/json'].schema
  ),
  listMyMemberships: operation(
    listMyMemberships,
    { query: listMyMemberships.request.query },
    listMyMemberships.responses[200].content['application/json'].schema
  ),
  getProject: operation(
    getProject,
    { params: getProject.request.params },
    getProject.responses[200].content['application/json'].schema
  ),
  getProjectStrip: operation(
    getProjectStrip,
    { params: getProjectStrip.request.params },
    getProjectStrip.responses[200].content['application/json'].schema
  ),
  getProjectVerdicts: operation(
    getProjectVerdicts,
    { params: getProjectVerdicts.request.params },
    getProjectVerdicts.responses[200].content['application/json'].schema
  ),
  listProjectSources: operation(
    listProjectSources,
    {
      params: listProjectSources.request.params,
      query: listProjectSources.request.query
    },
    listProjectSources.responses[200].content['application/json'].schema
  ),
  listProjectDays: operation(
    listProjectDays,
    {
      params: listProjectDays.request.params,
      query: listProjectDays.request.query
    },
    listProjectDays.responses[200].content['application/json'].schema
  ),
  listWindows: operation(
    listWindows,
    { params: listWindows.request.params, query: listWindows.request.query },
    listWindows.responses[200].content['application/json'].schema
  ),
  listNights: operation(
    listNights,
    { params: listNights.request.params, query: listNights.request.query },
    listNights.responses[200].content['application/json'].schema
  ),
  listProjectBundles: operation(
    listProjectBundles,
    {
      params: listProjectBundles.request.params,
      query: listProjectBundles.request.query
    },
    listProjectBundles.responses[200].content['application/json'].schema
  ),
  createRun: {
    ...operation(
      createRun,
      { params: createRun.request.params, body: createRun.request.body.content['application/json'].schema },
      createRun.responses[202].content['application/json'].schema
    ),
    idempotent: createRun['x-skyclause'].idempotent
  }
}

export const overviewApi = createApiFetch(overviewOperations)
export const bundleStream = streamBundles
export type ProjectListItem = ReturnType<typeof overviewOperations.listProjects.response.parse>['data'][number]
export type Project = ReturnType<typeof overviewOperations.getProject.response.parse>
export type ProjectStrip = ReturnType<typeof overviewOperations.getProjectStrip.response.parse>
export type ProjectVerdicts = ReturnType<typeof overviewOperations.getProjectVerdicts.response.parse>
export type ProjectSource = ReturnType<typeof overviewOperations.listProjectSources.response.parse>['data'][number]
export type ProjectWindow = ReturnType<typeof overviewOperations.listWindows.response.parse>['data'][number]
export type ProjectDay = ReturnType<typeof overviewOperations.listProjectDays.response.parse>['data'][number]
export type ProjectNight = ReturnType<typeof overviewOperations.listNights.response.parse>['data'][number]
export type ProjectBundle = ReturnType<typeof overviewOperations.listProjectBundles.response.parse>['data'][number]
