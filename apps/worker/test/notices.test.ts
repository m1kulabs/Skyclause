// #158 c-sender-email: the worker sends approved calls' notices once, re-checking each recipient, records the
// provider's answer and the delivery events Resend's webhooks report (#656), and settles each call. Real Postgres; the
// provider is a double and the webhooks are Resend's documented examples, signed with a test secret.
import {
  emailHash,
  notice,
  settleCall,
  verifySubscriberToken,
  withSystem,
  withTenant,
  systemPrincipal
} from '@skyclause/db'
import { ledgerOf } from '@skyclause/db/test/bundles/scene'
import { makeOrganization, makeUser } from '@skyclause/db/test/factories/index'
import { expectEvent } from '@skyclause/db/test/harness/index'
import { resendEvent, signedHeaders } from '@skyclause/delivery/test/resend-double'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { registry } from '../src/registry'
import {
  APPROVED_AT,
  approvedCall,
  at,
  mailbox,
  noticeRow,
  senderPart,
  sql,
  stateOf,
  unsubscribeToken
} from './notices-scene'

let orgId: string
beforeAll(async () => {
  vi.stubEnv('EMAIL_HASH_KEY', 'notices-test-email-hash-key-000000000000')
  orgId = (await makeOrganization()).id
})

const suppress = (address: string, reason: 'unsubscribe' | 'bounce' | 'complaint') =>
  sql('INSERT INTO suppression (org_id, email_hash, reason) VALUES ($1, $2, $3)', [orgId, emailHash(address), reason])

