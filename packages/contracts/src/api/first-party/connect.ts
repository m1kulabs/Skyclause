import { CommonProblems } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'
import { Instant, LocalDate, Page, PageQuery, Verification } from '../shared'

const ConnectTarget = Verification.shape.target

export const getConnectConfig = createRoute({
  method: 'get',
  path: '/api/connect/config',
  operationId: 'getConnectConfig',
  tags: ['connect'],
  request: { query: z.object({ target: ConnectTarget, transport: z.enum(['remote', 'stdio']).optional() }) },
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
            variants: z
              .array(
                z.object({
                  transport: z.enum(['http', 'stdio']),
                  config: z.string(),
                  docs_url: z.url(),
                  checked_at: LocalDate
                })
              )
              .optional(),
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
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: Page(Verification).extend({
            targets: z
              .array(
                z.object({
                  target: ConnectTarget,
                  status: z.enum(['verified', 'reverify_due', 'not_verified']),
                  tested_at: Instant.nullable(),
                  client_version: z.string().nullable()
                })
              )
              .optional(),
            verified_count: z.number().int().nonnegative().optional()
          })
        }
      }
    }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})

export const listConnectActivity = createRoute({
  method: 'get',
  path: '/api/connect/activity',
  operationId: 'listConnectActivity',
  tags: ['connect'],
  request: { query: PageQuery.extend({ since: Instant }) },
  responses: {
    ...CommonProblems,
    200: {
      description: 'Success',
      content: {
        'application/json': {
          schema: Page(z.object({ at: Instant, tool: z.string(), client_name: z.string().nullable() })).extend({
            first: z.object({ at: Instant, tool: z.string(), client_name: z.string().nullable() }).nullable().optional()
          })
        }
      }
    }
  },
  x: { owner: 'e-connect-api', statement: 'session', idempotent: false }
})

export const routes = [getConnectConfig, listConnectVerifications, listConnectActivity] as const
