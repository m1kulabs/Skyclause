// #158 c-sender-email: delivery status (NTC-10), from Resend's webhooks (#656). The worker's `POST /resend/webhook`
// checks each call's signature, then hands these event types here; the notices part applies what changes a notice.
// Addresses never reach the logs.
import type { ResendWebhook } from './resend-webhook'

/** A notice-changing delivery event: a delivery, a hard bounce or a complaint, for every recipient named. */
export interface DeliveryEvent {
  type: 'delivery' | 'bounce' | 'complaint'
  /** Resend's email ID, which `EmailTransport.send` returned as `providerMessageId`. */
  providerMessageId: string
  /** The `category` tag the transport set (a notice kind for an outbox send), or null. */
  category: string | null
  recipients: string[]
}

/** The Resend event types that can change a notice; every other type is acknowledged and ignored. */
export const DELIVERY_EVENT_TYPES = ['email.delivered', 'email.bounced', 'email.complained', 'email.suppressed']

// The fields read from an email event's `data` (https://resend.com/docs/webhooks/emails/bounced.md); `tags` is an
// object in webhooks, not the send's array.
interface EmailEvent {
  email_id?: string
  to?: string[]
  tags?: Record<string, string>
  bounce?: { type?: string }
}

/**
 * A Resend email event as a `DeliveryEvent`: `email.delivered` a delivery, a `Permanent` `email.bounced` a bounce,
 * `email.suppressed` a bounce too (Resend refused the send: the address is on its team-wide suppression list), and
 * `email.complained` a complaint. Null for one that changes no notice: a transient or undetermined bounce, any other
 * type, or an event without an email ID.
 */
export function deliveryEvent(webhook: ResendWebhook): DeliveryEvent | null {
  const data = (webhook.data ?? {}) as EmailEvent
  const providerMessageId = data.email_id
  if (!providerMessageId) return null
  const event = { providerMessageId, category: data.tags?.category ?? null, recipients: data.to ?? [] }
  switch (webhook.type) {
    case 'email.delivered':
      return { type: 'delivery', ...event }
    case 'email.bounced':
      return data.bounce?.type === 'Permanent' ? { type: 'bounce', ...event } : null
    case 'email.suppressed':
      return { type: 'bounce', ...event }
    case 'email.complained':
      return { type: 'complaint', ...event }
    default:
      return null
  }
}
