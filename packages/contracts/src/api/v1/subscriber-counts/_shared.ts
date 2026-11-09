import { z } from '@hono/zod-openapi'
import { Channel } from '../../shared'

// NTC-13: approvers receive counts, without subscriber addresses or consent records.
export const SubscriberCounts = z.object({
  total: z.number().int().nonnegative(),
  confirmed: z.number().int().nonnegative(),
  unconfirmed: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  complained: z.number().int().nonnegative(),
  unsubscribed: z.number().int().nonnegative(),
  by_window: z.array(z.object({ window_id: z.string(), count: z.number().int().nonnegative() })),
  by_channel: z.array(z.object({ channel: Channel.shape.channel, count: z.number().int().nonnegative() }))
})
