import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant } from '../../shared'
import { validationErrors } from './_shared'

export const deleteMyAccount = createRoute({
  method: 'post',
  path: '/api/me/deletion',
  operationId: 'deleteMyAccount',
  tags: ['Data Rights'],
  request: {
    body: { content: { 'application/json': { schema: z.object({ typed_name: z.literal('delete account') }) } } }
  },
  responses: {
    202: {
      description: 'The account deletion was accepted.',
      content: { 'application/json': { schema: z.object({ deleted_at: Instant }) } }
    },
    ...validationErrors,
    409: problemResponse('The account must keep a sign-in method until deletion is confirmed.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})
