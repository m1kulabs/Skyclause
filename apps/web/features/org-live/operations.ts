import { streamOrganisationEvents } from '@skyclause/contracts/api/v1/events'
import { getBundle } from '@skyclause/contracts/api/v1/bundles'
import { getProject } from '@skyclause/contracts/api/v1/projects'
import { listProjectSources } from '@skyclause/contracts/api/v1/sources'
import { createApiFetch } from '../../lib/api-fetch'

export const orgEventStream = streamOrganisationEvents

export const orgLiveOperations = {
  getBundle: {
    method: getBundle.method.toUpperCase(),
    path: getBundle.path,
    request: { params: getBundle.request.params },
    response: getBundle.responses[200].content['application/json'].schema
  },
  getProject: {
    method: getProject.method.toUpperCase(),
    path: getProject.path,
    request: { params: getProject.request.params },
    response: getProject.responses[200].content['application/json'].schema
  },
  listProjectSources: {
    method: listProjectSources.method.toUpperCase(),
    path: listProjectSources.path,
    request: { params: listProjectSources.request.params, query: listProjectSources.request.query },
    response: listProjectSources.responses[200].content['application/json'].schema
  }
}

export const apiFetch = createApiFetch(orgLiveOperations)
