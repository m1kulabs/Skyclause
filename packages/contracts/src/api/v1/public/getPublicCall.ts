import { problemResponse } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { publicCallSchema } from './_shared'

export const getPublicCall = createRoute({
  method: 'get',
  path: '/v1/public/calls/{callId}',
  operationId: 'getPublicCall',
  tags: ['Public calls'],
  request: { params: z.object({ callId: z.string().min(1) }) },
  responses: {
    200: {
      description: 'A public call without recipient or approver identity data.',
      content: { 'application/json': { schema: publicCallSchema } }
    },
    404: problemResponse('The public call was not found.'),
    429: problemResponse('The public request rate limit was exceeded.')
  },
  x: { owner: 'd-public-api', statement: 'public', idempotent: false }
})
