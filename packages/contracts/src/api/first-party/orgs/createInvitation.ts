import { IdempotencyHeaders, ProblemContent as JsonProblem } from '../../common'
import { createRoute } from '../../create-route'
import {
  CreateInvitation,
  IdempotencyMismatch,
  NotFound,
  OrgParams,
  PendingInvitation,
  Unauthorized,
  ValidationFailed
} from './_shared'

export const createInvitation = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/invitations',
  operationId: 'createInvitation',
  tags: ['invitations'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: CreateInvitation } } }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: PendingInvitation } } },
    401: Unauthorized,
    403: { description: 'insufficient-scope or role-not-grantable: the role cannot be granted.', content: JsonProblem },
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: true }
})
