// Signed Resend webhook calls and Resend's received-email API for tests only. The bodies are Resend's documented examples
// (fixtures/resend-webhooks.json, from https://resend.com/docs/webhooks/emails/delivered.md, bounced.md, complained.md,
// suppressed.md, failed.md, received.md and https://resend.com/docs/webhooks/suppressions/added.md;
// fixtures/resend-received-email.json, from https://resend.com/docs/api-reference/emails/retrieve-received-email.md;
// error messages from https://resend.com/docs/api-reference/errors.md) until calls captured in production replace them
// (#653).
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** A secret shaped like Resend's, generated per test run. */
export const webhookSecret = `whsec_${randomBytes(24).toString('base64')}`

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

type Example = { type: string; created_at: string; data: Record<string, unknown> }
const examples = fixture('resend-webhooks.json') as Record<string, Example>
const received = fixture('resend-received-email.json') as Record<string, unknown>

/** Resend's documented `GET /emails/receiving/{id}` answer, with fields replaced, such as `text` or `authentication`. */
export function receivedEmail(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...received, ...fields }
}

const ERRORS = {
  not_found: [404, 'The requested endpoint does not exist.'],
  restricted_api_key: [401, 'This API key is restricted to only send emails.'],
  email_above_quota: [403, "You can't retrieve this email's content because it was above quota when received."],
  rate_limit_exceeded: [429, 'Too many requests. Please limit the number of requests per second.'],
  application_error: [500, 'An unexpected error occurred.']
} as const

/** Resend's error answer `{statusCode, message, name}` for `name`. */
export function resendError(name: keyof typeof ERRORS): Response {
  const [statusCode, message] = ERRORS[name]
  return Response.json({ statusCode, message, name }, { status: statusCode })
}

/**
 * A `fetch` double for Resend's `GET /emails/receiving/{id}`: answers an ID in `emails` with that email and any other
 * with Resend's 404 `not_found`, or with `answer` once a test sets it. `requests` keeps every call.
 */
export function retrieveDouble(emails: Record<string, Record<string, unknown>> = {}) {
  const double = {
    emails,
    requests: [] as Request[],
    answer: undefined as (() => Response | Promise<Response>) | undefined,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      double.requests.push(request)
      if (double.answer) return double.answer()
      const email = emails[decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '')]
      return email ? Response.json(email) : resendError('not_found')
    }) as typeof fetch
  }
  return double
}

/** Resend's documented example of `type`, with `data` fields replaced, such as the email ID, `to` and `tags`. */
export function resendEvent(type: string, data: Record<string, unknown> = {}): Example {
  const example = examples[type]
  if (!example) throw new Error(`no documented example for ${type}`)
  return { ...example, data: { ...example.data, ...data } }
}

/** Svix's three headers for `body`, signed now with the test secret unless told otherwise. */
export function signedHeaders(body: string, o: { secret?: string; timestamp?: number; id?: string } = {}) {
  const id = o.id ?? `msg_${randomUUID()}`
  const timestamp = String(o.timestamp ?? Math.floor(Date.now() / 1000))
  const key = Buffer.from((o.secret ?? webhookSecret).replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }
}
