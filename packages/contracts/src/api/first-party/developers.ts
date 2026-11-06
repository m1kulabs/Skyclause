import { CommonProblems, IdempotencyHeaders } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant } from '../shared'

export const createDeveloperGuestToken = createRoute({
  method: 'post',
  path: '/api/developers/guest-token',
  operationId: 'createDeveloperGuestToken',
  tags: ['developers'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ scopes: z.array(z.enum(['read', 'draft'])).min(1) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Guest token created with the issuing session budgets',
      content: {
        'application/json': {
          schema: z.object({ token: z.string(), scopes: z.array(z.enum(['read', 'draft'])), expires_at: Instant })
        }
      }
    }
  },
  x: { owner: 'e-console-api', statement: 'guest', idempotent: true }
})

export const routes = [createDeveloperGuestToken] as const
