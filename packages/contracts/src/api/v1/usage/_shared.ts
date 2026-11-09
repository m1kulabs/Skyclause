import { z } from '@hono/zod-openapi'
import { AiUsage } from '../../shared'

export const usageItemSchema = AiUsage.extend({ estimated_cost_myr: z.number().nonnegative().nullable() })

export const usageTotalsSchema = z.object({
  runs: z.number().int().nonnegative(),
  tokens_in: z.number().int().nonnegative(),
  tokens_out: z.number().int().nonnegative(),
  estimated_cost_myr: z.number().nonnegative().nullable()
})
