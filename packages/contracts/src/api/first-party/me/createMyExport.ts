import { problemResponse, IdempotencyHeaders as idempotencyHeaders } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { exportFormat, exportSummary, validationErrors } from './_shared'

export const createMyExport = createRoute({
  method: 'post',
  path: '/api/me/exports',
  operationId: 'createMyExport',
  tags: ['Data Rights'],
  request: {
    headers: idempotencyHeaders,
    body: { content: { 'application/json': { schema: z.object({ format: exportFormat }) } } }
  },
  responses: {
    202: { description: 'The account export was queued.', content: { 'application/json': { schema: exportSummary } } },
    ...validationErrors,
    403: problemResponse('The session cannot export account data.'),
    422: problemResponse('The idempotency key was already used with a different request.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: true }
})
