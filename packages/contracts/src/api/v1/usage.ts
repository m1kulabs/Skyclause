import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { AiUsage, Instant, PageQuery, Problem } from '../shared'

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

const usageItemSchema = AiUsage.extend({ estimated_cost_myr: z.number().nonnegative().nullable() })

const usageTotalsSchema = z.object({
  runs: z.number().int().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  estimated_cost_myr: z.number().nonnegative().nullable()
})

export const getUsage = createRoute({
  method: 'get',
  path: '/v1/usage',
  operationId: 'getUsage',
  tags: ['Usage'],
  request: {
    headers: z.object({ 'Skyclause-Organization': z.string().min(1) }),
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

export const routes = [getUsage] as const
