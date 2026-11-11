// #656: Resend signs every webhook call with Svix's scheme. The published vector is Svix's own
// (https://docs.svix.com/receiving/verifying-payloads/how-manual.md).
import { describe, expect, test } from 'vitest'
import { checkResendWebhookHeaders, verifyResendWebhook, WebhookVerificationError } from '../src/resend-webhook'

const vector = {
  secret: 'whsec_plJ3nmyCDGBKInavdOK15jsl', // gitleaks:allow -- Svix's published test-vector secret.
  id: 'msg_loFOjxBNrRLzqYUf',
  timestamp: '1731705121',
  body: '{"event_type":"ping","data":{"success":true}}',
  signature: 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='
}
const signedAt = new Date(Number(vector.timestamp) * 1000)

const headers = (o: Partial<Record<'svix-id' | 'svix-timestamp' | 'svix-signature', string>> = {}) =>
  new Headers({
    'svix-id': vector.id,
    'svix-timestamp': vector.timestamp,
    'svix-signature': vector.signature,
    ...o
  })

describe('verifyResendWebhook', () => {
  test("accepts Svix's published test vector", () => {
    expect(() => verifyResendWebhook(vector.secret, headers(), vector.body, signedAt)).not.toThrow()
  })

  const verifying =
    (secret: string, h: Headers, body: string, now = signedAt) =>
    () =>
      verifyResendWebhook(secret, h, body, now)

  test('refuses a wrong secret', () => {
    expect(verifying('whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw', headers(), vector.body)).toThrow(
      WebhookVerificationError
    )
  })

  test('refuses an altered body, including the same JSON serialised again', () => {
    expect(verifying(vector.secret, headers(), vector.body.replace('true', 'false'))).toThrow(/no signature matches/)
    const reserialised = JSON.stringify(JSON.parse(vector.body), null, 2)
    expect(verifying(vector.secret, headers(), reserialised)).toThrow(/no signature matches/)
  })

  test('refuses a call missing any of the three headers', () => {
    for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) {
      const h = headers()
      h.delete(name)
      expect(verifying(vector.secret, h, vector.body), name).toThrow(/missing Svix headers/)
    }
  })

  test('refuses a timestamp more than five minutes off either way, and accepts one within', () => {
    const off = (seconds: number) => new Date(signedAt.getTime() + seconds * 1000)
    expect(verifying(vector.secret, headers(), vector.body, off(301))).toThrow(/five-minute tolerance/)
    expect(verifying(vector.secret, headers(), vector.body, off(-301))).toThrow(/five-minute tolerance/)
    expect(verifying(vector.secret, headers(), vector.body, off(300))).not.toThrow()
    expect(verifying(vector.secret, headers(), vector.body, off(-300))).not.toThrow()
  })

  test('checks the headers and the timestamp alone, before there is a body, and leaves the signature for later', () => {
    const missing = headers()
    missing.delete('svix-id')
    expect(() => checkResendWebhookHeaders(missing, signedAt)).toThrow(/missing Svix headers/)
    expect(() => checkResendWebhookHeaders(headers(), new Date(signedAt.getTime() + 301_000))).toThrow(
      /five-minute tolerance/
    )
    expect(() => checkResendWebhookHeaders(headers({ 'svix-signature': 'v1,unchecked' }), signedAt)).not.toThrow()
  })

  test('passes when any space-separated v1 entry matches, and ignores other versions', () => {
    const stale = 'v1,aW52YWxpZC1zaWduYXR1cmUtZnJvbS1hLXJvdGF0ZWQta2V5LTAwMA=='
    const other = `v1a,${vector.signature.slice(3)}`
    expect(
      verifying(vector.secret, headers({ 'svix-signature': `${stale} ${vector.signature}` }), vector.body)
    ).not.toThrow()
    expect(verifying(vector.secret, headers({ 'svix-signature': `${other} ${stale}` }), vector.body)).toThrow(
      /no signature matches/
    )
  })
})
