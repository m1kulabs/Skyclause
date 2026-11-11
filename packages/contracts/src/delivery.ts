// Spec §1 "Delivery transports". Implementations live in packages/delivery.
export interface EmailTransport {
  // a-email-transport
  send(m: {
    to: string
    from: 'auth' | 'notices' | 'system'
    subject: string
    text: string
    html?: string
    replyTo?: string
    headers?: Record<string, string>
    category: string
    idempotencyKey: string
  }): Promise<{ providerMessageId: string }>
}

export interface PushTransport {
  // c-approver-alerts: 404 or 410 deletes the subscription.
  send(
    s: { endpoint: string; p256dh: string; auth: string },
    p: { title: string; body: string; url: string; tag: string },
    o: { ttlS: number }
  ): Promise<{ status: number }>
}

export interface WebhookTransport {
  // e-webhooks: safeFetch, no redirects, 10 seconds.
  post(
    url: string,
    rawBody: string,
    headers: Record<string, string>
  ): Promise<{
    status: number | null
    latencyMs: number
    excerpt: string
    error?: string
  }>
}

/** An inbound message's SPF, DKIM or DMARC result. */
export type InboundVerdict = 'PASS' | 'FAIL' | 'NONE'

export type OnInbound = (
  recipient: RegExp,
  consumer: string,
  h: (m: {
    recipient: string
    from: string
    subject: string
    text: string
    messageId: string
    receivedAt: string
    verdicts: Record<'spf' | 'dkim' | 'dmarc', InboundVerdict>
  }) => Promise<void>
) => void
