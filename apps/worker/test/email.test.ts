// a-email-transport's part (#657): Resend's `email.received` on `POST /resend/webhook`, read from Resend through a
// `fetch` double and handed to the worker's own consumers on the shared router, down to their rows in Postgres. Calls
// are Resend's documented examples, signed with the test secret.
import { randomUUID } from 'node:crypto'
import { loadEnv } from '@skyclause/config'
import { issueSubscriberToken, setFlag, systemPrincipal, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeFeatureFlag,
  makeOrganization,
  makeProject,
  makeRun,
  makeSubscriber,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import {
  receivedEmail,
  resendEvent,
  retrieveDouble,
  signedHeaders,
  webhookSecret
} from '@skyclause/delivery/test/resend-double'
import { createLocalJWKSet } from 'jose'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { createEmailPart } from '../src/email'
import '../src/evidence' // registers `evidence` on the shared router
import '../src/replies' // registers `crowd-replies` on the shared router
import { createServer, defineRegistry } from '../src/server'

const DOMAIN = 'in.skyclause.m1ku.tech'
const base = {
  APP_ENV: 'production' as const,
  WORKER_URL: 'https://worker-413187272599.asia-southeast1.run.app',
  WORKER_INVOKER_SA: 'skyclause-invoker@skyclause.iam.gserviceaccount.com',
  EMAIL_HASH_KEY: 'e'.repeat(48),
  PORT: 8080
}
// Shaped like Resend's full-access key, not a real one.
const receiving = { RESEND_RECEIVING_API_KEY: 're_receiving_key_for_tests', RESEND_WEBHOOK_SECRET: webhookSecret }

function app(load: Parameters<typeof createEmailPart>[0], resend = retrieveDouble()) {
  const server = createServer({
    registry: defineRegistry([createEmailPart(load, { fetch: resend.fetch })]),
    audience: base.WORKER_URL,
    invoker: base.WORKER_INVOKER_SA,
    jwks: createLocalJWKSet({ keys: [] }),
    resendWebhookSecret: webhookSecret,
    heartbeat: () => {}
  })
  return {
    resend,
    /** Posts Resend's `email.received` example for `emailId`, received now, to `to`, signed now. */
    post: (emailId: string, to: string[]) => {
      const body = JSON.stringify(
        resendEvent('email.received', { email_id: emailId, to, created_at: new Date().toISOString() })
      )
      return server.request('/resend/webhook', { method: 'POST', headers: signedHeaders(body), body })
    }
  }
}

describe('worker email part', () => {
  test('registers email.received and the vapid-keys job', () => {
    const registry = defineRegistry([createEmailPart(() => base)])
    expect(Object.keys(registry.resend)).toEqual(['email.received'])
    expect(Object.keys(registry.jobs)).toEqual(['vapid-keys'])
  })

  test('answers 503 to email.received until the receiving settings are set, so Resend retries', async () => {
    const t = app(() => base)
    expect((await t.post(randomUUID(), [`r+${'a'.repeat(43)}@${DOMAIN}`])).status).toBe(503)
    expect(t.resend.requests).toEqual([])
  })
})

describe('email.received reaches the worker’s consumers', () => {
  /** Rows read as the superuser, past RLS. */
  const sql = (text: string, values: unknown[] = []) =>
    asLogin('postgres', async (client) => (await client.query(text, values)).rows)
  let orgId: string
  let orgSlug: string
  let project: { id: string; slug: string }
  let windowId: string
  let callId: string
  let subscriberId: string
  const subscriberEmail = `ana.lecturer+${randomUUID().slice(0, 6)}@example.edu.my`
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
  const t = app(() => loadEnv('worker'))

  beforeAll(async () => {
    for (const [name, value] of Object.entries({ ...base, ...receiving, INBOUND_DOMAIN: DOMAIN })) {
      vi.stubEnv(name, String(value))
    }
    const org = await makeOrganization()
    ;({ id: orgId, slug: orgSlug } = org)
    await setFlag({ key: 'pack_crowd', enabled: true, orgId })
    await withSystem('test', (tx) => makeFeatureFlag(tx, { key: 'inbound_email', orgId: null, enabled: true }))
    // A Crowd window starting in an hour, so a reply received now is in time.
    const startsAt = new Date(Date.now() + 60 * 60_000)
    ;({ project, windowId, callId, subscriberId } = await inOrg(async (tx) => {
      const made = await makeProject(tx, { timeZone: 'Asia/Kuala_Lumpur' })
      const window = await makeWindow(tx, {
        projectId: made.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 4 * 60 * 60_000)
      })
      const run = await makeRun(tx, { projectId: made.id, pack: 'crowd' })
      const call = await makeCall(tx, { bundleId: (await makeBundle(tx, { runId: run.id })).id, windowId: window.id })
      const subscriber = await makeSubscriber(tx, {
        projectId: made.id,
        email: subscriberEmail,
        confirmedAt: new Date()
      })
      return {
        project: { id: made.id, slug: made.slug },
        windowId: window.id,
        callId: call.id,
        subscriberId: subscriber.id
      }
    }))
  })
  afterAll(() => vi.unstubAllEnvs())

  const replyAddress = async () =>
    `r+${await inOrg((tx) => issueSubscriberToken(tx, { subscriberId, purpose: 'reply', callId, windowId }))}@${DOMAIN}`
  const evidenceAddress = () => `${orgSlug}.${project.slug}@${DOMAIN}`
  /** Resend's documented received email, from the subscriber, with `fields` replaced. */
  const email = (fields: Record<string, unknown>) => receivedEmail({ from: subscriberEmail, ...fields })

  test('a Crowd reply is logged once, however often Resend delivers it', async () => {
    const id = randomUUID()
    const to = [await replyAddress()]
    t.resend.emails[id] = email({ id, to, subject: 'Re: Surge night', text: 'Keep\n\n> Surge night tonight.\n' })

    expect((await t.post(id, to)).status).toBe(200)
    expect((await t.post(id, to)).status).toBe(200)

    expect(await sql(`SELECT call_id, kind FROM crowd_reply WHERE window_id = $1`, [windowId])).toEqual([
      { call_id: callId, kind: 'keep' }
    ])
  })

  test('an evidence request is drafted once, under Resend’s email ID, however often Resend delivers it', async () => {
    const id = randomUUID()
    const to = [evidenceAddress()]
    t.resend.emails[id] = email({ id, to, subject: 'Evidence request', text: 'evidence for 2 Nov 2026 14:00–16:30\n' })

    expect((await t.post(id, to)).status).toBe(200)
    expect((await t.post(id, to)).status).toBe(200)

    expect(
      await sql(`SELECT requester_kind, via, span_from FROM evidence_request WHERE message_id = $1`, [id])
    ).toEqual([{ requester_kind: 'subscriber', via: 'email', span_from: new Date('2026-11-02T06:00:00Z') }])
  })

  test('mail passing neither SPF nor DKIM is dropped and audited by both consumers', async () => {
    const id = randomUUID()
    const to = [evidenceAddress(), await replyAddress()]
    t.resend.emails[id] = email({
      id,
      to,
      text: 'keep\n',
      authentication: { spf: 'fail', dkim: 'gray', dmarc: 'fail' }
    })

    expect((await t.post(id, to)).status).toBe(200)

    expect(await sql(`SELECT action, after FROM audit_event WHERE target_id = $1 ORDER BY action`, [id])).toEqual([
      { action: 'crowd_reply.dropped', after: { dropped: 'verdict' } },
      { action: 'evidence_request.dropped', after: { reason: 'verdicts' } }
    ])
    expect(await sql(`SELECT 1 FROM evidence_request WHERE message_id = $1`, [id])).toEqual([])
  })
})
