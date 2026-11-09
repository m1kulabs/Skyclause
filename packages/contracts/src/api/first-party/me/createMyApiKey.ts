import { problemResponse, IdempotencyHeaders as idempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { ApiKey } from '../../shared'
import { apiKeyScopes, validationErrors } from './_shared'

export const createMyApiKey = createRoute({
  method: 'post',
  path: '/api/me/api-keys',
  operationId: 'createMyApiKey',
  tags: ['API Keys'],
  request: {
    headers: idempotencyHeaders,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            scopes: z.array(apiKeyScopes).min(1),
            expires_in_days: z.number().int().min(1).max(365)
          })
        }
      }
    }
  },
  responses: {
    201: {
      description: 'The created API key. The secret is returned only once.',
      content: { 'application/json': { schema: ApiKey.extend({ secret: z.string() }) } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to create an API key.'),
    403: problemResponse('The session cannot create API keys.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: true }
})
