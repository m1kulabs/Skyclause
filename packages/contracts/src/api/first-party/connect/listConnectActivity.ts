import { CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { Instant, Page, PageQuery } from '../../shared'

export const listConnectActivity = createRoute({
  method: 'get',
  path: '/api/connect/activity',
  operationId: 'listConnectActivity',
  tags: ['connect'],
  request: { query: PageQuery },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: Page(z.object({ at: Instant, tool: z.string(), client_name: z.string().nullable() }))
        }
      }
    }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})
