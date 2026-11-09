import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'

export const deleteMyAiKey = createRoute({
  method: 'delete',
  path: '/api/me/ai-keys/{id}',
  operationId: 'deleteMyAiKey',
  tags: ['AI Keys'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    204: { description: 'The personal AI key was deleted.' },
    ...sessionErrors,
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    404: problemResponse('The AI key does not exist for this account.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: false }
})
