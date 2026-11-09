import { z } from '@hono/zod-openapi'
import { Instant, Language, LocalDate, Subscriber } from '../../shared'

// NTC-13: an unconfirmed import has no consent yet and receives only its confirmation.
export const ConsentRecord = z.object({ at: Instant, form: z.string(), notice_version: LocalDate, language: Language })

export const SubscriberStatus = z.enum([
  'confirmed',
  'unconfirmed',
  'bounced',
  'complained',
  'suppressed',
  'unsubscribed'
])

export const SubscriberView = Subscriber.extend({
  status: SubscriberStatus,
  suppressed: z.boolean(),
  last_notice_at: Instant.nullable(),
  consent: ConsentRecord.nullable()
})

export const SubscriberInput = Subscriber.pick({
  email: true,
  role: true,
  window_ids: true,
  channels: true,
  language: true
})
