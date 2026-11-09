// #163 (c-recipient-replies) at the worker's transport seams: the `crowd-replies` inbound consumer, fed what the
// `/ses/inbound` router hands it, and the `plan-feedback` consumer of `call.graded`, sending through a mailbox double.
import { randomUUID } from 'node:crypto'
import type { EmailTransport } from '@skyclause/contracts'
import type { InboundMessage } from '@skyclause/delivery'
import {
  emitEvent,
  featureFlag,
  issueSubscriberToken,
  setFlag,
  systemPrincipal,
  verifySubscriberToken,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeOrganization,
  makeProject,
  makeRun,
  makeNotice,
  makeSubscriber,
  makeSuppression,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { dispatchEvent } from '../src/events'
import { createRepliesPart, crowdReplyRecipient, handleCrowdReply } from '../src/replies'

const DOMAIN = 'in.skyclause.m1ku.tech'
let orgId: string
const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)
/** Rows read as the superuser, past RLS. */
const sql = (text: string, values: unknown[] = []) =>
  asLogin('postgres', async (client) => (await client.query(text, values)).rows)

async function setInboundEmail(enabled: boolean) {
  await withSystem('test', (tx) =>
    tx
      .insert(featureFlag)
      .values({ key: 'inbound_email', orgId: null, enabled })
      .onConflictDoUpdate({ target: [featureFlag.key, featureFlag.orgId], set: { enabled } })
  )
}

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  await setFlag({ key: 'pack_crowd', enabled: true, orgId })
  await setInboundEmail(true)
})
afterAll(() => sql(`DELETE FROM feature_flag WHERE key = 'inbound_email' AND org_id IS NULL`))

describe('crowd-replies: a reply to a Crowd notice’s Reply-To', () => {
  // A surge night's window, 18:00 to 22:00 MYT on 20 November 2026.
  const STARTS = new Date('2026-11-20T10:00:00Z')
  const ENDS = new Date('2026-11-20T14:00:00Z')
  const RECEIVED = '2026-11-20T09:12:30.000Z'
  let projectId: string
  let windowId: string
  let callId: string
  let subscriberId: string

  beforeEach(async () => {
    ;({ projectId, windowId, callId, subscriberId } = await inOrg(async (tx) => {
      const project = await makeProject(tx)
      const window = await makeWindow(tx, { projectId: project.id, startsAt: STARTS, endsAt: ENDS })
      const run = await makeRun(tx, { projectId: project.id, pack: 'crowd' })
      const call = await makeCall(tx, { bundleId: (await makeBundle(tx, { runId: run.id })).id, windowId: window.id })
      const subscriber = await makeSubscriber(tx, {
        projectId: project.id,
        email: 'ana.lecturer@example.edu.my',
        confirmedAt: new Date()
      })
      return { projectId: project.id, windowId: window.id, callId: call.id, subscriberId: subscriber.id }
    }))
  })

  const replyToken = () => inOrg((tx) => issueSubscriberToken(tx, { subscriberId, purpose: 'reply', callId, windowId }))
  const mail = (token: string, o: Partial<InboundMessage> = {}): InboundMessage => ({
    recipient: `r+${token}@${DOMAIN}`,
    from: 'Ana.Lecturer@example.edu.my',
    subject: 'Re: Surge night tonight',
    text: 'Shift to 19:30\n\nOn Fri, 20 Nov 2026 at 17:00, Skyclause wrote:\n> Surge night: expect crowds.\n',
    messageId: `ses-${randomUUID()}`,
    receivedAt: RECEIVED,
    verdicts: { spf: 'PASS', dkim: 'PASS', spam: 'PASS', virus: 'PASS' },
    ...o
  })
  const replies = () =>
    sql(`SELECT call_id, kind, shift_to, at FROM crowd_reply WHERE window_id = $1 ORDER BY created_at`, [windowId])
  const drops = (messageId: string) =>
    sql(`SELECT action, after, actor_id FROM audit_event WHERE target_type = 'crowd_reply' AND target_id = $1`, [
      messageId
    ])

  test('CAL-17: the reply writes a crowd_reply row and a ledger entry at SES’s receipt time, once', async () => {
    const token = await replyToken()
    // The router matches the address lower-cased and hands it over as received (the token is case-sensitive).
    expect(crowdReplyRecipient(DOMAIN).test(`r+${token}@${DOMAIN}`.toLowerCase())).toBe(true)
    const message = mail(token)

    await handleCrowdReply(message)
    await handleCrowdReply(message)

    expect(await replies()).toMatchObject([
      { call_id: callId, kind: 'shift', shift_to: new Date('2026-11-20T11:30:00Z'), at: new Date(RECEIVED) }
    ])
    const ledger = await sql(`SELECT kind, body FROM ledger_entry WHERE project_id = $1`, [projectId])
    expect(ledger).toMatchObject([
      {
        kind: 'crowd_reply',
        body: { kind: 'shift', shift_to: '2026-11-20T11:30:00.000Z', at: RECEIVED }
      }
    ])
    expect(await drops(message.messageId)).toEqual([])
  })

  test('the first unquoted line decides, in any case; anything else is dropped with one audit row and no reply', async () => {
    const cases: Array<[string, string | null]> = [
      ['KEEP\n', 'keep'],
      ['\n  shuttle  \n> keep\n', 'shuttle'],
      ['> shuttle\nshift to 7:05\n', 'shift'],
      ['Keep please\n', null],
      ['shift to 25:00\n', null],
      ['', null]
    ]
    for (const [text, kind] of cases) {
      const message = mail(await replyToken(), { text })
      await handleCrowdReply(message)
      await handleCrowdReply(message)
      if (kind === null) {
        expect(await drops(message.messageId), text).toEqual([
          { action: 'staff.action', after: { dropped: 'unparsed' }, actor_id: 'inbound:crowd-replies' }
        ])
      } else expect(await drops(message.messageId), text).toEqual([])
    }
    expect((await replies()).map((row) => row.kind)).toEqual(['keep', 'shuttle', 'shift'])
    expect((await replies()).find((row) => row.kind === 'shift')!.shift_to).toEqual(new Date('2026-11-19T23:05:00Z'))
  })

  test('mail without spam and virus PASS, or from another address, is dropped, and its token keeps its reply', async () => {
    const token = await replyToken()
    const unscanned = mail(token, { verdicts: { spf: 'PASS', dkim: 'PASS', spam: 'GRAY', virus: 'PASS' } })
    const forwarded = mail(token, { from: 'someone.else@example.com' })
    await handleCrowdReply(unscanned)
    await handleCrowdReply(forwarded)

    expect((await drops(unscanned.messageId)).map((row) => row.after)).toEqual([{ dropped: 'verdict' }])
    expect((await drops(forwarded.messageId)).map((row) => row.after)).toEqual([{ dropped: 'sender' }])
    expect(await replies()).toEqual([])
    await handleCrowdReply(mail(token, { text: 'keep' }))
    expect((await replies()).map((row) => row.kind)).toEqual(['keep'])
  })

  test('a bad token, a reply after the window ends, or inbound_email or pack_crowd off writes nothing', async () => {
    const wrong = await inOrg((tx) => issueSubscriberToken(tx, { subscriberId, purpose: 'manage' }))
    const messages = [mail(wrong), mail('A'.repeat(43)), mail(await replyToken(), { receivedAt: ENDS.toISOString() })]
    for (const message of messages) await handleCrowdReply(message)

    const token = await replyToken()
    await setInboundEmail(false)
    await handleCrowdReply(mail(token))
    await setInboundEmail(true)
    await setFlag({ key: 'pack_crowd', enabled: false, orgId })
    await handleCrowdReply(mail(token))
    await setFlag({ key: 'pack_crowd', enabled: true, orgId })

    expect(await replies()).toEqual([])
    for (const message of messages) expect(await drops(message.messageId)).toEqual([])
    await handleCrowdReply(mail(token))
    expect(await replies()).toHaveLength(1)
  })
})

