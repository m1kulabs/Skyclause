import { createRoute } from '../../create-route'
import { Forbidden, NotFound, OrgItemParams, Shift, ShiftInput, Unauthorized, ValidationFailed } from './_shared'

export const updateRotaShift = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/rota/shifts/{id}',
  operationId: 'updateRotaShift',
  tags: ['rota'],
  request: {
    params: OrgItemParams,
    body: { required: true, content: { 'application/json': { schema: ShiftInput.partial() } } }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Shift } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})
