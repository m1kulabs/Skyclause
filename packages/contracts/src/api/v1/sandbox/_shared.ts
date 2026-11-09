import { z } from '@hono/zod-openapi'

export const typeErrorSchema = z.object({ path: z.array(z.string()), message: z.string() })
