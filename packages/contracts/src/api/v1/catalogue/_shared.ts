import { z } from '@hono/zod-openapi'
import { Reading, Source } from '../../shared'

export const CatalogueSource = Source.extend({
  latest_reading: Reading.nullable(),
  age_s: z.number().int().nonnegative().nullable()
})
