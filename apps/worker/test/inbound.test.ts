// #657: the inbound router behind `POST /resend/webhook`. Calls are the `email.received` webhook captured in production
// (11 Nov 2026), signed with the test secret, and Resend's retrieve call is answered by a double built on the captured
// answer; the consumers here only keep what they get.
import { startTelemetry, traceContext, withTrace } from '@skyclause/config'
import { createInboundRouter, type InboundMessage } from '@skyclause/delivery'
import {
  receivedEmail,
  resendError,
  resendEvent,
  retrieveDouble,
  signedHeaders,
  webhookSecret
} from '@skyclause/delivery/test/resend-double'
import { createLocalJWKSet } from 'jose'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createServer, defineRegistry } from '../src/server'

const KEY = 're_receiving_key_for_tests'
const DOMAIN = 'in.skyclause.m1ku.tech'
const EVIDENCE = `upm.haze-2026@${DOMAIN}`
const REPLY = `r+tok_9f3a@${DOMAIN}`
// The capture's email ID and receipt time, and a clock a minute later.
const ID = '260df29d-f19d-4af4-97c6-8c8b934e8a68'
const RECEIVED_AT = '2026-11-11T15:35:05.895Z'
const NOW = new Date('2026-11-11T15:36:05.895Z')

function setup() {
  const router = createInboundRouter()
  const evidence: InboundMessage[] = []
  const replies: InboundMessage[] = []
  const calls: string[] = []
  const state = { failReplies: false }
  router.onInbound(/^[a-z0-9-]+\.[a-z0-9-]+@in\.skyclause\.m1ku\.tech$/, 'evidence', async (m) => {
    calls.push('evidence')
    evidence.push(m)
  })
  router.onInbound(/^r\+[A-Za-z0-9_-]+@in\.skyclause\.m1ku\.tech$/, 'crowd-replies', async (m) => {
    calls.push('replies')
    if (state.failReplies) throw new Error('database asleep')
    replies.push(m)
  })
  const resend = retrieveDouble()
  const app = createServer({
    registry: defineRegistry([
      {
        owner: 'test',
        resend: { 'email.received': router.handler({ apiKey: KEY, fetch: resend.fetch, now: () => NOW }) }
      }
    ]),
    audience: 'https://worker.example.test',
    invoker: 'invoker@example.test',
    jwks: createLocalJWKSet({ keys: [] }),
    resendWebhookSecret: webhookSecret,
    heartbeat: () => {}
  })
  /** Posts the captured `email.received` with `data` fields replaced, signed now. */
  const post = (data: Record<string, unknown> = {}) => {
    const body = JSON.stringify(resendEvent('email.received', data))
    return app.request('/resend/webhook', { method: 'POST', headers: signedHeaders(body), body })
  }
  return { state, evidence, replies, calls, resend, post }
}

