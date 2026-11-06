import { problemResponse } from '../common'
import { z } from '@hono/zod-openapi'
import { createRoute } from '../create-route'

const Me = z.object({
  account_id: z.string().nullable(),
  client: z.enum(['app', 'api', 'cli', 'mcp', 'playground', 'worker']),
  client_name: z.string().nullable(),
  principal_kind: z.enum(['session', 'api_key', 'oauth', 'guest_token', 'share_link', 'device', 'system']),
  organization_id: z.string().nullable(),
  role: z.enum(['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']).nullable(),
  scopes: z.array(z.enum(['read', 'draft', 'admin', 'ingest']))
})

export const getMe = createRoute({
  method: 'get',
  path: '/v1/me',
  operationId: 'getMe',
  tags: ['Identity'],
  responses: {
    200: { description: 'Current principal', content: { 'application/json': { schema: Me } } },
    401: problemResponse('Authentication is required.'),
    403: problemResponse('The principal cannot access this operation.')
  },
  x: { owner: 'e-cli-core', statement: 'any', idempotent: false }
})

export const routes = [getMe] as const
