import { z } from '@hono/zod-openapi'
import { CallState, Instant, LocalDate, Mode, Window as WindowSchema } from '../../shared'

export const Recurrence = z.object({
  frequency: z.literal('weekly'),
  days_of_week: z.array(z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).min(1),
  until: LocalDate.optional(),
  count: z.number().int().positive().optional(),
  skip_dates: z.array(LocalDate)
})

export const WindowFields = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['class', 'event', 'commute_wave']),
  starts_at: Instant,
  ends_at: Instant,
  tz: z.string().min(1),
  recurrence: Recurrence.optional()
})

export const WindowCallSummary = z.object({
  id: z.uuidv7(),
  bundle_id: z.uuidv7(),
  state: CallState,
  mode: Mode.nullable()
})

export const WindowView = WindowSchema.extend({
  recurrence: Recurrence.nullable().optional(),
  latest_calls: z.object({ sky: WindowCallSummary.nullable(), crowd: WindowCallSummary.nullable() })
})

export const WindowReport = z.object({
  window_id: z.uuidv7(),
  report_count: z.number().int().positive(),
  moderation: z.enum(['visible', 'hidden_pending_review', 'removed'])
})
