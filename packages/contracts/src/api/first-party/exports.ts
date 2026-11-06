import { problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'

export const downloadExport = createRoute({
  method: 'get',
  path: '/api/exports/{id}/download',
  operationId: 'downloadExport',
  tags: ['Data Rights'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: 'The completed account export file.',
      headers: z.object({ 'Content-Disposition': z.string() }),
      content: {
        'application/json': { schema: z.record(z.string(), z.unknown()) },
        'text/csv': { schema: z.string() }
      }
    },
    401: problemResponse('A signed-in session is required.'),
    404: problemResponse('The export does not exist for this account.'),
    409: problemResponse('The export is still being prepared.'),
    410: problemResponse('The export download has expired.'),
    429: problemResponse('The request is rate limited.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})

export const routes = [downloadExport] as const
