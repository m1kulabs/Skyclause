// #157 (c-subscribers): the §1 subscriber token and address-hash functions, on the #79 §7 test database.
import type { Principal } from '@skyclause/contracts'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  consumeSubscriberToken,
  emailHash,
  issueSubscriberToken,
  resolveSubscribeToken,
  rotateSubscribeLink,
  subscriberToken,
  systemPrincipal,
  verifySubscriberToken,
  withTenant,
  type Tx
} from '../src'
import { makeOrganization, makeProject, makeSubscriber, makeWindow } from './factories'
import { asLogin } from './harness'

const KEY = 'test-only-email-hash-key-0123456789abcdef'
let orgId: string
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, principal: Principal = systemPrincipal('test')) =>
  withTenant({ orgId, principal }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
beforeEach(() => vi.stubEnv('EMAIL_HASH_KEY', KEY))
afterEach(() => vi.unstubAllEnvs())

describe('emailHash', () => {
  test('is HMAC-SHA-256 hex under EMAIL_HASH_KEY of the trimmed, lower-cased address', () => {
    // openssl dgst -sha256 -hmac "$KEY" over "ana@example.test"
    const expected = 'acc13f3265fdb2163f5091572b75deef7d82fe9b8887d45c617c89648b399027'
    expect(emailHash('ana@example.test')).toBe(expected)
    expect(emailHash('  Ana@Example.TEST \n')).toBe(expected)
  })

  test('refuses to hash without a key of at least 32 characters', () => {
    vi.stubEnv('EMAIL_HASH_KEY', '')
    expect(() => emailHash('ana@example.test')).toThrow(/EMAIL_HASH_KEY/)
    vi.stubEnv('EMAIL_HASH_KEY', 'short')
    expect(() => emailHash('ana@example.test')).toThrow(/EMAIL_HASH_KEY/)
  })
})

describe('subscriber tokens', () => {
  test('a token is 32 random bytes in base64url, stored only as its SHA-256', async () => {
    const subscriber = await inOrg((tx) => makeSubscriber(tx))
    const token = await inOrg((tx) => issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: 'manage' }))
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    const stored = await asLogin('postgres', (client) =>
      client.query<{ token_hash: string }>('SELECT token_hash FROM subscriber_token WHERE subscriber_id = $1', [
        subscriber.id
      ])
    )
    expect(stored.rows).toHaveLength(1)
    expect(stored.rows[0]!.token_hash).not.toContain(token)
    expect(stored.rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test('verify returns the organisation, project, subscriber, token, call and window IDs', async () => {
    const { subscriber, window } = await inOrg(async (tx) => {
      const project = await makeProject(tx)
      return {
        subscriber: await makeSubscriber(tx, { projectId: project.id }),
        window: await makeWindow(tx, { projectId: project.id })
      }
    })
    const token = await inOrg((tx) =>
      issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: 'feedback', windowId: window.id })
    )
    const verified = await verifySubscriberToken(token, 'feedback')
    expect(verified).toEqual({
      orgId,
      projectId: subscriber.projectId,
      subscriberId: subscriber.id,
      tokenId: expect.any(String),
      callId: null,
      windowId: window.id
    })
  })

  test('expired, used, wrong-purpose and unknown tokens all verify as null', async () => {
    const subscriber = await inOrg((tx) => makeSubscriber(tx))
    const issue = (purpose: 'confirm' | 'manage') =>
      inOrg((tx) => issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose }))

    const expired = await issue('manage')
    const verified = await verifySubscriberToken(expired, 'manage')
    await inOrg((tx) =>
      tx
        .update(subscriberToken)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(subscriberToken.id, verified!.tokenId))
    )
    expect(await verifySubscriberToken(expired, 'manage')).toBeNull()

    const used = await issue('confirm')
    const { tokenId } = (await verifySubscriberToken(used, 'confirm'))!
    expect(await inOrg((tx) => consumeSubscriberToken(tx, tokenId))).toBe(true)
    expect(await inOrg((tx) => consumeSubscriberToken(tx, tokenId))).toBe(false)
    expect(await verifySubscriberToken(used, 'confirm')).toBeNull()

    expect(await verifySubscriberToken(await issue('manage'), 'unsubscribe')).toBeNull()
    expect(await verifySubscriberToken('A'.repeat(43), 'manage')).toBeNull()
  })

  test('confirm lasts 7 days, manage 30 and unsubscribe for the subscriber’s life', async () => {
    const subscriber = await inOrg((tx) => makeSubscriber(tx))
    const expiry = async (purpose: 'confirm' | 'manage' | 'unsubscribe') => {
      const token = await inOrg((tx) => issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose }))
      const { tokenId } = (await verifySubscriberToken(token, purpose))!
      const [row] = await inOrg((tx) =>
        tx
          .select({ createdAt: subscriberToken.createdAt, expiresAt: subscriberToken.expiresAt })
          .from(subscriberToken)
          .where(eq(subscriberToken.id, tokenId))
      )
      return row!.expiresAt && (row!.expiresAt.getTime() - row!.createdAt.getTime()) / 86_400_000
    }
    expect(await expiry('confirm')).toBe(7)
    expect(await expiry('manage')).toBe(30)
    expect(await expiry('unsubscribe')).toBeNull()
  })
})

describe('subscribe links', () => {
  test('a rotated link resolves to its project and the earlier one stops resolving', async () => {
    const project = await inOrg((tx) => makeProject(tx))
    const first = await inOrg((tx) => rotateSubscribeLink(tx, project.id))
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(await resolveSubscribeToken(first.token)).toEqual({
      kind: 'link',
      orgId,
      projectId: project.id,
      linkId: first.id
    })

    const second = await inOrg((tx) => rotateSubscribeLink(tx, project.id))
    expect(await resolveSubscribeToken(first.token)).toBeNull()
    expect(await resolveSubscribeToken(second.token)).toMatchObject({ kind: 'link', projectId: project.id })
  })

  test('a subscriber token resolves with its purpose', async () => {
    const subscriber = await inOrg((tx) => makeSubscriber(tx))
    const token = await inOrg((tx) => issueSubscriberToken(tx, { subscriberId: subscriber.id, purpose: 'unsubscribe' }))
    expect(await resolveSubscribeToken(token)).toMatchObject({
      kind: 'subscriber',
      purpose: 'unsubscribe',
      orgId,
      projectId: subscriber.projectId,
      subscriberId: subscriber.id
    })
  })
})
