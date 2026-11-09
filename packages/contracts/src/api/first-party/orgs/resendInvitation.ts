import { ProblemContent as JsonProblem } from '../../common'
import { createRoute } from '../../create-route'
import { Forbidden, NotFound, OrgItemParams, PendingInvitation, Unauthorized } from './_shared'

export const resendInvitation = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/invitations/{id}/resend',
  operationId: 'resendInvitation',
  tags: ['invitations'],
  request: { params: OrgItemParams },
  responses: {
    200: { description: 'Success.', content: { 'application/json': { schema: PendingInvitation } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    410: { description: 'invite-withdrawn: the invitation was revoked.', content: JsonProblem }
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: false }
})
