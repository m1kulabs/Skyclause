import {
  UuidIdParams as IdParams,
  OrganizationHeaders as OrganizationHeader,
  CommonErrors as commonErrors
} from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { WindowView } from './_shared'

export const cancelWindow = createRoute({
  method: 'delete',
  path: '/v1/windows/{id}',
  operationId: 'cancelWindow',
  tags: ['windows'],
  request: {
    params: IdParams,
    headers: OrganizationHeader,
    query: z.object({ scope: z.enum(['occurrence', 'series']).default('occurrence') })
  },
  responses: {
    200: {
      description: 'The cancelled window and its retained call state',
      content: { 'application/json': { schema: WindowView } }
    },
    ...commonErrors
  },
  x: { owner: 'b-windows-api', statement: 'window.declare', idempotent: false }
})
