import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  auditEvent,
  consentRecord,
  crowdReply,
  emailHash,
  eraseSubscriber,
  issueSubscriberToken,
  notice,
  subscriber,
  subscriberToken,
  suppression,
  systemPrincipal,
  verifySubscriberToken,
  withTenant,
  type Tx
} from '../src'
import {
  makeCall,
  makeConsentRecord,
  makeCrowdReply,
  makeNotice,
  makeOrganization,
  makeProject,
  makeSubscriber,
  makeWindow
} from './factories'
import { asLogin } from './harness'

const KEY = 'test-only-email-hash-key-0123456789abcdef'
const ADDRESS = 'needle-110-unique@example.test'
let orgId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: systemPrincipal('test') }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

beforeEach(() => vi.stubEnv('EMAIL_HASH_KEY', KEY))
afterEach(() => vi.unstubAllEnvs())

describe('eraseSubscriber', () => {
  test('tombstones the subscriber, keeps only its hash, deletes every token, and leaves append-only history pseudonymous', async () => {
    const fixture = await inOrg(async (tx) => {
      const project = await makeProject(tx)
      const window = await makeWindow(tx, { projectId: project.id })
      const call = await makeCall(tx, { windowId: window.id })
      const own = await makeSubscriber(tx, {
        projectId: project.id,
        email: ADDRESS,
        emailHash: emailHash(ADDRESS),
        role: 'Commuter',
        windowIds: [window.id],
        channels: ['email'],
        language: 'ms',
        confirmedAt: new Date()
      })
      const manage = await issueSubscriberToken(tx, { subscriberId: own.id, purpose: 'manage' })
      const reply = await issueSubscriberToken(tx, {
        subscriberId: own.id,
        purpose: 'reply',
        callId: call.id,
        windowId: window.id
      })
      await makeConsentRecord(tx, { subscriberId: own.id, language: 'ms' })
      const sent = await makeNotice(tx, {
        projectId: project.id,
        subscriberId: own.id,
        callId: call.id,
        status: 'sent',
        acceptedAt: new Date()
      })
      const replyRow = await makeCrowdReply(tx, { windowId: window.id, callId: call.id })
      return { subscriberId: own.id, projectId: project.id, manage, reply, noticeId: sent.id, replyId: replyRow.id }
    })

    await inOrg((tx) => eraseSubscriber(tx, fixture.subscriberId))

    const [tombstone] = await inOrg((tx) => tx.select().from(subscriber).where(eq(subscriber.id, fixture.subscriberId)))
    expect(tombstone).toMatchObject({
      id: fixture.subscriberId,
      projectId: fixture.projectId,
      email: `${fixture.subscriberId}@deleted.invalid`,
      emailHash: null,
      role: null,
      windowIds: [],
      channels: [],
      language: '',
      confirmedAt: null,
      unsubscribedAt: expect.any(Date)
    })

    const [hashed] = await inOrg((tx) =>
      tx
        .select()
        .from(suppression)
        .where(and(eq(suppression.orgId, orgId), eq(suppression.emailHash, emailHash(ADDRESS))))
    )
    expect(hashed).toMatchObject({ reason: 'unsubscribe', emailHash: emailHash(ADDRESS) })
    expect(await verifySubscriberToken(fixture.manage, 'manage')).toBeNull()
    expect(await verifySubscriberToken(fixture.reply, 'reply')).toBeNull()

    const { tokens, consents, notices, replies, audits } = await inOrg(async (tx) => ({
      tokens: await tx.select().from(subscriberToken).where(eq(subscriberToken.subscriberId, fixture.subscriberId)),
      consents: await tx.select().from(consentRecord).where(eq(consentRecord.subscriberId, fixture.subscriberId)),
      notices: await tx.select().from(notice).where(eq(notice.id, fixture.noticeId)),
      replies: await tx.select().from(crowdReply).where(eq(crowdReply.id, fixture.replyId)),
      audits: await tx
        .select()
        .from(auditEvent)
        .where(and(eq(auditEvent.targetType, 'subscriber'), eq(auditEvent.targetId, fixture.subscriberId)))
    }))
    expect(tokens).toEqual([])
    expect(consents).toHaveLength(1)
    expect(notices).toMatchObject([{ subscriberId: fixture.subscriberId, status: 'sent' }])
    expect(replies).toHaveLength(1)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      actorType: 'system',
      actorId: 'subscriber-rights',
      action: 'subscriber.deleted',
      projectId: fixture.projectId
    })
    expect(audits[0]?.before).toBeNull()
    expect(audits[0]?.after).toBeNull()

    const columns = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<{ table_schema: string; table_name: string; column_name: string }>(`
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          AND (data_type IN ('text', 'character varying', 'character', 'jsonb') OR udt_name = 'citext')
        ORDER BY table_schema, table_name, column_name`)
      const terms = rows.map(({ table_schema, table_name, column_name }) => {
        const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`
        const table = `${identifier(table_schema)}.${identifier(table_name)}`
        const column = identifier(column_name)
        const location = `${table_schema}.${table_name}.${column_name}`.replaceAll("'", "''")
        return `SELECT '${location}' AS location WHERE EXISTS (SELECT 1 FROM ${table} WHERE lower(${column}::text) LIKE $1 LIMIT 1)`
      })
      const needle = await client.query<{ location: string }>(terms.join(' UNION ALL '), [`%${ADDRESS.toLowerCase()}%`])
      const hashRows = await client.query<{ location: string }>(terms.join(' UNION ALL '), [`%${emailHash(ADDRESS)}%`])
      return { needle: needle.rows, hashRows: hashRows.rows }
    })
    expect(columns.needle).toEqual([])
    expect(columns.hashRows).toEqual([{ location: 'public.suppression.email_hash' }])
  })

  test('repeating erasure does not add another audit entry', async () => {
    const own = await inOrg((tx) => makeSubscriber(tx, { email: ADDRESS, emailHash: emailHash(ADDRESS) }))
    await inOrg((tx) => eraseSubscriber(tx, own.id))
    await inOrg((tx) => eraseSubscriber(tx, own.id))
    const rows = await inOrg((tx) =>
      tx
        .select()
        .from(auditEvent)
        .where(and(eq(auditEvent.targetType, 'subscriber'), eq(auditEvent.targetId, own.id)))
    )
    expect(rows).toHaveLength(1)
  })
})
