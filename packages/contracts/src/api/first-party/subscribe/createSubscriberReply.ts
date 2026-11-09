import { IdempotencyHeaders, SubscriberProblems as CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant } from '../../shared'
import { CrowdReply, TokenParams } from './_shared'

export const createSubscriberReply = createRoute({
  method: 'post',
  path: '/api/subscribe/{token}/reply',
  operationId: 'createSubscriberReply',
  tags: ['subscribe'],
  request: {
    params: TokenParams,
    headers: IdempotencyHeaders,
    body: { required: true, content: { 'application/json': { schema: CrowdReply } } }
  },
  responses: {
    ...CommonProblems,
    201: {
      description: 'Reply recorded in the ledger',
      content: {
        'application/json': {
          schema: z.object({ id: z.string(), window_id: z.string(), reply: CrowdReply, at: Instant })
        }
      }
    }
  },
  x: { owner: 'c-recipient-replies', statement: 'token', idempotent: true }
})
