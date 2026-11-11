// #159 c-evidence email intake at the router seam: the `onInbound` registration is captured and its handler called with
// messages as the delivery router hands them over (`email.test.ts` posts them through `POST /resend/webhook`). Rows
// come from factories on the #79 §7 test database.
import { randomUUID } from 'node:crypto'
import type { InboundMessage } from '@skyclause/delivery'
import { withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeFeatureFlag,
  makeMember,
  makeOrganization,
  makeProject,
  makeSubscriber,
  makeUser
} from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { createEvidencePart, EVIDENCE_RECIPIENT, handleEvidenceMail } from '../src/evidence'
import { evidenceSpanOf } from '../src/evidence/span'

const DOMAIN = 'in.skyclause.m1ku.tech'
const NOW = new Date('2026-11-05T07:00:00Z')
const options = { inboundDomain: () => DOMAIN, now: () => NOW }
const PASS = { spf: 'PASS', dkim: 'PASS', dmarc: 'PASS' } as const

let org: { id: string; slug: string }
let project: { id: string; slug: string }
let subscriberEmail: string
let memberEmail: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: org.id, principal: memberOf(org.id) }, fn)
const requests = () =>
  inOrg((tx) => tx.query.evidenceRequest.findMany({ where: (r, { eq }) => eq(r.projectId, project.id) }))
const drops = (messageId: string) =>
  inOrg((tx) =>
    tx.query.auditEvent.findMany({
      where: (a, { and, eq }) => and(eq(a.targetType, 'inbound_email'), eq(a.targetId, messageId))
    })
  )

function mail(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    recipient: `${org.slug}.${project.slug}@${DOMAIN}`,
    from: subscriberEmail,
    subject: 'Evidence request',
    text: 'evidence for 2 Nov 14:00–16:30\n\nThanks',
    messageId: randomUUID(),
    receivedAt: '2026-11-05T06:59:30.000Z',
    verdicts: PASS,
    ...overrides
  }
}

beforeAll(async () => {
  const row = await makeOrganization()
  org = { id: row.id, slug: row.slug }
  project = await inOrg(async (tx) => {
    const created = await makeProject(tx, { timeZone: 'Asia/Kuala_Lumpur' })
    subscriberEmail = `Team.Lead+${randomUUID().slice(0, 6)}@example.test`
    await makeSubscriber(tx, { projectId: created.id, email: subscriberEmail.toLowerCase(), confirmedAt: NOW })
    return { id: created.id, slug: created.slug }
  })
  memberEmail = `${randomUUID()}@example.test`
  const account = await makeUser({ email: memberEmail, emailVerified: true })
  await makeMember({ organizationId: org.id, userId: account.id, role: 'approver' })
})

test('the part registers one `evidence` consumer for {org}.{project}@…, never a Crowd reply’s r+{token}@…', () => {
  const registered: Array<{ recipient: RegExp; consumer: string }> = []
  const part = createEvidencePart({ register: (recipient, consumer) => registered.push({ recipient, consumer }) })
  expect(part.owner).toBe('c-evidence')
  expect(registered.map((r) => r.consumer)).toEqual(['evidence'])
  expect(EVIDENCE_RECIPIENT.test('campus.bukit-jalil@in.skyclause.m1ku.tech')).toBe(true)
  expect(EVIDENCE_RECIPIENT.test('r+0123abcd@in.skyclause.m1ku.tech')).toBe(false)
})

test('with inbound_email off, mail makes no request and no audit row', async () => {
  const message = mail()
  await handleEvidenceMail(message, options)
  expect(await requests()).toEqual([])
  expect(await drops(message.messageId)).toEqual([])
})

