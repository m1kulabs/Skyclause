import { ProblemContent as JsonProblem } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Membership } from '../../shared'
import { AssignableRole, Member, NotFound, OrgItemParams, Unauthorized, ValidationFailed } from './_shared'

export const updateMember = createRoute({
  method: 'patch',
  path: '/api/orgs/{org}/members/{id}',
  operationId: 'updateMember',
  tags: ['members'],
  request: {
    params: OrgItemParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z
            .object({ role: AssignableRole.optional(), reads_malay: Membership.shape.reads_malay.optional() })
            .strict()
        }
      }
    }
  },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: Member } } },
    401: Unauthorized,
    403: {
      description: 'insufficient-scope or role-not-grantable: the role cannot be assigned by this session.',
      content: JsonProblem
    },
    404: NotFound,
    400: ValidationFailed,
    409: { description: 'last-owner: the organisation must retain an Owner.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
