import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Problem } from '../shared'

const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Problem } }
})

const budgetCounterSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative()
})

const budgetWindowSchema = z.object({ resets_at: Instant })

export const getCommonsBudget = createRoute({
  method: 'get',
  path: '/v1/commons/budget',
  operationId: 'getCommonsBudget',
  tags: ['Commons'],
  responses: {
    200: {
      description: 'Current guest and Commons model budgets.',
      content: {
        'application/json': {
          schema: z.object({
            device: budgetWindowSchema.extend({
              runs: budgetCounterSchema,
              evidence_requests: budgetCounterSchema,
              active_windows: budgetCounterSchema
            }),
            ip: budgetWindowSchema.extend({
              runs: budgetCounterSchema,
              evidence_requests: budgetCounterSchema
            }),
            commons: budgetWindowSchema.extend({ model_tokens: budgetCounterSchema })
          })
        }
      }
    },
    401: problemResponse('A guest session is required.'),
    403: problemResponse('The caller is not a Commons guest.'),
    404: problemResponse('The Commons budget was not found.'),
    429: problemResponse('A guest or Commons budget is exhausted.')
  },
  x: { owner: 'd-guest-rules', statement: 'guest', idempotent: false }
})

export const routes = [getCommonsBudget] as const