describe('with inbound_email on', () => {
  beforeAll(async () => {
    await withSystem('evidence-test', (tx) => makeFeatureFlag(tx, { key: 'inbound_email', orgId: null, enabled: true }))
  })

  test('a confirmed subscriber’s mail becomes one request waiting for approval, however often it is delivered', async () => {
    const message = mail()
    await handleEvidenceMail(message, options)
    await handleEvidenceMail(message, options)
    const made = (await requests()).filter((r) => r.messageId === message.messageId)
    expect(made).toHaveLength(1)
    expect(made[0]).toMatchObject({
      requesterKind: 'subscriber',
      via: 'email',
      leavesOrg: true,
      replyChannel: 'email',
      status: 'waiting_for_approval',
      spanFrom: new Date('2026-11-02T06:00:00Z'),
      spanTo: new Date('2026-11-02T08:30:00Z'),
      receivedAt: new Date(message.receivedAt),
      draftedAt: NOW,
      approvedAt: null,
      repliedAt: null
    })
    expect(made[0]!.subscriberId).not.toBeNull()
    const notices = await inOrg((tx) =>
      tx.query.notice.findMany({ where: (n, { eq }) => eq(n.idempotencyKey, `evidence_reply:${made[0]!.id}`) })
    )
    expect(notices).toEqual([])
  })

  test('DMARC passing is enough, whatever SPF and DKIM say', async () => {
    const message = mail({ verdicts: { spf: 'FAIL', dkim: 'NONE', dmarc: 'PASS' } })
    await handleEvidenceMail(message, options)
    expect((await requests()).map((r) => r.messageId)).toContain(message.messageId)
  })

  test('a member’s account address gets the reply in-app at once', async () => {
    const message = mail({ from: memberEmail.toUpperCase(), text: '', subject: 'Evidence for 2 November 14:00-16:30' })
    await handleEvidenceMail(message, options)
    const [made] = (await requests()).filter((r) => r.messageId === message.messageId)
    expect(made).toMatchObject({
      requesterKind: 'member',
      via: 'email',
      leavesOrg: false,
      replyChannel: 'in_app',
      status: 'replied',
      repliedAt: NOW
    })
  })

  test.each<[string, Partial<InboundMessage>, string]>([
    ['an unknown sender', { from: 'stranger@example.test' }, 'unknown_sender'],
    // A forged From: SPF passes for the sending server's own domain, which DMARC finds unaligned.
    ['SPF passing with DMARC failing', { verdicts: { spf: 'PASS', dkim: 'FAIL', dmarc: 'FAIL' } }, 'verdicts'],
    // A sender domain that publishes no DMARC record.
    ['SPF and DKIM passing with no DMARC result', { verdicts: { ...PASS, dmarc: 'NONE' } }, 'verdicts'],
    ['no result at all', { verdicts: { spf: 'NONE', dkim: 'NONE', dmarc: 'NONE' } }, 'verdicts'],
    ['a run request, pilot-only (CAL-1)', { text: 'call for tomorrow' }, 'no_span'],
    ['a first line naming no span', { text: 'hello\nevidence for 2 Nov 14:00–16:30' }, 'no_span']
  ])('%s is dropped with one audit row and no request', async (_name, overrides, reason) => {
    const message = mail(overrides)
    await handleEvidenceMail(message, options)
    await handleEvidenceMail(message, options)
    expect((await requests()).filter((r) => r.messageId === message.messageId)).toEqual([])
    const audits = await drops(message.messageId)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'evidence_request.dropped',
      actorType: 'system',
      actorId: 'evidence-inbound',
      projectId: project.id,
      after: { reason }
    })
  })

  test('an unconfirmed or unsubscribed subscriber, or one of another project, is an unknown sender', async () => {
    const other = await inOrg(async (tx) => {
      const elsewhere = await makeProject(tx)
      const confirmedElsewhere = await makeSubscriber(tx, { projectId: elsewhere.id, confirmedAt: NOW })
      const unconfirmed = await makeSubscriber(tx, { projectId: project.id })
      const unsubscribed = await makeSubscriber(tx, { projectId: project.id, confirmedAt: NOW, unsubscribedAt: NOW })
      return [confirmedElsewhere.email, unconfirmed.email, unsubscribed.email]
    })
    for (const from of other) {
      const message = mail({ from })
      await handleEvidenceMail(message, options)
      expect((await drops(message.messageId))[0]).toMatchObject({ after: { reason: 'unknown_sender' } })
    }
  })

  test('mail for another domain or an unknown project is logged only: there is no organisation to audit in', async () => {
    for (const recipient of [`${org.slug}.${project.slug}@elsewhere.example.test`, `${org.slug}.nope@${DOMAIN}`]) {
      const message = mail({ recipient })
      await handleEvidenceMail(message, options)
      expect((await requests()).filter((r) => r.messageId === message.messageId)).toEqual([])
      expect(await drops(message.messageId)).toEqual([])
    }
  })
})

describe('the request line names a span in the project’s zone', () => {
  const o = { receivedAt: NOW, timeZone: 'Asia/Kuala_Lumpur' }
  const span = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) })

  test.each([
    ['evidence for 2 Nov 14:00–16:30', span('2026-11-02T06:00:00Z', '2026-11-02T08:30:00Z')],
    ['Evidence for 2 November 14:00 - 16:30', span('2026-11-02T06:00:00Z', '2026-11-02T08:30:00Z')],
    ['evidence for 2 Nov 2026 14:00-16:30', span('2026-11-02T06:00:00Z', '2026-11-02T08:30:00Z')],
    ['evidence for 5 Nov 08:00 to 09:15', span('2026-11-05T00:00:00Z', '2026-11-05T01:15:00Z')],
    // Without a year, the latest such date not after receipt: 20 December is last year's.
    ['evidence for 20 Dec 10:00–11:00', span('2025-12-20T02:00:00Z', '2025-12-20T03:00:00Z')]
  ])('%s', async (line, expected) => {
    expect(await withSystem('evidence-test', (tx) => evidenceSpanOf(tx, line, o))).toEqual(expected)
  })

  test.each([
    'call for tomorrow',
    'evidence for 2 Nov 16:30–14:00',
    'evidence for 31 Nov 10:00–11:00',
    'evidence for 2 Novz 14:00–16:30',
    'evidence for 2 Nov 25:00–26:00',
    'please send evidence for 2 Nov 14:00–16:30'
  ])('%s names none', async (line) => {
    expect(await withSystem('evidence-test', (tx) => evidenceSpanOf(tx, line, o))).toBeNull()
  })
})
