import { z } from '@hono/zod-openapi'
import { InputValue, Instant, Night, PackState, Verdicts, Window } from '../../shared'

export const ProjectStrip = z.object({
  project_id: z.string(),
  range: z.object({ from: Instant, to: Instant }),
  window: Window.nullable(),
  series: z.record(z.string(), z.array(z.tuple([Instant, z.number().nullable(), z.string()]))),
  inputs: z.array(InputValue),
  packs: z.array(PackState),
  verdicts: z.array(Verdicts),
  nights: z.array(Night)
})
