import { CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, Page, PageQuery, Verification } from '../shared'

const ConnectTarget = Verification.shape.target

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

export const listConnectVerifications = createRoute({
  method: 'get',
  path: '/api/connect/verifications',
  operationId: 'listConnectVerifications',
  tags: ['connect'],
  request: { query: PageQuery.extend({ target: ConnectTarget.optional() }) },
  responses: {
    ...CommonProblems,
    200: { description: 'Success', content: { 'application/json': { schema: Page(Verification) } } }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})

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

export const routes = [getConnectConfig, listConnectVerifications, listConnectActivity] as const
