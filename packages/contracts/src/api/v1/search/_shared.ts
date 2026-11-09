import { z } from '@hono/zod-openapi'

export const searchResultSchema = z.object({
  kind: z.enum(['project', 'source', 'window', 'call']),
  id: z.string(),
  label: z.string(),
  href: z.string(),
  project_id: z.string().nullable(),
  external_id: z.string().nullable()
})
