import { REGISTRY } from '@skyclause/contracts'
import { createApiFetch } from '../../lib/api-fetch'

const preferences = REGISTRY.find((route) => route.operationId === 'getMyPreferences')!
const updatePreferences = REGISTRY.find((route) => route.operationId === 'updateMyPreferences')!
const updateSecurity = REGISTRY.find((route) => route.operationId === 'updateMySecurity')!

export const accountOperations = {
  getMyPreferences: {
    method: preferences.method.toUpperCase(),
    path: preferences.path,
    response: preferences.responses[200].content['application/json'].schema
  },
  updateMyPreferences: {
    method: updatePreferences.method.toUpperCase(),
    path: updatePreferences.path,
    request: { body: updatePreferences.request.body.content['application/json'].schema },
    response: updatePreferences.responses[200].content['application/json'].schema
  },
  updateMySecurity: {
    method: updateSecurity.method.toUpperCase(),
    path: updateSecurity.path,
    request: { body: updateSecurity.request.body.content['application/json'].schema },
    response: updateSecurity.responses[200].content['application/json'].schema
  }
}

// Session cookies are host-only on APP_ORIGIN, so first-party /api calls stay on this document's origin.
export const accountApi = createApiFetch(accountOperations, { baseUrl: '' })
