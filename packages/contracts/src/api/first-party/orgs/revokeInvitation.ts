import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const revokeInvitation = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/invitations/{id}',
  operationId: 'revokeInvitation',
  tags: ['invitations'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
