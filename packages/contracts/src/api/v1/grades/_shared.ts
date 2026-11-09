import { z } from '@hono/zod-openapi'
import { Forecast, Grade, Instant, LocalDate } from '../../shared'
import { CallGradedEventSchema } from '../../../events'

export const GradeView = Grade.extend({
  outcome: CallGradedEventSchema.shape.data.shape.outcome,
  forecast: Forecast.nullable(),
  actual: z.number().nullable(),
  reading_ids: z.array(z.string()),
  graded_at: Instant,
  // #161: the window's start or the night's date in the project's zone; for a pending night, when the file is next due.
  local_date: LocalDate.optional(),
  pending_until: Instant.nullable().optional()
})
