import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const deleteRotaShift = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/rota/shifts/{id}',
  operationId: 'deleteRotaShift',
  tags: ['rota'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: false }
})
