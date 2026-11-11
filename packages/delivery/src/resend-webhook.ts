// #656: every Resend webhook reaches the worker's one public `POST /resend/webhook`, signed with Svix's scheme
// (https://resend.com/docs/webhooks/verify-webhooks-requests.md). The route checks the signature on the raw body before
// anything parses it, then hands the event to the part registered for its `type`.
import { createHmac, timingSafeEqual } from 'node:crypto'

/** A webhook call that isn't Resend's: a missing header, a stale timestamp or no matching signature. */
export class WebhookVerificationError extends Error {
  override name = 'WebhookVerificationError'
}

const TOLERANCE_S = 5 * 60

/**
 * The checks that need no body, so a caller can refuse a call before reading it: all three Svix headers, and
 * `svix-timestamp` within five minutes of `now` either way. Returns the three values; throws
 * `WebhookVerificationError`.
 */
export function checkResendWebhookHeaders(headers: Headers, now: Date) {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!id || !timestamp || !signatures) throw new WebhookVerificationError('missing Svix headers')
  if (!/^\d+$/.test(timestamp) || Math.abs(now.getTime() / 1000 - Number(timestamp)) > TOLERANCE_S) {
    throw new WebhookVerificationError('timestamp outside the five-minute tolerance')
  }
  return { id, timestamp, signatures }
}

/**
 * Checks a Resend webhook call by Svix's steps (https://docs.svix.com/receiving/verifying-payloads/how-manual.md):
 * `checkResendWebhookHeaders`, then an HMAC-SHA256 keyed with the Base64 part of the `whsec_` secret, over
 * `svix-id.svix-timestamp.body`, equal in constant time to any `v1,` entry of the space-separated `svix-signature`.
 * `body` is the raw text as received: JSON parsed and serialised again wouldn't match. Throws
 * `WebhookVerificationError`.
 */
export function verifyResendWebhook(secret: string, headers: Headers, body: string, now: Date): void {
  const { id, timestamp, signatures } = checkResendWebhookHeaders(headers, now)
  const expected = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${timestamp}.${body}`)
    .digest()
  const matches = signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',')
    if (version !== 'v1' || !signature) return false
    const given = Buffer.from(signature, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!matches) throw new WebhookVerificationError('no signature matches')
}

/**
 * A Resend webhook's body: its event `type`, such as `email.delivered`, `created_at`, when Resend made the event (RFC
 * 3339, unchecked), and `data`, which the type's handler reads.
 */
export interface ResendWebhook {
  type: string
  created_at?: unknown
  data: unknown
}

/** A verified body as a `ResendWebhook`; throws `SyntaxError` on malformed JSON or a body with no string `type`. */
export function parseResendWebhook(body: string): ResendWebhook {
  const event = JSON.parse(body) as Partial<ResendWebhook> | null
  if (typeof event?.type !== 'string') throw new SyntaxError('not a Resend webhook')
  return event as ResendWebhook
}
