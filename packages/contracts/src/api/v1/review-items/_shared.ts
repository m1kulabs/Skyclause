import { z } from '@hono/zod-openapi'
import { Grade, Instant, ReviewItem } from '../../shared'

// #161: why a grade needs a person (ANL-2, ANL-4; TRD grading).
export const ReviewReason = z.enum([
  'miss',
  'false_alarm',
  'expired_above_normal',
  'out_of_band',
  'unlisted_surge',
  'no_call'
])

// #161: the item's reasons, who explained it and when, and when it opened.
export const ReviewItemView = ReviewItem.extend({
  grade: Grade,
  reasons: z.array(ReviewReason).optional(),
  explained_by: z.string().nullable().optional(),
  explained_at: Instant.nullable().optional(),
  opened_at: Instant.optional()
})

// ANL-2: explanations are editable; the shared record leaves state values to the owning ticket.
export const ReviewItemPatch = ReviewItem.pick({ state: true, explanation: true })
  .partial()
  .refine((value) => value.state !== undefined || value.explanation !== undefined, {
    message: 'Provide a state or explanation'
  })
