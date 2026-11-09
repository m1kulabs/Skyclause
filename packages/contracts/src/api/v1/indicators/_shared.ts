import { z } from '@hono/zod-openapi'
import { Forecast, InputValue, Instant, Night, Pack, SourceState } from '../../shared'

export const IndicatorQuery = z.object({ pack: Pack })

export const IndicatorSourceState = SourceState.extend({
  source_id: z.string(),
  age_s: z.number().int().nonnegative().nullable()
})

export const IndicatorNight = z.object({
  night: Night,
  forecast: Forecast.nullable(),
  single_source: z.boolean()
})

export const IndicatorSnapshot = z.object({
  project_id: z.string(),
  pack: Pack,
  t_eval: Instant,
  inputs: z.array(IndicatorSourceState),
  site: z.record(z.string(), InputValue),
  series: z.record(z.string(), z.array(z.tuple([Instant, z.number().nullable(), z.string()]))),
  nights: z.array(IndicatorNight),
  registry_hash: z.string(),
  hash: z.string()
})
