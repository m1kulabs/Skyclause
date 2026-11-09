import { z } from '@hono/zod-openapi'

export const Me = z.object({
  account_id: z.string().nullable(),
  client: z.enum(['app', 'api', 'cli', 'mcp', 'playground', 'worker']),
  client_name: z.string().nullable(),
  principal_kind: z.enum(['session', 'api_key', 'oauth', 'guest_token', 'share_link', 'device', 'system']),
  organization_id: z.string().nullable(),
  role: z.enum(['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']).nullable(),
  scopes: z.array(z.enum(['read', 'draft', 'admin', 'ingest']))
})