describe('the sender on bundle.approved', () => {
  test('sends each notice once in its language, from notices@, with one-click unsubscribe; the call is sent', async () => {
    const made = await approvedCall(orgId, { recipients: [{ language: 'en' }, { language: 'ms' }] })
    const box = mailbox()
    const { approve } = senderPart(box)
    await approve(made.event)
    await approve(made.event) // a Pub/Sub redelivery

    expect(box.sent.map((m) => m.idempotencyKey).sort()).toEqual(made.subscribers.map((s) => s.idempotencyKey).sort())
    const [en, ms] = made.subscribers.map((s) => box.sent.find((m) => m.to === s.email)!)
    expect(en).toMatchObject({ from: 'notices', category: 'call' })
    expect(en!.subject).toBe('Commute disruption: 15:30–16:30 MYT, Mon 2 Nov (Test project)')
    expect(ms!.subject).toMatch(/^Gangguan perjalanan/)
    expect(en!.text).toContain(`https://skyclause.m1ku.tech/c/${made.callId}`)
    expect(en!.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' })
    // The one-click link is this recipient's own, bound to the call and its window.
    expect(await verifySubscriberToken(unsubscribeToken(en!), 'unsubscribe')).toMatchObject({
      subscriberId: made.subscribers[0]!.id,
      callId: made.callId,
      windowId: made.windowId
    })

    for (const s of made.subscribers) {
      expect(await noticeRow(s.noticeId)).toMatchObject({ status: 'sent', attempts: 1 })
    }
    expect(await stateOf('call', made.callId)).toBe('sent')
    expect(await stateOf('bundle', made.bundleId)).toBe('sent')
    const ledger = await ledgerOf(made.projectId)
    expect(ledger.map((e) => e.kind)).toEqual(['call_sent'])
    expect(ledger[0]!.body).toEqual({
      pack: 'sky',
      mode: 'commute_disruption',
      outcome: 'sent',
      notices: { sent: { en: 1, ms: 1 } }
    })
    expect(JSON.stringify(ledger[0])).not.toMatch(/@/)
    const event = await expectEvent('call.sent', { projectId: made.projectId })
    expect(event.data).toEqual({ call_id: made.callId, mode: 'commute_disruption', outcome: 'sent' })
  })

  test('a No call is sent and announced with a null mode', async () => {
    const made = await approvedCall(orgId, { recipients: [{}], noCall: true })
    const box = mailbox()
    await senderPart(box).approve(made.event)
    expect(box.sent[0]!.subject).toMatch(/^No call: 15:30–16:30 MYT/)
    expect(await stateOf('call', made.callId)).toBe('sent')
    expect((await ledgerOf(made.projectId))[0]!.body).toMatchObject({ mode: null, outcome: 'sent' })
    const event = await expectEvent('call.sent', { projectId: made.projectId })
    expect(event.data).toEqual({ call_id: made.callId, mode: null, outcome: 'sent' })
  })

  test('a bundle whose only call was rejected is settled: sent, with no send, ledger entry or call.sent', async () => {
    const made = await approvedCall(orgId, { recipients: [], rejected: true })
    expect(await stateOf('bundle', made.bundleId)).toBe('approved')
    const box = mailbox()
    const { approve } = senderPart(box)
    await approve(made.event)
    await approve(made.event)
    expect(await stateOf('bundle', made.bundleId)).toBe('sent')
    expect(await stateOf('call', made.callId)).toBe('rejected')
    expect(box.sent).toEqual([])
    expect(await ledgerOf(made.projectId)).toEqual([])
    expect(
      await sql('SELECT 1 FROM domain_event WHERE project_id = $1 AND type = $2', [made.projectId, 'call.sent'])
    ).toEqual([])
  })

  test('NFR-2, NFR-3: approval to provider within 60 s, stamped as accepted_at', async () => {
    const made = await approvedCall(orgId, { recipients: [{}] })
    const { approve, clock } = senderPart(mailbox())
    clock.now = at('2026-11-02T07:10:04Z')
    await approve(made.event)
    const row = await noticeRow(made.subscribers[0]!.noticeId)
    expect(row.accepted_at).toEqual(clock.now)
    expect((row.accepted_at!.getTime() - APPROVED_AT.getTime()) / 1000).toBeLessThanOrEqual(60)
    expect(row.provider_message_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  test('NTC-8, NTC-9, NTC-10: unconfirmed, unsubscribed and suppressed addresses get no send', async () => {
    const made = await approvedCall(orgId, {
      recipients: [
        { confirmed: false },
        { unsubscribed: true },
        { email: 'bounced@example.test' },
        { email: 'Complained@Example.test ' },
        { email: 'unsubscribed-elsewhere@example.test' },
        {}
      ]
    })
    await suppress('bounced@example.test', 'bounce')
    await suppress('complained@example.test', 'complaint')
    await suppress('unsubscribed-elsewhere@example.test', 'unsubscribe')
    const box = mailbox()
    await senderPart(box).approve(made.event)

    expect(box.sent.map((m) => m.to)).toEqual([made.subscribers[5]!.email])
    const statuses = await Promise.all(made.subscribers.map(async (s) => (await noticeRow(s.noticeId)).status))
    expect(statuses).toEqual(['suppressed', 'suppressed', 'suppressed', 'suppressed', 'suppressed', 'sent'])
    expect(await stateOf('call', made.callId)).toBe('sent')
    expect((await ledgerOf(made.projectId))[0]!.body).toMatchObject({
      notices: { sent: { en: 1 }, suppressed: { en: 5 } }
    })
  })

  test('CAL-8: a notice for a call past its expiry never sends, and a call with nothing sent fails', async () => {
    const made = await approvedCall(orgId, { recipients: [{}, {}] })
    const box = mailbox()
    const { approve, clock } = senderPart(box)
    clock.now = at('2026-11-02T08:30:00Z') // Storm confirmed expires as its window ends
    await approve(made.event)
    expect(box.sent).toEqual([])
    for (const s of made.subscribers) expect((await noticeRow(s.noticeId)).status).toBe('expired')
    expect(await stateOf('call', made.callId)).toBe('failed')
    expect((await ledgerOf(made.projectId))[0]!.body).toMatchObject({
      outcome: 'failed',
      notices: { expired: { en: 2 } }
    })
  })

  test('PRJ-8, D36: an archived or suspended project sends nothing and keeps its notices queued', async () => {
    const archived = await approvedCall(orgId, { recipients: [{}] })
    await sql('UPDATE project SET archived_at = now() WHERE id = $1', [archived.projectId])
    const suspendedOrg = (await makeOrganization({ deletionRequestedAt: new Date() })).id
    const suspended = await approvedCall(suspendedOrg, { recipients: [{}] })
    const box = mailbox()
    const { approve, sweep } = senderPart(box)
    for (const made of [archived, suspended]) {
      await approve(made.event)
      await sweep()
      expect(await noticeRow(made.subscribers[0]!.noticeId)).toMatchObject({ status: 'queued', attempts: 0 })
      expect(await stateOf('call', made.callId)).toBe('sending')
    }
    expect(box.sent.filter((m) => [archived, suspended].some((c) => c.subscribers[0]!.email === m.to))).toEqual([])
  })

  test('a Crowd notice replies to r+{reply token}@INBOUND_DOMAIN, the token bound to the call and window', async () => {
    const made = await approvedCall(orgId, { pack: 'crowd', recipients: [{}] })
    const box = mailbox()
    await senderPart(box).approve(made.event)
    const replyTo = box.sent[0]!.replyTo!
    const token = /^r\+(.+)@in\.skyclause\.m1ku\.tech$/.exec(replyTo)![1]!
    expect(box.sent[0]!.text).toContain(`https://app.skyclause.m1ku.tech/subscribe/${token}/reply`)
    expect(await verifySubscriberToken(token, 'reply')).toMatchObject({
      subscriberId: made.subscribers[0]!.id,
      callId: made.callId,
      windowId: made.windowId
    })
  })

  test('before gate 4B (no SES values) the send fails loudly and spends no attempt', async () => {
    const made = await approvedCall(orgId, { recipients: [{}] })
    await expect(senderPart(null).approve(made.event)).rejects.toThrow(/email is off/)
    expect(await noticeRow(made.subscribers[0]!.noticeId)).toMatchObject({ status: 'queued', attempts: 0 })
  })
})

describe('exactly once', () => {
  test('two claimers on one batch send each notice once, the second starting while the first is mid-send', async () => {
    const made = await approvedCall(orgId, { recipients: [{}, {}, {}, {}, {}, {}] })
    const box = mailbox({ delayMs: 30 })
    const { approve } = senderPart(box)
    const first = approve(made.event)
    await vi.waitUntil(() => box.started > 0)
    await Promise.all([first, approve(made.event)])
    const keys = box.sent.map((m) => m.idempotencyKey)
    expect(keys.sort()).toEqual(made.subscribers.map((s) => s.idempotencyKey).sort())
    expect(await stateOf('call', made.callId)).toBe('sent')
    expect((await ledgerOf(made.projectId)).map((e) => e.kind)).toEqual(['call_sent'])
  })

  test('two settles at once write one call_sent and one call.sent', async () => {
    const made = await approvedCall(orgId, { recipients: [] })
    const settle = () =>
      withTenant({ orgId, principal: systemPrincipal('test') }, (tx) =>
        settleCall(tx, made.callId, at('2026-11-02T07:10:05Z'))
      )
    expect((await Promise.all([settle(), settle()])).sort()).toEqual(['sent', null].sort())
    expect((await ledgerOf(made.projectId)).map((e) => e.kind)).toEqual(['call_sent'])
    await expectEvent('call.sent', { projectId: made.projectId })
  })
})

describe('retries on the batch sweep (D45)', () => {
  test('a transport error retries on 5 sweeps, then the notice and its call fail', async () => {
    const made = await approvedCall(orgId, { recipients: [{}] })
    const box = mailbox({ fail: () => true })
    const { approve, sweep } = senderPart(box)
    await approve(made.event)
    const id = made.subscribers[0]!.noticeId
    expect(await noticeRow(id)).toMatchObject({ status: 'queued', attempts: 1 })
    for (let retry = 1; retry <= 4; retry++) await sweep()
    expect(await noticeRow(id)).toMatchObject({ status: 'queued', attempts: 5 })
    expect(await stateOf('call', made.callId)).toBe('sending')
    await sweep()
    expect(await noticeRow(id)).toMatchObject({ status: 'failed', attempts: 6 })
    expect(await stateOf('call', made.callId)).toBe('failed')
    expect((await ledgerOf(made.projectId))[0]!.body).toMatchObject({
      outcome: 'failed',
      notices: { failed: { en: 1 } }
    })
  })

  test('the sweep sends what the consumer couldn’t, once SES answers', async () => {
    const made = await approvedCall(orgId, { recipients: [{}] })
    let down = true
    const box = mailbox({ fail: () => down })
    const { approve, sweep } = senderPart(box)
    await approve(made.event)
    down = false
    await sweep()
    await sweep()
    expect(box.sent.filter((m) => m.idempotencyKey === made.subscribers[0]!.idempotencyKey)).toHaveLength(1)
    expect(await noticeRow(made.subscribers[0]!.noticeId)).toMatchObject({ status: 'sent', attempts: 2 })
    expect(await stateOf('call', made.callId)).toBe('sent')
  })
})

/**
 * Resend's documented `type` webhook for `providerMessageId` (its email ID) to `address`, tagged `category`, as the
 * body Resend posts to /resend/webhook.
 */
function resendBody(
  type: string,
  providerMessageId: string,
  address: string,
  o: { category?: string; data?: Record<string, unknown> } = {}
) {
  return JSON.stringify(
    resendEvent(type, {
      email_id: providerMessageId,
      to: [address],
      tags: { category: o.category ?? 'call' },
      ...o.data
    })
  )
}
const permanentBounce = (providerMessageId: string, address: string, o: { category?: string } = {}) =>
  resendBody('email.bounced', providerMessageId, address, o)

const suppressionOf = (address: string) =>
  sql<{ reason: string }>('SELECT reason FROM suppression WHERE org_id = $1 AND email_hash = $2', [
    orgId,
    emailHash(address)
  ])

describe('POST /resend/webhook (NTC-10)', () => {
  test('a hard-bounced address is skipped next time and the bundle shows it as suppressed', async () => {
    const address = 'gone@example.test'
    const first = await approvedCall(orgId, { recipients: [{ email: address }] })
    const box = mailbox()
    const { approve, webhook } = senderPart(box)
    await approve(first.event)
    const sent = await noticeRow(first.subscribers[0]!.noticeId)

    const bounce = permanentBounce(sent.provider_message_id!, address)
    const headers = signedHeaders(bounce)
    expect((await webhook(bounce, headers)).status).toBe(200)
    expect((await noticeRow(first.subscribers[0]!.noticeId)).status).toBe('bounced')
    expect(await suppressionOf(address)).toEqual([{ reason: 'bounce' }])

    // A replay (Resend redelivering, or anyone resending the signed call within five minutes) changes nothing.
    expect((await webhook(bounce, headers)).status).toBe(200)
    expect(await suppressionOf(address)).toEqual([{ reason: 'bounce' }])

    const next = await approvedCall(orgId, { recipients: [{ email: address }, {}] })
    await approve(next.event)
    expect(box.sent.filter((m) => m.to === address)).toHaveLength(1)
    expect((await noticeRow(next.subscribers[0]!.noticeId)).status).toBe('suppressed')
    // #150's GET /v1/bundles/{id} counts the call's notices with status `suppressed`.
    const counted = await sql<{ n: number }>(
      "SELECT count(*)::int AS n FROM notice WHERE call_id = $1 AND kind = 'call' AND status = 'suppressed'",
      [next.callId]
    )
    expect(counted).toEqual([{ n: 1 }])
  })

  test('delivered, then complained; a replayed delivery never undoes the complaint, and a transient bounce is nothing', async () => {
    const address = 'reader@example.test'
    const made = await approvedCall(orgId, { recipients: [{ email: address }] })
    const { approve, webhook } = senderPart(mailbox())
    await approve(made.event)
    const id = made.subscribers[0]!.noticeId
    const providerId = (await noticeRow(id)).provider_message_id!
    const delivered = resendBody('email.delivered', providerId, address)
    const transient = resendBody('email.bounced', providerId, address, {
      data: { bounce: { message: 'Mailbox full', subType: 'MailboxFull', type: 'Transient' } }
    })

    expect((await webhook(delivered)).status).toBe(200)
    expect((await noticeRow(id)).status).toBe('delivered')
    expect((await webhook(transient)).status).toBe(200)
    expect((await noticeRow(id)).status).toBe('delivered')
    expect(await suppressionOf(address)).toEqual([])
    expect((await webhook(resendBody('email.complained', providerId, address))).status).toBe(200)
    expect((await webhook(delivered)).status).toBe(200)
    expect((await noticeRow(id)).status).toBe('complained')
    expect(await suppressionOf(address)).toEqual([{ reason: 'complaint' }])
  })

  test('a send Resend suppressed is bounced and suppresses the address', async () => {
    const address = 'on-resend-list@example.test'
    const made = await approvedCall(orgId, { recipients: [{ email: address }] })
    const { approve, webhook } = senderPart(mailbox())
    await approve(made.event)
    const providerId = (await noticeRow(made.subscribers[0]!.noticeId)).provider_message_id!
    expect((await webhook(resendBody('email.suppressed', providerId, address))).status).toBe(200)
    expect((await noticeRow(made.subscribers[0]!.noticeId)).status).toBe('bounced')
    expect(await suppressionOf(address)).toEqual([{ reason: 'bounce' }])
  })

  test('every other event type is acknowledged and changes nothing', async () => {
    const address = 'unchanged@example.test'
    const made = await approvedCall(orgId, { recipients: [{ email: address }] })
    const { approve, webhook } = senderPart(mailbox())
    await approve(made.event)
    const providerId = (await noticeRow(made.subscribers[0]!.noticeId)).provider_message_id!
    for (const body of [
      resendBody('email.failed', providerId, address),
      resendBody('email.bounced', providerId, address, {
        data: { bounce: { message: 'Unknown', subType: 'Undetermined', type: 'Undetermined' } }
      }),
      JSON.stringify(resendEvent('suppression.added', { email: address }))
    ]) {
      expect((await webhook(body)).status, body).toBe(200)
    }
    expect((await noticeRow(made.subscribers[0]!.noticeId)).status).toBe('sent')
    expect(await suppressionOf(address)).toEqual([])
  })

  test('a bounce replaces an unsubscribe suppression, so a later confirmation can’t lift it', async () => {
    const address = 'left-then-bounced@example.test'
    const made = await approvedCall(orgId, { recipients: [{ email: address }] })
    const { approve, webhook } = senderPart(mailbox())
    await approve(made.event)
    await suppress(address, 'unsubscribe')
    const providerId = (await noticeRow(made.subscribers[0]!.noticeId)).provider_message_id!
    await webhook(permanentBounce(providerId, address))
    expect(await suppressionOf(address)).toEqual([{ reason: 'bounce' }])
  })

  test('maps every notice kind: a confirmation email’s bounce suppresses too', async () => {
    const address = 'typo@example.test'
    const made = await approvedCall(orgId, { recipients: [] })
    const providerId = crypto.randomUUID()
    const [row] = await sql<{ id: string }>(
      `INSERT INTO notice (org_id, project_id, kind, channel, idempotency_key, language, status, provider_message_id)
       VALUES ($1, $2, 'confirmation', 'email', $3, 'en', 'sent', $4) RETURNING id`,
      [orgId, made.projectId, crypto.randomUUID(), providerId]
    )
    const { webhook } = senderPart(null)
    await webhook(permanentBounce(providerId, address, { category: 'confirmation' }))
    expect((await noticeRow(row!.id)).status).toBe('bounced')
  })

  test('an account export bounce updates its orgless system notice without an org suppression', async () => {
    const account = await makeUser({ name: 'Export requester', email: `export-${crypto.randomUUID()}@example.test` })
    const providerId = crypto.randomUUID()
    const [created] = await withSystem('test:export-ready', (tx) =>
      tx
        .insert(notice)
        .values({
          orgId: null,
          projectId: null,
          kind: 'export_ready',
          channel: 'email',
          idempotencyKey: crypto.randomUUID(),
          accountId: account.id,
          language: 'en',
          status: 'sent',
          providerMessageId: providerId
        })
        .returning({ id: notice.id })
    )
    if (!created) throw new Error('expected the export notice to be inserted')

    const { webhook } = senderPart(null)
    const response = await webhook(permanentBounce(providerId, account.email, { category: 'export_ready' }))

    expect(response.status).toBe(200)
    expect(await noticeRow(created.id)).toMatchObject({ status: 'bounced' })
    expect(await sql('SELECT 1 FROM suppression WHERE email_hash = $1', [emailHash(account.email)])).toEqual([])
  })

  test('an event whose notice isn’t recorded yet answers 503 so Resend retries; mail with no outbox row is acknowledged', async () => {
    const { webhook } = senderPart(null)
    const delivered = (category: string) =>
      resendBody('email.delivered', crypto.randomUUID(), 'x@example.test', { category })
    expect((await webhook(delivered('call'))).status).toBe(503)
    for (const category of ['magic_link', 'member-invitation', 'auditor']) {
      expect((await webhook(delivered(category))).status, category).toBe(200)
    }
    const untagged = resendEvent('email.delivered', { email_id: crypto.randomUUID(), tags: undefined })
    expect((await webhook(JSON.stringify(untagged))).status).toBe(200)
  })

  test('a call signed with another secret, altered or stale answers 401 and writes nothing', async () => {
    const address = 'forged@example.test'
    const made = await approvedCall(orgId, { recipients: [{ email: address }] })
    const { approve, webhook } = senderPart(mailbox())
    await approve(made.event)
    const providerId = (await noticeRow(made.subscribers[0]!.noticeId)).provider_message_id!
    const bounce = permanentBounce(providerId, address)
    const other = `whsec_${Buffer.from('not-the-worker-webhook-secret').toString('base64')}`
    const stale = Math.floor(Date.now() / 1000) - 6 * 60

    expect((await webhook(bounce, signedHeaders(bounce, { secret: other }))).status).toBe(401)
    expect((await webhook(bounce, signedHeaders(bounce.replace('"call"', '"auditor"')))).status).toBe(401)
    expect((await webhook(bounce, signedHeaders(bounce, { timestamp: stale }))).status).toBe(401)
    expect((await noticeRow(made.subscribers[0]!.noticeId)).status).toBe('sent')
    expect(await suppressionOf(address)).toEqual([])
  })

  test('a validly signed body that isn’t JSON answers 400', async () => {
    expect((await senderPart(null).webhook('{"type":"email.bounced",')).status).toBe(400)
  })
})

describe('registration', () => {
  test('c-sender-email registers the sender, the sweep and the four delivery events once', () => {
    expect(registry.events.filter((c) => c.consumer === 'sender').map((c) => c.types)).toEqual([['bundle.approved']])
    expect(registry.batch['notice-sweep']).toBeTypeOf('function')
    expect(Object.keys(senderPart(null).part.resend!).sort()).toEqual(
      ['email.bounced', 'email.complained', 'email.delivered', 'email.suppressed'].sort()
    )
    expect(Object.keys(registry.resend).sort()).toEqual(
      ['email.bounced', 'email.complained', 'email.delivered', 'email.received', 'email.suppressed'].sort()
    )
  })
})
