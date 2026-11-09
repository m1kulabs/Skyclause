import {
  UuidIdParams as IdParams,
  IdempotentOrganizationHeaders as IdempotentHeaders,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { createRoute } from '../../create-route'
import { WindowFields, WindowView } from './_shared'

export const createWindow = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/windows',
  operationId: 'createWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: IdempotentHeaders,
    body: { content: { 'application/json': { schema: WindowFields } } }
  },
  responses: {
    201: { description: 'A declared window', content: { 'application/json': { schema: WindowView } } },
    ...commonErrors,
    422: problemResponse('The window times or recurrence are invalid')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: true }
})
