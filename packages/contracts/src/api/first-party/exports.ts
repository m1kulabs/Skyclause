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
    302: { description: 'Redirects to the completed ZIP export.', headers: z.object({ Location: z.url() }) },
    401: problemResponse('A signed-in session is required.'),
    404: problemResponse('The export does not exist for this account or organisation.'),
    409: problemResponse('export-pending: the export is still being prepared.'),
    410: problemResponse('link-expired: the export download has expired.'),
    429: problemResponse('The request is rate limited.'),
    503: problemResponse('Export downloads are not available right now.')
  },
  x: { owner: 'a-data-rights', statement: 'session', idempotent: false }
})

export const routes = [downloadExport] as const
