import { createRoute } from '../../create-route'
import { Page, PageQuery } from '../../shared'
import { Forbidden, Member, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const listMembers = createRoute({
  method: 'get',
  path: '/api/orgs/{org}/members',
  operationId: 'listMembers',
  tags: ['members'],
  request: { params: OrgParams, query: PageQuery },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Page(Member) } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
