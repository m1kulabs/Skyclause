import { ProblemContent as JsonProblem } from '../../common'
import { createRoute } from '../../create-route'
import { Forbidden, NoContent, NotFound, OrgItemParams, Unauthorized } from './_shared'

export const removeMember = createRoute({
  method: 'delete',
  path: '/api/orgs/{org}/members/{id}',
  operationId: 'removeMember',
  tags: ['members'],
  request: { params: OrgItemParams },
  responses: {
    204: NoContent,
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    409: { description: 'last-owner: the last Owner cannot be removed.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
