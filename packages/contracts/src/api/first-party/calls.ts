import { CommonProblems, IdParams } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'

export const openCall = createRoute({
  method: 'get',
  path: '/api/calls/{id}/open',
  operationId: 'openCall',
  tags: ['calls'],
  request: { params: IdParams },
  responses: {
    ...CommonProblems,
    303: { description: 'Open the call page without changing state', headers: z.object({ Location: z.string() }) }
  },
  x: { owner: 'c-call-page-ui', statement: 'session', idempotent: false }
})

export const routes = [openCall] as const
