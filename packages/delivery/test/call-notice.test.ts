// #158: the email a call notice is handed to Resend as (NTC-1, NTC-9, CAL-17): #152's template with the recipient's own
// links, RFC 8058 one-click unsubscribe, and for a Crowd notice a Reply-To that #163's inbound route reads.
import { describe, expect, test } from 'vitest'
import { callNoticeEmail } from '../src/call-notice'
import { createEmailTransport } from '../src/email'
import { CONTEXT, callView } from './call-view'

const origins = { app: 'https://app.skyclause.m1ku.tech', marketing: 'https://skyclause.m1ku.tech' }
const tokens = { manage: 'manage-token', unsubscribe: 'unsubscribe-token' }
const base = {
  to: 'subscriber@example.test',
  language: 'en',
  idempotencyKey: 'key-1',
  tokens,
  origins,
  ...CONTEXT
}

describe('callNoticeEmail', () => {
  test('a Sky notice: the template from notices@, with the permalink, preference and unsubscribe links', () => {
    const m = callNoticeEmail(callView(), base)
    expect(m).toMatchObject({
      to: 'subscriber@example.test',
      from: 'notices',
      category: 'call',
      idempotencyKey: 'key-1',
      subject: 'Commute disruption: 15:30–16:30 MYT, Mon 2 Nov (Bukit Jalil)',
      headers: {
        'List-Unsubscribe': '<https://app.skyclause.m1ku.tech/api/subscribe/unsubscribe-token/unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      }
    })
    expect(m.replyTo).toBeUndefined()
    expect(m.text).toContain('https://skyclause.m1ku.tech/c/0196f0c2-0000-7000-8000-000000000001')
    expect(m.text).toContain('https://app.skyclause.m1ku.tech/subscribe/manage-token')
    expect(m.text).toContain('https://app.skyclause.m1ku.tech/subscribe/unsubscribe-token/unsubscribe')
    expect(m.html).toContain('https://app.skyclause.m1ku.tech/subscribe/unsubscribe-token/unsubscribe')
  })

  test('a Crowd notice replies to r+{token}@INBOUND_DOMAIN and links the reply page', () => {
    const m = callNoticeEmail(callView({ pack: 'crowd', mode: 'surge_night' }), {
      ...base,
      tokens: { ...tokens, reply: 'reply-token' },
      inboundDomain: 'in.skyclause.m1ku.tech'
    })
    expect(m.replyTo).toBe('r+reply-token@in.skyclause.m1ku.tech')
    expect(m.text).toContain('https://app.skyclause.m1ku.tech/subscribe/reply-token/reply')
  })

  test('a reply token without INBOUND_DOMAIN is refused', () => {
    const call = callView({ pack: 'crowd', mode: 'surge_night' })
    expect(() => callNoticeEmail(call, { ...base, tokens: { ...tokens, reply: 'reply-token' } })).toThrow(
      /INBOUND_DOMAIN/
    )
  })

  test('through the Resend transport it keeps its text, the one-click headers and the category tag', async () => {
    const bodies: string[] = []
    const transport = createEmailTransport({
      apiKey: 're_test_sending_only',
      fromAuth: 'Skyclause <sign-in@notices.skyclause.m1ku.tech>',
      fromNotices: 'Skyclause <notices@notices.skyclause.m1ku.tech>',
      fetch: (async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(String(init?.body))
        return Response.json({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
      }) as typeof fetch
    })
    const m = callNoticeEmail(callView(), base)
    expect(await transport.send(m)).toEqual({ providerMessageId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      from: 'Skyclause <notices@notices.skyclause.m1ku.tech>',
      text: m.text,
      headers: {
        'List-Unsubscribe': '<https://app.skyclause.m1ku.tech/api/subscribe/unsubscribe-token/unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      tags: [{ name: 'category', value: 'call' }]
    })
  })
})
