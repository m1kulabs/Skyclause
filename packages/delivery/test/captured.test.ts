// Labelled replay of named captures: the webhooks production's Resend account sent, and its received-email answer, for
// the cutover's checks on 11 Nov 2026 (#660). Sign-in emails went through production's sign-in endpoint to Resend's test
// addresses bounced@ and complained@resend.dev and to cutover-probe@in.skyclause.m1ku.tech; no user data. Each capture
// is replayed unchanged through the code that reads it, which pins the fields that code reads against what Resend
// really sent: `email_id`, `to` and `tags.category` on every email event, `bounce.type` on a bounce, and, on received
// mail, `data.created_at` and `to`, then `from`, `subject`, `text` and `authentication` of the retrieved email.
import { describe, expect, test } from 'vitest'
import { deliveryEvent } from '../src/delivery-events'
import { createInboundRouter, type InboundMessage } from '../src/inbound'
import { receivedEmail, resendEvent, retrieveDouble } from './resend-double'

describe('captured production webhooks (11 Nov 2026)', () => {
  test('email.delivered is a delivery, tagged as the sign-in send was', () => {
    expect(deliveryEvent(resendEvent('email.delivered'))).toEqual({
      type: 'delivery',
      providerMessageId: '01a1cb40-e497-7923-ba5b-29afdcccb3f5',
      category: 'magic_link',
      recipients: ['complained@resend.dev']
    })
  })

  test('email.bounced, a Permanent bounce, is a bounce', () => {
    expect(deliveryEvent(resendEvent('email.bounced'))).toEqual({
      type: 'bounce',
      providerMessageId: '01a1cb3f-9102-76d7-8e22-3b5353ab09bb',
      category: 'magic_link',
      recipients: ['bounced@resend.dev']
    })
  })

  test('email.complained is a complaint', () => {
    expect(deliveryEvent(resendEvent('email.complained'))).toEqual({
      type: 'complaint',
      providerMessageId: '01a1cb40-e497-7923-ba5b-29afdcccb3f5',
      category: 'magic_link',
      recipients: ['complained@resend.dev']
    })
  })
})

describe('captured production received mail (11 Nov 2026)', () => {
  test('email.received and the retrieved email reach the consumer of the probe address as the message', async () => {
    const webhook = resendEvent('email.received')
    const emailId = '260df29d-f19d-4af4-97c6-8c8b934e8a68'
    const resend = retrieveDouble({ [emailId]: receivedEmail() })
    const router = createInboundRouter()
    const messages: InboundMessage[] = []
    router.onInbound(/^cutover-probe@in\.skyclause\.m1ku\.tech$/, 'probe', async (m) => void messages.push(m))

    const res = await router.handler({
      apiKey: 're_receiving_key_for_tests',
      fetch: resend.fetch,
      now: () => new Date('2026-11-11T15:36:05.895Z')
    })(webhook)

    expect(res.status).toBe(200)
    // `receivedAt` is `data.created_at`, when Resend received it, not the envelope's `created_at`, the message's own Date.
    expect(webhook.created_at).toBe('2026-11-11T15:35:03.000Z')
    expect(messages).toEqual([
      {
        recipient: 'cutover-probe@in.skyclause.m1ku.tech',
        from: 'sign-in@notices.skyclause.m1ku.tech',
        subject: 'Your Skyclause sign-in link',
        // A placeholder in the capture, which held a live sign-in link.
        text: expect.any(String),
        messageId: emailId,
        receivedAt: '2026-11-11T15:35:05.895Z',
        verdicts: { spf: 'PASS', dkim: 'PASS', dmarc: 'PASS' }
      }
    ])
  })
})
