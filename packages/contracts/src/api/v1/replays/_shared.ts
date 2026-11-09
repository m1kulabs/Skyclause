import { z } from '@hono/zod-openapi'
import { Verdicts } from '../../shared'

export const ReplayResult = z.object({
  id: z.uuidv7(),
  label: z.literal('replay'),
  steps: z.array(z.object({ t_eval: z.iso.datetime(), verdicts: Verdicts })),
  summary: z.record(z.string(), z.number())
})
