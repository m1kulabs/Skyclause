import { IdempotencyHeaders } from '../../common'
import { createRoute } from '../../create-route'
import { OwnershipTransfer } from '../../shared'
import { Forbidden, IdempotencyMismatch, NotFound, OrgParams, Unauthorized, ValidationFailed } from './_shared'

export const createOwnershipTransfer = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/ownership-transfers',
  operationId: 'createOwnershipTransfer',
  tags: ['members'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: OwnershipTransfer.pick({ to_member_id: true }) } }
    }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: OwnershipTransfer } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'members.manage', idempotent: true }
})
