import {
  UuidIdParams as IdParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { WindowReport } from './_shared'

export const createWindowReport = createRoute({
  method: 'post',
  path: '/v1/windows/{id}/reports',
  operationId: 'createWindowReport',
  tags: ['windows'],
  request: { params: IdParams, headers: IdempotentHeaders },
  responses: {
    201: {
      description: 'A guest report and current moderation count',
      content: { 'application/json': { schema: WindowReport } }
    },
    ...commonErrors,
    422: problemResponse('This window cannot be reported')
  },
  x: { owner: 'd-guest-lifecycle', statement: 'guest', idempotent: true }
})
