import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const create = REGISTRY.find((route) => route.operationId === 'createOrganisation')!
const memberships = REGISTRY.find((route) => route.operationId === 'listMyMemberships')!
const update = REGISTRY.find((route) => route.operationId === 'updateOrganisation')!
const projects = REGISTRY.find((route) => route.operationId === 'listProjects')!

// Adapt the OpenAPI registry to apiFetch without duplicating paths or schemas.
export const organisationOperations = {
  createOrganisation: {
    method: 'POST',
    path: create.path,
    request: { body: create.request.body.content['application/json'].schema },
    response: create.responses[201].content['application/json'].schema,
    idempotent: true
  },
  listMyMemberships: {
    method: 'GET',
    path: memberships.path,
    request: { query: memberships.request.query },
    response: memberships.responses[200].content['application/json'].schema
  },
  updateOrganisation: {
    method: 'PATCH',
    path: update.path,
    request: { params: update.request.params, body: update.request.body.content['application/json'].schema },
    response: update.responses[200].content['application/json'].schema
  },
  listProjects: {
    method: 'GET',
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(organisationOperations)
export type OrganisationView = ReturnType<typeof organisationOperations.createOrganisation.response.parse>
export type MembershipSummary = ReturnType<
  typeof organisationOperations.listMyMemberships.response.parse
>['data'][number]
export type ProjectListItem = ReturnType<typeof organisationOperations.listProjects.response.parse>['data'][number]
