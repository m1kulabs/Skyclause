import { Forecast, Night } from '../../shared'
import { z } from '@hono/zod-openapi'

export const NightView = Night.extend({
  forecast: Forecast.nullable(),
  show_name: z.string().optional(),
  source_url: z.url().optional()
})
