import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant } from '../../shared'

export const testMyAiKey = createRoute({
  method: 'post',
  path: '/api/me/ai-keys/{id}/test',
  operationId: 'testMyAiKey',
  tags: ['AI Keys'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: 'The key passed a minimal provider request.',
      content: {
        'application/json': { schema: z.object({ key_id: z.string(), model: z.string(), tested_at: Instant }) }
      }
    },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    404: problemResponse('The AI key does not exist for this account.'),
    422: problemResponse('The provider rejected the saved key.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})
