import { z } from '@hono/zod-openapi'
import { InputValue, Instant, Pack, Run } from '../../shared'

export const CreateRunBody = z.object({ pack: Pack, window_ids: z.array(z.uuidv7()).optional() })

// #151 (optional, getRun only): when it was triggered, the bundle it drafted, and its trace: CAL-5's line for an
// all-Normal run ("Normal; N inputs fresh", with each fresh input and its age) or its outcome, and each step.
export const RunDetail = Run.extend({
  triggered_at: Instant.optional(),
  bundle_id: z.string().nullable().optional(),
  trace: z
    .object({
      text: z.string(),
      inputs: z.array(InputValue),
      steps: z.array(
        z.object({ step: z.string(), status: z.string(), started_at: Instant, finished_at: Instant.nullable() })
      )
    })
    .optional()
})
