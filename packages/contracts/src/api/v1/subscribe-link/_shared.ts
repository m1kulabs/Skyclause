import { z } from '@hono/zod-openapi'

export const SubscribeLink = z.object({ id: z.string(), project_id: z.string(), url: z.url() })
