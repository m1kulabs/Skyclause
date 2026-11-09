import { z } from '@hono/zod-openapi'
import { Instant, Language, LocalDate, Subscriber } from '../../shared'

export const TokenParams = z.object({ token: z.string() })

export const SubscriberFields = Subscriber.pick({
  email: true,
  role: true,
  window_ids: true,
  channels: true,
  language: true
})

export const SubscriberPatch = SubscriberFields.partial()

export const ConsentRecord = z.object({ at: Instant, form: z.string(), notice_version: LocalDate, language: Language })

export const DeliveryRecord = z.object({
  id: z.string(),
  call_id: z.string().nullable(),
  language: Language,
  status: z.enum(['queued', 'sent', 'delivered', 'bounced', 'complained', 'suppressed', 'failed', 'expired']),
  accepted_at: Instant.nullable()
})

export const SubscriberData = z.object({
  subscriber: Subscriber,
  consent_records: z.array(ConsentRecord),
  delivery_history: z.array(DeliveryRecord)
})

export const CrowdReply = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keep') }),
  z.object({ kind: z.literal('shift'), shift_to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  z.object({ kind: z.literal('shuttle') })
])