/** The shared logger's JSON lines from here on. */
function logged() {
  const lines: Array<Record<string, unknown>> = []
  for (const level of ['log', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((line: unknown) => void lines.push(JSON.parse(String(line))))
  }
  return () => lines
}

afterEach(() => vi.restoreAllMocks())

describe('email.received on POST /resend/webhook', () => {
  test('reaches the consumer its recipient matches, with the message read from Resend with the receiving key', async () => {
    const t = setup()
    // The captured `text` is a placeholder for the sign-in link it held, so the body is replaced.
    t.resend.emails[ID] = receivedEmail({ to: [EVIDENCE], text: 'Flooded.\n' })

    const res = await t.post({ to: [EVIDENCE] })

    expect(res.status).toBe(200)
    expect(t.evidence).toEqual([
      {
        recipient: EVIDENCE,
        from: 'sign-in@notices.skyclause.m1ku.tech',
        subject: 'Your Skyclause sign-in link',
        text: 'Flooded.\n',
        messageId: ID,
        receivedAt: RECEIVED_AT,
        verdicts: { spf: 'PASS', dkim: 'PASS', dmarc: 'PASS' }
      }
    ])
    expect(t.replies).toEqual([])
    expect(
      t.resend.requests.map((r) => [r.method, r.url, r.headers.get('authorization'), r.headers.get('user-agent')])
    ).toEqual([['GET', `https://api.resend.com/emails/receiving/${ID}?html_format=cid`, `Bearer ${KEY}`, 'skyclause']])
  })

  test('Resend’s pass is PASS and fail is FAIL; gray, processing_failed, unknown or no result is NONE', async () => {
    const cases: Array<[unknown, InboundMessage['verdicts']]> = [
      [
        { spf: 'fail', dkim: 'gray', dmarc: 'processing_failed' },
        { spf: 'FAIL', dkim: 'NONE', dmarc: 'NONE' }
      ],
      [
        { spf: 'unknown', dkim: 'pass', dmarc: 'fail' },
        { spf: 'NONE', dkim: 'PASS', dmarc: 'FAIL' }
      ],
      [null, { spf: 'NONE', dkim: 'NONE', dmarc: 'NONE' }],
      [undefined, { spf: 'NONE', dkim: 'NONE', dmarc: 'NONE' }]
    ]
    for (const [i, [authentication, verdicts]] of cases.entries()) {
      const t = setup()
      t.resend.emails[`${ID}-${i}`] = receivedEmail({ authentication })
      await t.post({ email_id: `${ID}-${i}`, to: [EVIDENCE] })
      expect(
        t.evidence.map((m) => m.verdicts),
        JSON.stringify(authentication)
      ).toEqual([verdicts])
    }
  })

  test('an HTML-only message, whose `text` Resend answers null, reaches the consumer with empty text', async () => {
    const t = setup()
    t.resend.emails[ID] = receivedEmail({ text: null })

    await t.post({ to: [EVIDENCE] })

    expect(t.evidence).toMatchObject([
      { from: 'sign-in@notices.skyclause.m1ku.tech', subject: 'Your Skyclause sign-in link', text: '' }
    ])
  })

  test('a recipient matches whatever its case, and reaches the consumer as Resend received it', async () => {
    // A reply token is case-sensitive base64url, so lower-casing the address would lose it.
    const address = 'r+Tok_9F3a-Xy@IN.skyclause.m1ku.tech'
    const t = setup()
    t.resend.emails[ID] = receivedEmail()

    await t.post({ to: [address] })

    expect(t.replies.map((m) => m.recipient)).toEqual([address])
  })

  test('routes on `to`, the address at our domain it was delivered for, never on `received_for`', async () => {
    const t = setup()
    t.resend.emails[ID] = receivedEmail()

    // The capture's `received_for` repeats `to`; a message forwarded to us would differ.
    await t.post({ to: [REPLY], received_for: ['forwarded@example.com'] })
    await t.post({ email_id: `${ID}-2`, to: ['someone@example.com'], received_for: [EVIDENCE] })

    expect(t.replies.map((m) => m.recipient)).toEqual([REPLY])
    expect(t.evidence).toEqual([])
  })

  test('a message no consumer claims is acknowledged with 200 and never read', async () => {
    const t = setup()

    const res = await t.post({ to: ['postmaster@in.skyclause.m1ku.tech', 'someone@example.com'] })

    expect(res.status).toBe(200)
    expect(t.resend.requests).toEqual([])
    expect([...t.evidence, ...t.replies]).toEqual([])
  })

  test('two copies of one email arriving together are read and handed over once', async () => {
    const t = setup()
    t.resend.emails[ID] = receivedEmail()

    const statuses = await Promise.all([t.post({ to: [EVIDENCE] }), t.post({ to: [EVIDENCE] })])

    expect(statuses.map((res) => res.status)).toEqual([200, 200])
    expect(t.evidence).toHaveLength(1)
    expect(t.resend.requests).toHaveLength(1)
  })

  test('a consumer failure answers 500, and Resend’s retry calls only the consumer that failed', async () => {
    const t = setup()
    t.resend.emails[ID] = receivedEmail()
    t.state.failReplies = true

    expect((await t.post({ to: [EVIDENCE, REPLY] })).status).toBe(500)
    t.state.failReplies = false
    expect((await t.post({ to: [EVIDENCE, REPLY] })).status).toBe(200)

    expect(t.calls).toEqual(['evidence', 'replies', 'replies'])
    expect(t.replies.map((m) => m.recipient)).toEqual([REPLY])
  })

  test('a failed retrieve answers 500 so Resend retries, and hands nothing over until it succeeds', async () => {
    const t = setup()
    const failures = [
      () => resendError('application_error'),
      () => resendError('rate_limit_exceeded'),
      // A sending-only key in RESEND_RECEIVING_API_KEY: fixing the secret lets the retry through.
      () => resendError('restricted_api_key'),
      () => Promise.reject(new TypeError('fetch failed'))
    ]
    for (const failure of failures) {
      t.resend.answer = failure
      expect((await t.post({ to: [EVIDENCE] })).status).toBe(500)
    }
    expect(t.calls).toEqual([])

    t.resend.answer = undefined
    t.resend.emails[ID] = receivedEmail()
    expect((await t.post({ to: [EVIDENCE] })).status).toBe(200)
    expect(t.calls).toEqual(['evidence'])
  })

  test('an email Resend can’t return, gone or above quota, is logged with Resend’s error name and acknowledged', async () => {
    const t = setup()
    const lines = logged()

    expect((await t.post({ to: [EVIDENCE] })).status).toBe(200)
    t.resend.answer = () => resendError('email_above_quota')
    expect((await t.post({ to: [EVIDENCE] })).status).toBe(200)

    expect(t.calls).toEqual([])
    expect(lines().filter((line) => line.messageId === ID)).toEqual([
      expect.objectContaining({ severity: 'ERROR', message: 'inbound mail not retrievable', error: 'not_found' }),
      expect.objectContaining({
        severity: 'ERROR',
        message: 'inbound mail not retrievable',
        error: 'email_above_quota'
      })
    ])
  })

  test('an email received over 23 hours ago is acknowledged with a logged line and never read', async () => {
    // Inside the 24 hours a consumer's handled-message mark is kept, so a late retry or a replay from Resend's
    // dashboard can't repeat a consumer whose mark is gone.
    const t = setup()
    t.resend.emails[ID] = receivedEmail()
    const lines = logged()

    const late = await t.post({ to: [EVIDENCE], created_at: '2026-11-10T16:36:05.894Z' })
    expect(late.status).toBe(200)
    expect(t.resend.requests).toEqual([])
    // Mail no consumer claims is no loss, however old.
    await t.post({ email_id: `${ID}-2`, to: ['postmaster@in.skyclause.m1ku.tech'], created_at: '2026-11-01T00:00:00Z' })
    expect(lines().filter((line) => line.severity === 'ERROR')).toEqual([
      expect.objectContaining({ message: 'inbound mail too old to handle once', messageId: ID })
    ])

    expect((await t.post({ to: [EVIDENCE], created_at: '2026-11-10T16:36:05.895Z' })).status).toBe(200)
    expect(t.calls).toEqual(['evidence'])
  })

  test('a signed email.received without an email ID, a receipt time or recipients is logged and acknowledged', async () => {
    // Retrying it can't help, and a run of failures could disable the one endpoint every Resend event shares.
    const t = setup()
    const lines = logged()
    for (const data of [
      { email_id: undefined },
      { created_at: 'yesterday' },
      { to: EVIDENCE },
      { to: [EVIDENCE, 7] }
    ]) {
      expect((await t.post(data)).status, JSON.stringify(data)).toBe(200)
    }
    expect(lines().map((line) => [line.severity, line.message])).toEqual(
      Array(4).fill(['ERROR', 'malformed email.received'])
    )
    expect(t.resend.requests).toEqual([])
  })
})

test('inbound lines go through the shared logger, carrying the request trace (#245)', async () => {
  const lines: string[] = []
  const telemetry = startTelemetry('job', {
    env: { APP_ENV: 'production', GCP_PROJECT: 'skyclause' },
    traceExporter: { export: (_spans, done) => done({ code: 0 }), shutdown: async () => {} },
    metricExporter: {
      export: (_metrics, done) => done({ code: 0 }),
      forceFlush: async () => {},
      shutdown: async () => {}
    },
    write: (line) => void lines.push(line)
  })
  try {
    const t = setup()
    t.resend.emails[ID] = receivedEmail()
    const traceId = await withTrace({}, 'POST /resend/webhook', async () => {
      await t.post({ to: [EVIDENCE] })
      return traceContext().traceparent?.split('-')[1]
    })
    expect(lines.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({
        severity: 'INFO',
        message: 'inbound mail handled',
        'logging.googleapis.com/trace': `projects/skyclause/traces/${traceId}`
      })
    )
  } finally {
    await telemetry.shutdown()
  }
})
