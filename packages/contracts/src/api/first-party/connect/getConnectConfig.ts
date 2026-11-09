import { CommonProblems } from '../../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../../create-route'
import { ConnectTarget } from './_shared'

export const getConnectConfig = createRoute({
  method: 'get',
  path: '/api/connect/config',
  operationId: 'getConnectConfig',
  tags: ['connect'],
  request: { query: z.object({ target: ConnectTarget, transport: z.enum(['remote', 'stdio']) }) },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: z.object({
            target: ConnectTarget,
            transport: z.enum(['remote', 'stdio']),
            config: z.string(),
            tools: z.array(
              z.object({ name: z.string(), description: z.string(), scopes: z.array(z.enum(['read', 'draft'])) })
            )
          })
        }
      }
    }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})
