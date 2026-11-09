import { ProblemResponse, CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'

export const getVapidPublicKey = createRoute({
  method: 'get',
  path: '/api/push/vapid-public-key',
  operationId: 'getVapidPublicKey',
  tags: ['push'],
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: z.object({ public_key: z.string() }) } } },
    503: { ...ProblemResponse, description: 'Web push has not been configured' }
  },
  x: { owner: 'c-approver-alerts', statement: 'session', idempotent: false }
})
