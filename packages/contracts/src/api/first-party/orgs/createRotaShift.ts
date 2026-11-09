import { IdempotencyHeaders } from '../../common'
import { createRoute } from '../../create-route'
import {
  Forbidden,
  IdempotencyMismatch,
  NotFound,
  OrgParams,
  Shift,
  ShiftInput,
  Unauthorized,
  ValidationFailed
} from './_shared'

export const createRotaShift = createRoute({
  method: 'post',
  path: '/api/orgs/{org}/rota/shifts',
  operationId: 'createRotaShift',
  tags: ['rota'],
  request: {
    params: OrgParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: ShiftInput } } }
  },
  responses: {
    201: { description: 'Created.', content: { 'application/json': { schema: Shift } } },
    401: Unauthorized,
    403: Forbidden,
    404: NotFound,
    400: ValidationFailed,
    422: IdempotencyMismatch
  },
  x: { owner: 'a-members-api', statement: 'rota.manage', idempotent: true }
})
