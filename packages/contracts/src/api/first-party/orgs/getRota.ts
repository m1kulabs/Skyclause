import { createRoute } from '../../create-route'
import { Forbidden, NotFound, OrgParams, Rota, Unauthorized } from './_shared'

export const getRota = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/rota',
  operationId: 'getRota',
  tags: ['rota'],
  request: { params: OrgParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Rota } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})
