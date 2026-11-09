import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { publicCalendarEntrySchema } from './_shared'

export const getPublicWindow = createRoute({
  method: 'get',
  path: '/v1/public/windows/{id}',
  operationId: 'getPublicWindow',
  tags: ['Public calendar'],
  request: { params: z.object({ id: z.string().min(1) }) },
  responses: {
    200: {
      description: 'A published conditions calendar entry without a window title.',
      content: { 'application/json': { schema: publicCalendarEntrySchema } }
    },
    404: problemResponse('The public window was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