describe('plan-feedback: after a graded Sky window, one email to each subscriber its call notice reached', () => {
  const APP = 'https://app.skyclause.m1ku.tech'
  type Sent = Parameters<EmailTransport['send']>[0]

  /** A mailbox double; `failFor` addresses answer as SES does outside its sandbox's verified list (D48). */
  function mailbox(failFor: string[] = []) {
    const sent: Sent[] = []
    const transport: EmailTransport = {
      async send(message) {
        if (failFor.includes(message.to)) throw new Error('MessageRejected: Email address is not verified.')
        sent.push(message)
        return { providerMessageId: `ses-${sent.length}` }
      }
    }
    return { sent, transport }
  }

  const consumerFor = (transport: EmailTransport) =>
    createRepliesPart({ email: () => transport, appOrigin: () => APP }).events![0]!

  interface Night {
    projectId: string
    windowId: string
    callId: string
  }
  /** A project's window and its sent call, of `pack`. */
  async function graded(o: { pack?: 'sky' | 'crowd'; guest?: boolean; projectId?: string } = {}): Promise<Night> {
    return inOrg(async (tx) => {
      const projectId = o.projectId ?? (await makeProject(tx, { name: 'Bukit Jalil' })).id
      const window = await makeWindow(tx, {
        projectId,
        title: 'CT047 Lecture',
        startsAt: new Date('2026-11-09T06:00:00Z'),
        endsAt: new Date('2026-11-09T08:00:00Z'),
        guest: o.guest ?? false
      })
      const run = await makeRun(tx, { projectId, pack: o.pack ?? 'sky' })
      const bundle = await makeBundle(tx, { runId: run.id })
      const call = await makeCall(tx, { bundleId: bundle.id, windowId: window.id, state: 'sent' })
      return { projectId, windowId: window.id, callId: call.id }
    })
  }
  /** A subscriber whose call notice for `callId` ended in `status`. */
  const recipient = (night: Night, email: string, status: 'sent' | 'delivered' | 'failed', o: object = {}) =>
    inOrg(async (tx) => {
      const row = await makeSubscriber(tx, { projectId: night.projectId, email, confirmedAt: new Date(), ...o })
      await makeNotice(tx, { projectId: night.projectId, callId: night.callId, subscriberId: row.id, status })
      return row
    })
  const grade = async (callId: string, projectId: string, outcome: 'hit' | 'pending' = 'hit') => {
    const { id } = await inOrg((tx) =>
      emitEvent(tx, { projectId, type: 'call.graded', data: { call_id: callId, outcome } })
    )
    return id
  }
  const feedbackNotices = (projectId: string) =>
    sql(`SELECT status, provider_message_id, call_id FROM notice WHERE project_id = $1 AND kind = 'feedback'`, [
      projectId
    ])

  test('the eligible subscribers each get one email with a feedback and an unsubscribe link, recorded as sent', async () => {
    const night = await graded()
    await recipient(night, 'ana@example.edu.my', 'sent')
    await recipient(night, 'ben@example.edu.my', 'delivered', { language: 'ms' })
    await recipient(night, 'cai@example.edu.my', 'failed')
    await recipient(night, 'dan@example.edu.my', 'sent', { unsubscribedAt: new Date() })
    await recipient(night, 'eve@example.edu.my', 'sent', { emailHash: 'hash-of-eve' })
    await inOrg((tx) => makeSuppression(tx, { emailHash: 'hash-of-eve', reason: 'bounce' }))
    await recipient(night, 'fay@example.edu.my', 'sent', { channels: ['ics'] })
    await recipient(night, 'gus@example.edu.my', 'sent', { confirmedAt: null })
    const box = mailbox()

    await dispatchEvent([consumerFor(box.transport)], await grade(night.callId, night.projectId))

    expect(box.sent.map((m) => [m.to, m.subject])).toEqual([
      ['ana@example.edu.my', 'Did the weather change your plan?'],
      ['ben@example.edu.my', 'Adakah cuaca mengubah rancangan anda?']
    ])
    const [ana] = box.sent
    expect(ana).toMatchObject({ from: 'notices', category: 'feedback' })
    const feedback = new RegExp(`${APP}/subscribe/([A-Za-z0-9_-]{43})/feedback`).exec(ana!.text)![1]!
    const unsubscribe = new RegExp(`${APP}/subscribe/([A-Za-z0-9_-]{43})/unsubscribe`).exec(ana!.text)![1]!
    expect(await verifySubscriberToken(feedback, 'feedback')).toMatchObject({ windowId: night.windowId })
    expect(await verifySubscriberToken(unsubscribe, 'unsubscribe')).not.toBeNull()
    expect(ana!.headers).toEqual({
      'List-Unsubscribe': `<${APP}/api/subscribe/${unsubscribe}/unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    })
    expect(await feedbackNotices(night.projectId)).toEqual([
      { status: 'sent', provider_message_id: 'ses-1', call_id: null },
      { status: 'sent', provider_message_id: 'ses-2', call_id: null }
    ])
  })

  test('a redelivered call.graded, or a second graded call of the same window, sends none twice', async () => {
    const night = await graded()
    await recipient(night, 'ana@example.edu.my', 'sent')
    const box = mailbox()
    const consumer = consumerFor(box.transport)
    const first = await grade(night.callId, night.projectId)
    await dispatchEvent([consumer], first)
    await dispatchEvent([consumer], first)

    const later = await inOrg(async (tx) => {
      const [{ bundleId }] = await sql(`SELECT bundle_id AS "bundleId" FROM call WHERE id = $1`, [night.callId])
      return (await makeCall(tx, { bundleId, windowId: night.windowId, state: 'sent' })).id
    })
    await dispatchEvent([consumer], await grade(later, night.projectId))

    expect(box.sent).toHaveLength(1)
    expect(await feedbackNotices(night.projectId)).toHaveLength(1)
  })

  test('Crowd calls, guest windows and pending grades send nothing', async () => {
    const crowd = await graded({ pack: 'crowd' })
    const guest = await graded({ guest: true })
    const pending = await graded()
    for (const night of [crowd, guest, pending]) await recipient(night, `${randomUUID()}@example.edu.my`, 'sent')
    const box = mailbox()
    const consumer = consumerFor(box.transport)

    await dispatchEvent([consumer], await grade(crowd.callId, crowd.projectId))
    await dispatchEvent([consumer], await grade(guest.callId, guest.projectId))
    await dispatchEvent([consumer], await grade(pending.callId, pending.projectId, 'pending'))

    expect(box.sent).toEqual([])
  })

  test('an SES refusal marks that notice failed; the others still send and the event completes', async () => {
    const night = await graded()
    await recipient(night, 'ana@example.edu.my', 'sent')
    await recipient(night, 'unverified@example.com', 'sent')
    await recipient(night, 'ben@example.edu.my', 'sent')
    const box = mailbox(['unverified@example.com'])

    await dispatchEvent([consumerFor(box.transport)], await grade(night.callId, night.projectId))

    expect(box.sent.map((m) => m.to)).toEqual(['ana@example.edu.my', 'ben@example.edu.my'])
    expect((await feedbackNotices(night.projectId)).map((n) => n.status).sort()).toEqual(['failed', 'sent', 'sent'])
  })
})
