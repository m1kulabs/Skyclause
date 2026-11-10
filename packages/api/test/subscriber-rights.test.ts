import { randomUUID } from 'node:crypto'
import { Problem } from '@skyclause/contracts'
import {
  consumeSubscriberToken,
  auditEvent,
  consentRecord,
  crowdReply,
  emailHash,
  issueSubscriberToken,
  notice,
  queueCallNotices,
  recordCrowdReply,
  recordAudit,
  rotateSubscribeLink,
  setFlag,
  subscriber,
  subscriberToken,
  suppression,
  systemPrincipal,
  verifySubscriberToken,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeCall,
  makeConsentRecord,
  makeNotice,
  makeOrganization,
  makeProject,
  makeProjectChannel,
  makeSubscriber,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { apiRequest, createMailbox, createTestApi, testDeps, testOrg } from './harness'

const legal = vi.hoisted(() => ({ version: '2026-11-01' as string | null }))
vi.mock('@skyclause/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@skyclause/contracts')>()
  return {
    ...actual,
    get PRIVACY_NOTICE_VERSION() {
      return legal.version
    },
    consentWriteProblem: () =>
      legal.version === null ? { slug: 'privacy-notice-unpublished' as const, status: 503 as const } : null
  }
})

const KEY = 'test-only-email-hash-key-0123456789abcdef'
const ADDRESS = 'needle-api-110@example.test'
const NEXT_ADDRESS = 'corrected-api-110@example.test'
const org = testOrg(`subscriber-rights-${randomUUID()}`)
const otherOrg = testOrg(`subscriber-rights-other-${randomUUID()}`)
const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

let projectId: string
let windowId: string

beforeAll(async () => {
  await Promise.all([
    makeOrganization({ id: org.id, slug: org.slug }),
    makeOrganization({ id: otherOrg.id, slug: otherOrg.slug })
  ])
  await setFlag({ key: 'pack_crowd', enabled: true, orgId: org.id })
})

