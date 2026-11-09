import { z } from '@hono/zod-openapi'

export const ListingBody = z.object({ source_url: z.url() })
