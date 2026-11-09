import { problemResponse, OrganizationHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant, PageQuery } from '../../shared'
import { usageItemSchema, usageTotalsSchema } from './_shared'

export const getUsage = createRoute({
  method: 'get',
  path: '/v1/usage',
  operationId: 'getUsage',
  tags: ['Usage'],
  request: {
    headers: OrganizationHeaders,
    query: PageQuery
  },
  responses: {
    200: {
      description: 'Paginated AI usage and estimated costs for the organisation.',
      content: {
        'application/json': {
          schema: z.object({
            period_start: Instant,
            period_end: Instant,
            totals: usageTotalsSchema,
            data: z.array(usageItemSchema),
            next_cursor: z.string().nullable()
          })
        }
      }
    },
    400: problemResponse('The organisation header or pagination query is invalid.'),
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The caller lacks project view permission.'),
    404: problemResponse('The organisation was not found.')
  },
  x: { owner: 'e-byok-api', statement: 'project.view', idempotent: false }
})
