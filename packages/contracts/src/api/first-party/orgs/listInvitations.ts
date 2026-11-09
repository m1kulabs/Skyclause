import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, NotFound, OrgParams, PendingInvitation, Unauthorized, ValidationFailed } from './_shared'

export const listInvitations = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/invitations',
  operationId: 'listInvitations',
  tags: ['invitations'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(PendingInvitation) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
