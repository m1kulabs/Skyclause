import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { validationErrors } from './_shared'

export const updateMySecurity = createRoute({
  method: 'patch',
  path: '/api/me/security',
  operationId: 'updateMySecurity',
  tags: ['Security'],
  request: { body: { content: { 'application/json': { schema: z.object({ magic_link_enabled: z.boolean() }) } } } },
  responses: {
    200: {
      description: 'The updated account security setting.',
      content: { 'application/json': { schema: z.object({ magic_link_enabled: z.boolean() }) } }
    },
    ...validationErrors,
    401: problemResponse('Recent authentication is required to change account security settings.'),
    409: problemResponse('The change would remove the last sign-in method.')
  },
  x: { owner: 'a-account-settings', statement: 'session', idempotent: false }
})
