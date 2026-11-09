import { IdParams, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Window } from '../../shared'

export const decideModerationWindow = createRoute({
  method: 'post',
  path: '/api/admin/moderation/windows/{id}/decide',
  operationId: 'decideModerationWindow',
  tags: ['admin'],
  request: {
    params: IdParams,
    body: {
      required: true,
      content: {
        'application/json': { schema: z.object({ action: z.enum(['restore', 'remove']), reason: z.string().min(1) }) }
      }
    }
  },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Window } } }
  },
  x: { owner: 'd-guest-lifecycle', statement: 'staff', idempotent: false }
})
