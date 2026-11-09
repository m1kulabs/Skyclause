import { listMyMemberships as memberships } from '@skyclause/contracts/api/first-party/me/listMyMemberships'
import { getMyPreferences as preferences } from '@skyclause/contracts/api/first-party/me/getMyPreferences'
import { updateMyPreferences as updatePreferences } from '@skyclause/contracts/api/first-party/me/updateMyPreferences'
import { listProjects as projects } from '@skyclause/contracts/api/v1/projects/listProjects'

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
  },
  getMyPreferences: {
    method: preferences.method.toUpperCase(),
    path: preferences.path,
    response: preferences.responses[200].content['application/json'].schema.passthrough()
  },
  updateMyPreferences: {
    method: updatePreferences.method.toUpperCase(),
    path: updatePreferences.path,
    // #99's contract needs sidebar_collapsed. Preserve that field at this local seam until it lands.
    request: { body: updatePreferences.request.body.content['application/json'].schema.passthrough() },
    response: updatePreferences.responses[200].content['application/json'].schema.passthrough()
  }
}
