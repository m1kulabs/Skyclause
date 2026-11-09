import { IdempotencyHeaders, SubscriberProblems as CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { TokenParams } from './_shared'

export const createSubscriberFeedback = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/feedback',
  operationId: 'createSubscriberFeedback',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: z.object({ answer: z.boolean() }) } } }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Answer counted without free text',
      content: {
        'application/json': {
          schema: z.object({ window_id: z.string(), answer: z.boolean(), count: z.number().int().positive() })
        }
      }
    }
  },
  x: { owner: 'c-recipient-replies', statement: 'token', idempotent: true }
})
