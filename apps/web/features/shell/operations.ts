import { listMyMemberships as memberships } from '@skyclause/contracts/api/first-party/me'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects'

// Adapt the contract routes to apiFetch and stubApi without duplicating paths or schemas.
export const shellOperations = {
  listMyMemberships: {
    method: memberships.method.toUpperCase(),
    path: memberships.path,
    request: { query: memberships.request.query },
    response: memberships.responses[200].content['application/json'].schema
  },
  listProjects: {
    method: projects.method.toUpperCase(),
    path: projects.path,
    request: { query: projects.request.query },
    response: projects.responses[200].content['application/json'].schema
  }
}
