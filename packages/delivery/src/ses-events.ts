// #158 c-sender-email: delivery status (NTC-10). SES publishes the configuration set's events to SNS
// `SES_EVENTS_SNS_TOPIC_ARN`, which calls the worker's /ses/events; this route checks each message's signature by
// AWS's steps and hands the events that change a notice to `apply`. Addresses never reach the logs.
import { log } from '@skyclause/config'
import { isSnsUrl, SnsVerificationError, verifySnsMessage } from './sns'

/** A notice-changing SES event: a delivery, a hard (Permanent) bounce or a complaint, for every recipient named. */
export interface SesEvent {
  type: 'delivery' | 'bounce' | 'complaint'
  /** SES's message ID, which `EmailTransport.send` returned as `providerMessageId`. */
  providerMessageId: string
  /** The `category` tag the transport set (a notice kind for an outbox send), or null. */
  category: string | null
  recipients: string[]
}

export interface SesEventsOptions {
  /** `SES_EVENTS_SNS_TOPIC_ARN`: the only topic accepted, and the only subscription confirmed. */
  topicArn: string
  /** `SES_REGION` */
  region: string
  certificate?: (url: string) => Promise<string>
  /** Confirms the subscription; defaults to the global fetch. */
  fetch?: typeof fetch
  /**
   * Records the event and resolves true, or false when its send isn't recorded yet, which answers 503 so SNS retries.
   * It must be idempotent: SNS redelivers until it gets a 2xx.
   */
  apply: (event: SesEvent) => Promise<boolean>
}

interface Published {
  eventType?: string
  notificationType?: string
  mail?: { messageId?: string; tags?: Record<string, string[]> }
  delivery?: { recipients?: string[] }
  bounce?: { bounceType?: string; bouncedRecipients?: Array<{ emailAddress?: string }> }
  complaint?: { complainedRecipients?: Array<{ emailAddress?: string }> }
}

const addresses = (list: Array<{ emailAddress?: string }> | undefined) =>
  (list ?? []).flatMap((r) => (r.emailAddress ? [r.emailAddress] : []))

/**
 * An SES event-publishing record (`eventType`, or an identity notification's `notificationType`) as a `SesEvent`;
 * null for one that changes no notice: Send, Reject, DeliveryDelay, opens, clicks, and transient or undetermined
 * bounces.
 */
export function parseSesEvent(text: string): SesEvent | null {
  const event = JSON.parse(text) as Published
  const providerMessageId = event.mail?.messageId
  if (!providerMessageId) return null
  const category = event.mail?.tags?.category?.[0] ?? null
  switch (event.eventType ?? event.notificationType) {
    case 'Delivery':
      return { type: 'delivery', providerMessageId, category, recipients: event.delivery?.recipients ?? [] }
    case 'Bounce':
      if (event.bounce?.bounceType !== 'Permanent') return null
      return { type: 'bounce', providerMessageId, category, recipients: addresses(event.bounce.bouncedRecipients) }
    case 'Complaint':
      return {
        type: 'complaint',
        providerMessageId,
        category,
        recipients: addresses(event.complaint?.complainedRecipients)
      }
    default:
      return null
  }
}

/** The worker's `POST /ses/events` route. */
export function sesEventsHandler(options: SesEventsOptions) {
  return async (request: Request): Promise<Response> => {
    let body: unknown
    try {
      body = JSON.parse(await request.text())
    } catch {
      return new Response('malformed SNS message', { status: 400 })
    }
    let message
    try {
      message = await verifySnsMessage(body, options)
    } catch (error) {
      if (error instanceof SnsVerificationError) return new Response(error.message, { status: 403 })
      throw error
    }

    if (message.Type === 'SubscriptionConfirmation') {
      if (!message.SubscribeURL || !isSnsUrl(message.SubscribeURL, options.region)) {
        return new Response('SubscribeURL is not SNS in this region', { status: 403 })
      }
      const confirmation = await (options.fetch ?? fetch)(message.SubscribeURL, { redirect: 'error' })
      if (!confirmation.ok) throw new Error(`SNS ConfirmSubscription failed (HTTP ${confirmation.status})`)
      log.info('ses events subscription confirmed', { topicArn: message.TopicArn })
      return new Response(null, { status: 200 })
    }
    if (message.Type === 'UnsubscribeConfirmation') return new Response(null, { status: 204 })

    const event = parseSesEvent(message.Message)
    if (event && !(await options.apply(event))) return new Response('send not recorded yet', { status: 503 })
    return new Response(null, { status: 204 })
  }
}
