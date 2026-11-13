// Signed Resend webhook calls and Resend's received-email API for tests only. The bodies are payloads captured from
// production on 11 Nov 2026, the cutover (#660), from Resend's webhook-events API and received-email API after sends
// through the sign-in endpoint to Resend's test addresses and to cutover-probe@in.skyclause.m1ku.tech, with no user
// data (fixtures/resend-email-{delivered,bounced,complained,received}-2026-11-11.json, resend-retrieve-received-2026-11-11.json).
// Three fields of the retrieve capture hold placeholders, since they held a live sign-in link and a signed download URL:
// `text`, `html` and `raw.download_url`. It was fetched without the `html_format=cid` the handler asks for, so its
// `html_format` reads `data_uri`. Variations a capture can't give are the capture with named fields replaced.
//
// Only what no capture exists for stays Resend's documentation (fixtures/resend-webhooks-documented.json, from
// https://resend.com/docs/webhooks/emails/suppressed.md, failed.md and https://resend.com/docs/webhooks/suppressions/added.md:
// Resend's test addresses never suppress or fail a send); so do the error messages (from
// https://resend.com/docs/api-reference/errors.md).
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** A secret shaped like Resend's, generated per test run. */
export const webhookSecret = `whsec_${randomBytes(24).toString('base64')}`

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

type Example = { type: string; created_at: string; data: Record<string, unknown> }
const examples: Record<string, Example> = {
  // Documentation only: no capture exists for these types.
  ...fixture('resend-webhooks-documented.json'),
  'email.delivered': fixture('resend-email-delivered-2026-11-11.json') as Example,
  'email.bounced': fixture('resend-email-bounced-2026-11-11.json') as Example,
  'email.complained': fixture('resend-email-complained-2026-11-11.json') as Example,
  'email.received': fixture('resend-email-received-2026-11-11.json') as Example
}
const received = fixture('resend-retrieve-received-2026-11-11.json') as Record<string, unknown>

/** The captured `GET /emails/receiving/{id}` answer, with fields replaced, such as `text` or `authentication`. */
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

/**
 * The captured webhook of `type` (the documented example for `email.suppressed`, `email.failed` and `suppression.added`),
 * with `data` fields replaced, such as the email ID, `to` and `tags`.
 */
export function resendEvent(type: string, data: Record<string, unknown> = {}): Example {
  const example = examples[type]
  if (!example) throw new Error(`no capture or documented example for ${type}`)
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
