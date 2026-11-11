import { evaluatePublicProject as evaluate } from '@skyclause/contracts/api/v1/public'
import { listPublicCalendarEntries as calendar } from '@skyclause/contracts/api/v1/public'

// Adapt the contract routes to stubApi without duplicating paths or schemas.
export const landingHeroOperations = {
  evaluatePublicProject: {
    method: evaluate.method.toUpperCase(),
    path: evaluate.path,
    request: {
      params: evaluate.request.params,
      body: evaluate.request.body?.content['application/json'].schema
    },
    response: evaluate.responses[200].content['application/json'].schema
  },
  listPublicCalendarEntries: {
    method: calendar.method.toUpperCase(),
    path: calendar.path,
    request: { params: calendar.request.params, query: calendar.request.query },
    response: calendar.responses[200].content['application/json'].schema
  }
}
