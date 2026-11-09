import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  problemResponse,
  CommonErrors as commonErrors
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { WindowFields, WindowView } from './_shared'

export const updateWindow = createRoute({
  method: 'patch',
  path: '/v1/windows/{id}',
  operationId: 'updateWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    query: z.object({ scope: z.enum(['occurrence', 'series']).default('occurrence') }),
    body: { content: { 'application/json': { schema: WindowFields.partial() } } }
  },
  responses: {
    200: { description: 'The updated window', content: { 'application/json': { schema: WindowView } } },
    ...commonErrors,
    422: problemResponse('The window times or recurrence are invalid')
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})
