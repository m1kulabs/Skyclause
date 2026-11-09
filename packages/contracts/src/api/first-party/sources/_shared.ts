import { z } from '@hono/zod-openapi'

export const ProbationStatus = z.object({
  source_id: z.string(),
  probation: z.boolean(),
  labeller_ids: z.array(z.string()),
  n: z.number().int().nonnegative(),
  obscured_frames: z.number().int().nonnegative(),
  agreement: z.number().min(0).max(1).nullable()
})

export const ProbationLabel = z.object({
  frame_reading_id: z.string(),
  label: z.enum(['landmark_visible', 'obscured'])
})
