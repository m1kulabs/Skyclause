import { z } from '@hono/zod-openapi'
import { LocalDate } from '../../shared'

export const ProjectDay = z.object({
  date: LocalDate,
  reading_count: z.number().int(),
  error_count: z.number().int(),
  window_count: z.number().int(),
  storm_afternoon: z.object({ wording: z.string(), source_url: z.url() }).nullable().optional()
})
