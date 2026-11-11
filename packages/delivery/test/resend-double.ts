// Signed Resend webhook calls for tests only. The bodies are Resend's documented examples
// (fixtures/resend-webhooks.json, from https://resend.com/docs/webhooks/emails/delivered.md, bounced.md, complained.md,
// suppressed.md, failed.md and https://resend.com/docs/webhooks/suppressions/added.md) until calls captured in
// production replace them (#653).
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** A secret shaped like Resend's, generated per test run. */
export const webhookSecret = `whsec_${randomBytes(24).toString('base64')}`

type Example = { type: string; created_at: string; data: Record<string, unknown> }
const examples = JSON.parse(
  readFileSync(new URL('./fixtures/resend-webhooks.json', import.meta.url), 'utf8')
) as Record<string, Example>

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
