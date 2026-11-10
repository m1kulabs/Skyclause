import { listMembers, getRota, createRotaShift, updateRotaShift } from '@skyclause/contracts/api/first-party/orgs'
import { archiveProject, restoreProject, updateProject } from '@skyclause/contracts/api/first-party/projects'
import { createShareLink, listShareLinks, revokeShareLink } from '@skyclause/contracts/api/first-party/share-links'
import { getProject, listProjects } from '@skyclause/contracts/api/v1/projects'
import { updateProjectPack } from '@skyclause/contracts/api/v1/packs'
import { createApiFetch } from '../../lib/api-fetch'

function operation<
  const Route extends { method: string; path: string },
  const Request extends { params?: unknown; query?: unknown; body?: unknown },
  const Response extends { parse(value: unknown): unknown }
>(route: Route, request: Request, response: Response, idempotent = false) {
  return {
    method: route.method.toUpperCase(),
    path: route.path,
    request,
    ...(idempotent ? { idempotent: true } : {}),
    response
  }
}

export const projectSettingsOperations = {
  listProjects: operation(
    listProjects,
    { query: listProjects.request.query },
    listProjects.responses[200].content['application/json'].schema
  ),
  getProject: operation(
    getProject,
    { params: getProject.request.params },
    getProject.responses[200].content['application/json'].schema
  ),
  updateProject: operation(
    updateProject,
    {
      params: updateProject.request.params,
      body: updateProject.request.body.content['application/json'].schema
    },
    updateProject.responses[200].content['application/json'].schema
  ),
  archiveProject: operation(
    archiveProject,
    { params: archiveProject.request.params },
    archiveProject.responses[200].content['application/json'].schema
  ),
  restoreProject: operation(
    restoreProject,
    { params: restoreProject.request.params },
    restoreProject.responses[200].content['application/json'].schema
  ),
  updateProjectPack: operation(
    updateProjectPack,
    {
      params: updateProjectPack.request.params,
      body: updateProjectPack.request.body.content['application/json'].schema
    },
    updateProjectPack.responses[200].content['application/json'].schema
  ),
  getRota: operation(
    getRota,
    { params: getRota.request.params },
    getRota.responses[200].content['application/json'].schema
  ),
  listMembers: operation(
    listMembers,
    { params: listMembers.request.params, query: listMembers.request.query },
    listMembers.responses[200].content['application/json'].schema
  ),
  createRotaShift: operation(
    createRotaShift,
    {
      params: createRotaShift.request.params,
      body: createRotaShift.request.body.content['application/json'].schema
    },
    createRotaShift.responses[201].content['application/json'].schema,
    true
  ),
  updateRotaShift: operation(
    updateRotaShift,
    {
      params: updateRotaShift.request.params,
      body: updateRotaShift.request.body.content['application/json'].schema
    },
    updateRotaShift.responses[200].content['application/json'].schema
  ),
  listShareLinks: operation(
    listShareLinks,
    {
      params: listShareLinks.request.params,
      query: listShareLinks.request.query
    },
    listShareLinks.responses[200].content['application/json'].schema
  ),
  createShareLink: operation(
    createShareLink,
    {
      params: createShareLink.request.params,
      body: createShareLink.request.body.content['application/json'].schema
    },
    createShareLink.responses[201].content['application/json'].schema,
    true
  ),
  revokeShareLink: operation(
    revokeShareLink,
    { params: revokeShareLink.request.params },
    revokeShareLink.responses[200].content['application/json'].schema
  )
}

export const projectSettingsApi = createApiFetch(projectSettingsOperations)
export async function resolveProject(org: string, slug: string, signal?: AbortSignal) {
  const page = await projectSettingsApi('listProjects', { org, query: { slug, limit: 200 }, signal })
  const project = page.data.find((item) => item.slug === slug)
  if (!project) throw new Error('Project unavailable')
  return projectSettingsApi('getProject', { org, params: { id: project.id }, signal })
}
export type Project = ReturnType<typeof projectSettingsOperations.getProject.response.parse>
export type Rota = ReturnType<typeof projectSettingsOperations.getRota.response.parse>
export type RotaShift = Rota['shifts'][number]
export type Member = ReturnType<typeof projectSettingsOperations.listMembers.response.parse>['data'][number]
export type ShareLink = ReturnType<typeof projectSettingsOperations.listShareLinks.response.parse>['data'][number]
