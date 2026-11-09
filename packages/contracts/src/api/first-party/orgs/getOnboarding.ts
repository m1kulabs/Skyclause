import { createRoute } from '../../create-route'
import { Forbidden, NotFound, Onboarding, OrgParams, Unauthorized } from './_shared'

export const getOnboarding = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/onboarding',
  operationId: 'getOnboarding',
  tags: ['onboarding'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Onboarding } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'b-create-project-ui', statement: 'session', idempotent: false }
})