beforeEach(async () => {
  vi.stubEnv('EMAIL_HASH_KEY', KEY)
  projectId = await inOrg(org.id, async (tx) => (await makeProject(tx, { name: 'Bukit Jalil' })).id)
  windowId = await inOrg(
    org.id,
    async (tx) =>
      (
        await makeWindow(tx, {
          projectId,
          title: 'Release wave',
          startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 86_400_000 + 7_200_000)
        })
      ).id
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function setup() {
  const mailbox = createMailbox()
  const deps = testDeps({ withTenant, recordAudit, email: mailbox })
  return { ...createTestApi({ deps }), mailbox }
}

describe('subscriber data token routes', () => {
  test('join, confirmation, notice, reply, role correction and erasure leave only the suppression hash', async () => {
    const { api, mailbox } = setup()
    const link = await inOrg(org.id, (tx) => rotateSubscribeLink(tx, projectId))
    const fields = {
      email: ADDRESS,
      role: 'Commuter',
      window_ids: [windowId],
      channels: ['email'],
      language: 'en',
      consent: true,
      notice_version: '2026-11-01'
    }
    const joined = await apiRequest(api, {
      method: 'POST',
      path: `/api/subscribe/${link.token}`,
      idempotencyKey: randomUUID(),
      body: fields
    })
    expect(joined.status).toBe(202)
    expect(mailbox.sent[0]).toMatchObject({ to: ADDRESS, category: 'confirmation' })
    const confirmationUrl = mailbox.sent[0]!.text.match(/https?:\/\/[^\s]+/)![0]!
    const confirmationToken = new URL(confirmationUrl).pathname.match(/\/subscribe\/([^/]+)\/confirm/)![1]!
    expect(
      (await apiRequest(api, { method: 'POST', path: `/api/subscribe/${confirmationToken}/confirm` })).status
    ).toBe(200)

    const preference = await apiRequest(api, {
      method: 'POST',
      path: `/api/subscribe/${link.token}`,
      idempotencyKey: randomUUID(),
      body: fields
    })
    expect(preference.status).toBe(202)
    expect(mailbox.sent[1]).toMatchObject({ to: ADDRESS, category: 'preference_link' })
    const preferenceUrl = mailbox.sent[1]!.text.match(/https?:\/\/[^\s]+/)![0]!
    const manageToken = new URL(preferenceUrl).pathname.match(/\/subscribe\/([^/]+)$/)![1]!
    const [owner] = await inOrg(org.id, (tx) =>
      tx
        .select()
        .from(subscriber)
        .where(and(eq(subscriber.projectId, projectId), eq(subscriber.email, ADDRESS)))
    )

    const call = await inOrg(org.id, (tx) => makeCall(tx, { windowId }))
    const replyToken = await inOrg(org.id, async (tx) => {
      await makeNotice(tx, {
        projectId,
        subscriberId: owner!.id,
        callId: call.id,
        status: 'sent',
        acceptedAt: new Date()
      })
      return issueSubscriberToken(tx, { subscriberId: owner!.id, purpose: 'reply', callId: call.id, windowId })
    })
    const replied = await apiRequest(api, {
      method: 'POST',
      path: `/api/subscribe/${replyToken}/reply`,
      idempotencyKey: randomUUID(),
      body: { kind: 'keep' }
    })
    expect(replied.status).toBe(201)

    const corrected = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${manageToken}/data`,
      body: { role: 'Organiser' }
    })
    expect(corrected.status).toBe(200)
    expect(await corrected.json()).toMatchObject({ subscriber: { id: owner!.id, role: 'Organiser' } })
    const view = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${manageToken}/data` })
    expect(view.status).toBe(200)
    const viewBody = (await view.json()) as {
      subscriber: { email: string; role: string }
      delivery_history: Array<Record<string, unknown>>
      crowd_replies: Array<Record<string, unknown>>
    }
    expect(viewBody.subscriber).toMatchObject({ email: ADDRESS, role: 'Organiser' })
    expect(viewBody.delivery_history).toEqual(
      expect.arrayContaining([expect.objectContaining({ call_id: call.id, channel: 'email', status: 'sent' })])
    )
    expect(viewBody.crowd_replies).toMatchObject([{ call_id: call.id, kind: 'keep' }])
    const exported = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${manageToken}/data/export` })
    expect(exported.headers.get('content-disposition')).toContain('attachment;')
    expect(await exported.json()).toMatchObject({ subscriber: { email: ADDRESS, role: 'Organiser' } })

    expect((await apiRequest(api, { method: 'DELETE', path: `/api/subscribe/${manageToken}/data` })).status).toBe(204)
    const [tombstone] = await inOrg(org.id, (tx) => tx.select().from(subscriber).where(eq(subscriber.id, owner!.id)))
    expect(tombstone).toMatchObject({
      email: `${owner!.id}@deleted.invalid`,
      emailHash: null,
      role: null,
      confirmedAt: null
    })
    const [audits] = await inOrg(org.id, (tx) => tx.select().from(auditEvent).where(eq(auditEvent.targetId, owner!.id)))
    expect(audits).toMatchObject({
      action: 'subscriber.deleted',
      actorType: 'system',
      actorId: 'subscriber-rights',
      before: null,
      after: null
    })
    const [hash] = await inOrg(org.id, (tx) =>
      tx
        .select()
        .from(suppression)
        .where(eq(suppression.emailHash, emailHash(ADDRESS)))
    )
    expect(hash).toMatchObject({ emailHash: emailHash(ADDRESS), reason: 'unsubscribe' })
    expect(await verifySubscriberToken(manageToken, 'manage')).toBeNull()
    expect(await verifySubscriberToken(replyToken, 'reply')).toBeNull()

    const next = await inOrg(org.id, async (tx) => {
      await makeProjectChannel(tx, { projectId, channel: 'email', enabled: true })
      const nextCall = await makeCall(tx, { windowId })
      const queued = await queueCallNotices(tx, {
        projectId,
        bundleId: nextCall.bundleId,
        callId: nextCall.id,
        recipients: [owner!.id],
        languages: ['en']
      })
      const notices = await tx.select().from(notice).where(eq(notice.callId, nextCall.id))
      return { queued, notices }
    })
    expect(next.queued).toEqual({ en: 0, ms: 0 })
    expect(next.notices).toEqual([])

    const needleScan = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<{ table_schema: string; table_name: string; column_name: string }>(`
        SELECT table_schema, table_name, column_name FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND (data_type IN ('text', 'character varying', 'character', 'jsonb') OR udt_name = 'citext')`)
      const terms = rows.map(({ table_schema, table_name, column_name }) => {
        const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`
        const tableName = `${identifier(table_schema)}.${identifier(table_name)}`
        const columnName = identifier(column_name)
        const location = `${table_schema}.${table_name}.${column_name}`.replaceAll("'", "''")
        return `SELECT '${location}' AS location WHERE EXISTS (SELECT 1 FROM ${tableName} WHERE lower(${columnName}::text) LIKE $1 LIMIT 1)`
      })
      const addressRows = await client.query<{ location: string }>(terms.join(' UNION ALL '), [
        `%${ADDRESS.toLowerCase()}%`
      ])
      const hashRows = await client.query<{ location: string }>(terms.join(' UNION ALL '), [`%${emailHash(ADDRESS)}%`])
      return { addressRows: addressRows.rows, hashRows: hashRows.rows }
    })
    expect(needleScan.addressRows).toEqual([])
    expect(needleScan.hashRows).toEqual([{ location: 'public.suppression.email_hash' }])
  })

  test('GET returns only the manage token subscriber and leaves subscriber and token rows unchanged', async () => {
    const { api } = setup()
    const own = await inOrg(org.id, async (tx) => {
      const call = await makeCall(tx, { windowId })
      const current = await makeSubscriber(tx, {
        projectId,
        email: ADDRESS,
        emailHash: emailHash(ADDRESS),
        role: 'Commuter',
        windowIds: [windowId],
        confirmedAt: new Date('2026-11-01T01:00:00Z')
      })
      await makeConsentRecord(tx, { subscriberId: current.id })
      await makeNotice(tx, {
        projectId,
        subscriberId: current.id,
        callId: call.id,
        status: 'sent',
        acceptedAt: new Date()
      })
      const replyToken = await issueSubscriberToken(tx, {
        subscriberId: current.id,
        purpose: 'reply',
        callId: call.id,
        windowId
      })
      const manage = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'manage' })
      return { current, call, replyToken, manage }
    })
    const replyOwner = await verifySubscriberToken(own.replyToken, 'reply')
    expect(replyOwner).not.toBeNull()
    await inOrg(org.id, (tx) =>
      recordCrowdReply(tx, {
        tokenId: replyOwner!.tokenId,
        projectId,
        windowId,
        callId: own.call.id,
        kind: 'keep',
        shiftTo: null,
        at: new Date()
      })
    )
    const other = await inOrg(otherOrg.id, async (tx) => {
      const project = await makeProject(tx, { name: 'Other project' })
      return makeSubscriber(tx, {
        projectId: project.id,
        email: 'other-person@example.test',
        emailHash: emailHash('other-person@example.test')
      })
    })
    const snapshot = () =>
      inOrg(org.id, async (tx) => ({
        subscribers: await tx.select().from(subscriber).where(eq(subscriber.id, own.current.id)),
        tokens: await tx.select().from(subscriberToken).where(eq(subscriberToken.subscriberId, own.current.id)),
        consents: await tx.select().from(consentRecord).where(eq(consentRecord.subscriberId, own.current.id)),
        notices: await tx.select().from(notice).where(eq(notice.subscriberId, own.current.id)),
        replies: await tx
          .select()
          .from(crowdReply)
          .innerJoin(subscriberToken, eq(subscriberToken.id, crowdReply.id))
          .where(eq(subscriberToken.subscriberId, own.current.id)),
        suppressions: await tx
          .select()
          .from(suppression)
          .where(eq(suppression.emailHash, emailHash(ADDRESS))),
        audits: await tx.select().from(auditEvent).where(eq(auditEvent.targetId, own.current.id))
      }))
    const before = await snapshot()

    const response = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}/data` })
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      project_name: 'Bukit Jalil',
      subscriber: { id: own.current.id, email: ADDRESS, role: 'Commuter' }
    })
    expect(JSON.stringify(body)).not.toContain(other.email)
    expect(body).toHaveProperty('consent_records')
    expect(body).toHaveProperty('delivery_history')
    expect(body).toHaveProperty('crowd_replies')
    expect(body.crowd_replies).toHaveLength(1)
    expect(body).toHaveProperty('suppression')

    const again = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}/data` })
    expect(again.status).toBe(200)
    const exported = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}/data/export` })
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-disposition')).toContain('attachment;')
    expect(await snapshot()).toEqual(before)
  })

  test('PATCH changes role, sends address correction to the new address, and replaces it only after confirmation', async () => {
    const { api, mailbox } = setup()
    const own = await inOrg(org.id, async (tx) => {
      const current = await makeSubscriber(tx, {
        projectId,
        email: ADDRESS,
        emailHash: emailHash(ADDRESS),
        role: 'Commuter',
        confirmedAt: new Date()
      })
      const manage = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'manage' })
      return { current, manage }
    })

    const roleResponse = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${own.manage}/data`,
      body: { role: 'Organiser' }
    })
    expect(roleResponse.status).toBe(200)
    expect(((await roleResponse.json()) as { subscriber: { role: string } }).subscriber.role).toBe('Organiser')

    const emailResponse = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${own.manage}/data`,
      body: { email: NEXT_ADDRESS.toUpperCase() }
    })
    expect(emailResponse.status).toBe(200)
    expect(mailbox.sent).toHaveLength(1)
    expect(mailbox.sent[0]).toMatchObject({ to: NEXT_ADDRESS, category: 'confirmation' })
    expect(mailbox.sent[0]?.text).toContain('address_hash=')
    const [stillOld] = await inOrg(org.id, (tx) =>
      tx.select().from(subscriber).where(eq(subscriber.id, own.current.id))
    )
    expect(stillOld).toMatchObject({ email: ADDRESS, emailHash: emailHash(ADDRESS), role: 'Organiser' })

    const link = mailbox.sent[0]!.text.match(/https?:\/\/[^\s]+/)![0]!
    const url = new URL(link)
    const token = url.pathname.match(/\/subscribe\/([A-Za-z0-9_-]{43})\/confirm/)![1]!
    const hash = url.searchParams.get('address_hash')!
    const wrong = await apiRequest(api, {
      method: 'POST',
      path: `/api/subscribe/${token}/confirm`,
      query: { address_hash: hash },
      body: { email: ADDRESS }
    })
    expect(wrong.status).toBe(422)
    const confirmed = await apiRequest(api, {
      method: 'POST',
      path: `/api/subscribe/${token}/confirm`,
      query: { address_hash: hash },
      body: { email: NEXT_ADDRESS }
    })
    expect(confirmed.status).toBe(200)
    const [replaced] = await inOrg(org.id, (tx) =>
      tx.select().from(subscriber).where(eq(subscriber.id, own.current.id))
    )
    expect(replaced).toMatchObject({ email: NEXT_ADDRESS, emailHash: emailHash(NEXT_ADDRESS), role: 'Organiser' })

    const invalid = await apiRequest(api, {
      method: 'PATCH',
      path: `/api/subscribe/${own.manage}/data`,
      body: { window_ids: [windowId] }
    })
    expect(invalid.status).toBe(422)
  })

  test('export is a JSON attachment and delete erases the token owner once', async () => {
    const { api } = setup()
    const own = await inOrg(org.id, async (tx) => {
      const call = await makeCall(tx, { windowId })
      const current = await makeSubscriber(tx, {
        projectId,
        email: ADDRESS,
        emailHash: emailHash(ADDRESS),
        role: 'Commuter'
      })
      const manage = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'manage' })
      const confirm = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'confirm' })
      const reply = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'reply', windowId })
      const unsubscribe = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'unsubscribe' })
      const feedback = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'feedback', windowId })
      await makeNotice(tx, {
        projectId,
        subscriberId: current.id,
        callId: call.id,
        status: 'sent',
        acceptedAt: new Date()
      })
      return { current, call, manage, confirm, reply, unsubscribe, feedback }
    })
    const exported = await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}/data/export` })
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-type')).toContain('application/json')
    expect(exported.headers.get('content-disposition')).toContain('attachment;')
    expect(await exported.json()).toMatchObject({ subscriber: { id: own.current.id, email: ADDRESS } })

    const deleted = await apiRequest(api, { method: 'DELETE', path: `/api/subscribe/${own.manage}/data` })
    expect(deleted.status).toBe(204)
    expect((await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}/data` })).status).toBe(410)
    expect((await apiRequest(api, { method: 'GET', path: `/api/subscribe/${own.manage}` })).status).toBe(410)
    expect((await apiRequest(api, { method: 'POST', path: `/api/subscribe/${own.confirm}/confirm` })).status).toBe(410)
    expect(
      (
        await apiRequest(api, {
          method: 'POST',
          path: `/api/subscribe/${own.reply}/reply`,
          idempotencyKey: randomUUID(),
          body: { kind: 'keep' }
        })
      ).status
    ).toBe(410)
    expect(
      (await apiRequest(api, { method: 'POST', path: `/api/subscribe/${own.unsubscribe}/unsubscribe` })).status
    ).toBe(410)
    expect(
      (
        await apiRequest(api, {
          method: 'POST',
          path: `/api/subscribe/${own.feedback}/feedback`,
          idempotencyKey: randomUUID(),
          body: { answer: true }
        })
      ).status
    ).toBe(410)
    for (const [token, purpose] of [
      [own.manage, 'manage'],
      [own.confirm, 'confirm'],
      [own.reply, 'reply'],
      [own.unsubscribe, 'unsubscribe'],
      [own.feedback, 'feedback']
    ] as const) {
      expect(await verifySubscriberToken(token, purpose)).toBeNull()
    }

    const { audits, hashes } = await inOrg(org.id, async (tx) => ({
      audits: await tx.select().from(auditEvent).where(eq(auditEvent.targetId, own.current.id)),
      hashes: await tx
        .select()
        .from(suppression)
        .where(eq(suppression.emailHash, emailHash(ADDRESS)))
    }))
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'subscriber.deleted',
      actorType: 'system',
      actorId: 'subscriber-rights',
      before: null,
      after: null
    })
    expect(JSON.stringify(audits[0])).not.toContain(ADDRESS)
    expect(hashes).toMatchObject([{ reason: 'unsubscribe', emailHash: emailHash(ADDRESS) }])
    const skipped = await inOrg(org.id, async (tx) => {
      await makeProjectChannel(tx, { projectId, channel: 'email', enabled: true })
      const nextCall = await makeCall(tx, { windowId })
      const queued = await queueCallNotices(tx, {
        projectId,
        bundleId: nextCall.bundleId,
        callId: nextCall.id,
        recipients: [own.current.id],
        languages: ['en']
      })
      const rows = await tx.select().from(notice).where(eq(notice.callId, nextCall.id))
      return { queued, rows }
    })
    expect(skipped.queued).toEqual({ en: 0, ms: 0 })
    expect(skipped.rows).toEqual([])
  })

  test('GET, PATCH, DELETE and export return 410 for non-manage, expired, used or unknown tokens', async () => {
    const { api } = setup()
    const own = await inOrg(org.id, async (tx) => {
      const current = await makeSubscriber(tx, { projectId, email: ADDRESS, emailHash: emailHash(ADDRESS) })
      const manage = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'manage' })
      const confirm = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'confirm' })
      const reply = await issueSubscriberToken(tx, { subscriberId: current.id, purpose: 'reply', windowId })
      return { current, manage, confirm, reply }
    })
    const { tokenId } = (await verifySubscriberToken(own.manage, 'manage'))!
    await inOrg(org.id, (tx) =>
      tx
        .update(subscriberToken)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(subscriberToken.id, tokenId))
    )
    const used = await inOrg(org.id, (tx) =>
      issueSubscriberToken(tx, { subscriberId: own.current.id, purpose: 'confirm' })
    )
    const usedData = (await verifySubscriberToken(used, 'confirm'))!
    await inOrg(org.id, (tx) => consumeSubscriberToken(tx, usedData.tokenId))
    const unknown = 'A'.repeat(43)
    for (const token of [own.confirm, own.reply, own.manage, used, unknown]) {
      for (const request of [
        { method: 'GET', suffix: '/data' },
        { method: 'PATCH', suffix: '/data', body: { role: 'Student' } },
        { method: 'DELETE', suffix: '/data' },
        { method: 'GET', suffix: '/data/export' }
      ]) {
        const response = await apiRequest(api, {
          method: request.method,
          path: `/api/subscribe/${token}${request.suffix}`,
          body: request.body
        })
        expect(response.status).toBe(410)
        expect(Problem.safeParse(await response.json()).success).toBe(true)
      }
    }
  })

  test('all four routes return 429 with Retry-After when their IP bucket is over limit', async () => {
    const mailbox = createMailbox()
    const deps = testDeps({
      withTenant,
      recordAudit,
      email: mailbox,
      rateLimits: {
        async hit({ now }) {
          return { count: 121, resetAt: new Date(now.getTime() + 17_000) }
        }
      }
    })
    const { api } = createTestApi({ deps })
    const requests: Array<{ method: string; suffix: string; body?: unknown }> = [
      { method: 'GET', suffix: '/data' },
      { method: 'PATCH', suffix: '/data', body: { role: 'Student' } },
      { method: 'DELETE', suffix: '/data' },
      { method: 'GET', suffix: '/data/export' }
    ]
    for (const request of requests) {
      const response = await apiRequest(api, {
        method: request.method,
        path: `/api/subscribe/not-a-token${request.suffix}`,
        body: request.body
      })
      expect(response.status).toBe(429)
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    }
  })
})
