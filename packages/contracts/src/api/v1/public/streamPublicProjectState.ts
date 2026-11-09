import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { orgProjectParams, publicStateEventSchema } from './_shared'

export const streamPublicProjectState = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/stream',
  operationId: 'streamPublicProjectState',
  tags: ['Public project'],
  request: {
    params: orgProjectParams,
    headers: z.object({ 'Last-Event-ID': z.string().optional() })
  },
  responses: {
    200: {
      description: 'Public project state version changes as server-sent events.',
      content: { 'text/event-stream': { schema: publicStateEventSchema } }
    },
    404: problemResponse('The public project was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-org-api', statement: 'public', idempotent: false }
})
