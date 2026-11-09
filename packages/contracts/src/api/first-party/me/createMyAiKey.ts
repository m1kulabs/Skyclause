import { problemResponse, IdempotencyHeaders as idempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { aiKeyWithTestResult, aiProvider, validationErrors } from './_shared'

export const createMyAiKey = createRoute({
  method: 'post',
  path: '/api/me/ai-keys',
  operationId: 'createMyAiKey',
  tags: ['AI Keys'],
  request: {
    headers: idempotencyHeaders,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            provider: aiProvider,
            key: z.string().min(1),
            model: z.string().min(1),
            enabled: z.boolean(),
            declared_tier: z.string().min(1)
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'The created AI key metadata. The saved secret is never returned.',
      content: { 'application/json': { schema: aiKeyWithTestResult } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to create an AI key.'),
    403: problemResponse('Personal AI keys are not enabled for this account or organisation.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'e-byok-api', statement: 'session', idempotent: true }
})
