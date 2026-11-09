import { problemResponse, SessionErrors as sessionErrors } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'

export const revokeMyApiKey = createRoute({
  method: 'delete',
  path: '/api/me/api-keys/{id}',
  operationId: 'revokeMyApiKey',
  tags: ['API Keys'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    204: { description: 'The API key was revoked immediately.' },
    ...sessionErrors,
    403: problemResponse('The session cannot revoke API keys.'),
    404: problemResponse('The API key does not exist for this account.')
  },
  x: { owner: 'a-api-keys', statement: 'api_key.create', idempotent: false }
})
