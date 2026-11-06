import { GuestProblems as CommonProblems, IdempotencyHeaders } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'

export const createGuest = createRoute({
  method: 'post',
  path: '/api/guest',
  operationId: 'createGuest',
  tags: ['guest'],
  request: {
    headers: IdempotencyHeaders,
    body: {
      required: true,
      content: { 'application/x-www-form-urlencoded': { schema: z.object({ turnstile_token: z.string().min(1) }) } }
    }
  },
  responses: {
    ...CommonProblems,
    303: {
      description: 'Anonymous session created; open the Commons',
      headers: z.object({ Location: z.literal('/commons/bukit-jalil') })
    }
  },
  x: { owner: 'd-guest-entry', statement: 'public', idempotent: true }
})

export const routes = [createGuest] as const
