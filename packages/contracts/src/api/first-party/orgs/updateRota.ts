import { createRoute } from '../../create-route'
import { Forbidden, NotFound, OrgParams, Rota, RotaSettings, Unauthorized, ValidationFailed } from './_shared'

export const updateRota = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/rota',
  operationId: 'updateRota',
  tags: ['rota'],
  request: {
    params: OrgParams,
    body: { required: true, content: { 'application/json': { schema: RotaSettings.partial() } } }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Rota } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})
