import { z } from '@hono/zod-openapi'
import { Instant } from '../../shared'

export const budgetCounterSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative()
})

export const budgetWindowSchema = z.object({ resets_at: Instant })
