// #155 c-approver-alerts: `/api/push-subscriptions[/{id}]` and `/api/push/vapid-public-key` on the #79 §7 test
// database, through createTestApi with the real withTenant. Accounts and memberships are real `auth` rows, and the
// membership lookup reads them, as production's does.
import { randomUUID } from 'node:crypto'
import type { Principal, Role } from '@skyclause/contracts'
import { member, organization, recordAudit, systemPrincipal, withSystem, withTenant, type Tx } from '@skyclause/db'
import { makeMember, makeOrganization, makePushSubscription, makeUser } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import type { MembershipLookup } from '../src/stores'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testDeps, TEST_APP_ORIGIN } from './harness'

const VAPID_PUBLIC_KEY = 'BA3OuKdQLlNKGUWzWI4yKm7YRt0quF-UVkAfYZ7SWlvNp5tA7nFX0M4hesxjmVsfkup-jgs2BUlV4CmdrDML1NE'
const config = (vapidPublicKey?: string) => () => ({
  appEnv: 'test' as const,
  appOrigin: TEST_APP_ORIGIN,
  ipHashKey: 'test-only-ip-hash-key-for-the-harness',
  vapidPublicKey
})
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const dbMembership: MembershipLookup = {
  organisation: (ref) =>
    withSystem('test', async (tx) => {
      const by = UUID.test(ref) ? eq(organization.id, ref) : eq(organization.slug, ref)
      const [org] = await tx.select({ id: organization.id, slug: organization.slug }).from(organization).where(by)
      return org ?? null
    }),
  role: (accountId, orgId) =>
    withSystem('test', async (tx) => {
      const [row] = await tx
        .select({ role: member.role })
        .from(member)
        .where(and(eq(member.userId, accountId), eq(member.organizationId, orgId)))
      return (row?.role as Role | undefined) ?? null
    })
}
const deps = (vapidPublicKey?: string) =>
  testDeps({ withTenant, recordAudit, membership: dbMembership, config: config(vapidPublicKey) })
const { api } = createTestApi({ deps: deps(VAPID_PUBLIC_KEY) })

let home: { id: string; slug: string }
let other: { id: string; slug: string }
beforeAll(async () => {
  home = await makeOrganization()
  other = await makeOrganization()
})

/** A real account that is a member of each organisation given, as a cookie session. */
async function account(...orgs: Array<[{ id: string }, Role]>): Promise<Principal & { kind: 'session' }> {
  const user = await makeUser()
  for (const [org, role] of orgs) await makeMember({ organizationId: org.id, userId: user.id, role })
  return { ...(asSession({ org: 'none', role: 'viewer' }) as Principal & { kind: 'session' }), accountId: user.id }
}
const device = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', // gitleaks:allow -- RFC 8291 §5's published example auth secret.
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/146.0'
})
type Device = ReturnType<typeof device>
type Listed = { data: Array<{ id: string; endpoint: string; auth: string }>; next_cursor: string | null }

/** `org` is sent as `Skyclause-Organization`; `'account'` is what #170's Account › Notifications page sends. */
const register = (as: Principal, body: Device, org?: string) =>
  apiRequest(api, { as, method: 'POST', path: '/api/push-subscriptions', body, org, idempotencyKey: randomUUID() })
const list = async (as: Principal, org?: string, query?: Record<string, string>) => {
  const response = await apiRequest(api, { as, method: 'GET', path: '/api/push-subscriptions', org, query })
  return { status: response.status, body: (await response.json()) as Listed }
}
const remove = (as: Principal, id: string, org?: string) =>
  apiRequest(api, { as, method: 'DELETE', path: `/api/push-subscriptions/${id}`, org })
/** The account's rows with this endpoint, by organisation, read as the superuser. */
const rowsOf = (accountId: string, endpoint: string) =>
  asLogin('postgres', async (c) =>
    (
      await c.query<{ org_id: string }>(
        'SELECT org_id FROM push_subscription WHERE account_id = $1 AND endpoint = $2 ORDER BY org_id',
        [accountId, endpoint]
      )
    ).rows.map((r) => r.org_id)
  )

describe('push subscriptions in one organisation', () => {
  test('a member registers this browser, sees it listed, registers it again without a duplicate and removes it', async () => {
    const approver = await account([home, 'approver'])
    const browser = device()
    const created = await register(approver, browser, home.slug)
    expect(created.status).toBe(201)
    const row = (await created.json()) as Record<string, unknown>
    expect(row).toEqual({ id: expect.any(String), account_id: approver.accountId, ...browser, last_ok_at: null })

    expect((await register(approver, { ...browser, auth: 'rotated-auth-secret' }, home.slug)).status).toBe(201)
    expect((await list(approver, home.slug)).body).toEqual({
      data: [expect.objectContaining({ id: row.id, auth: 'rotated-auth-secret' })],
      next_cursor: null
    })

    expect((await remove(approver, row.id as string, home.slug)).status).toBe(204)
    expect((await list(approver, home.slug)).body.data).toEqual([])
  })

  test('acts in that organisation only', async () => {
    const approver = await account([home, 'approver'], [other, 'approver'])
    const browser = device()
    await register(approver, browser, home.slug)
    expect(await rowsOf(approver.accountId, browser.endpoint)).toEqual([home.id])
    expect((await list(approver, other.slug)).body.data).toEqual([])
  })

  test('one browser holds a subscription in each organisation it registers in', async () => {
    const approver = await account([home, 'approver'], [other, 'approver'])
    const browser = device()
    expect((await register(approver, browser, home.slug)).status).toBe(201)
    expect((await register(approver, browser, other.slug)).status).toBe(201)
    expect(await rowsOf(approver.accountId, browser.endpoint)).toEqual([home.id, other.id].sort())
  })

  test('the list pages by cursor and shows only the caller’s devices', async () => {
    const approver = await account([home, 'approver'])
    const colleague = await account([home, 'approver'])
    for (let i = 0; i < 3; i++) await register(approver, device(), home.slug)
    await register(colleague, device(), home.slug)
    const first = await list(approver, home.slug, { limit: '2' })
    expect(first.body.data).toHaveLength(2)
    const second = await list(approver, home.slug, { limit: '2', cursor: first.body.next_cursor! })
    expect(second.body).toEqual({ data: [expect.any(Object)], next_cursor: null })
  })

  test('another account’s subscription answers 404 and stays', async () => {
    const owner = await account([home, 'approver'])
    const intruder = await account([home, 'admin'])
    const row = (await (await register(owner, device(), home.slug)).json()) as { id: string }
    expect((await remove(intruder, row.id, home.slug)).status).toBe(404)
    expect((await remove(intruder, row.id)).status).toBe(404)
    expect((await list(owner, home.slug)).body.data).toHaveLength(1)
  })

  test('deletePushSubscription answers 404 for another organisation’s rows', async () => {
    const elsewhere = await withTenant({ orgId: other.id, principal: systemPrincipal('test') }, (tx: Tx) =>
      makePushSubscription(tx)
    )
    const as = await account([home, 'owner'])
    await crossOrgCase('deletePushSubscription', { app: api, as, org: home.slug, params: { id: elsewhere.id } }).run()
    expect((await remove(as, elsewhere.id)).status).toBe(404)
    const [left] = await asLogin(
      'postgres',
      async (c) =>
        (await c.query('SELECT count(*)::int AS n FROM push_subscription WHERE id = $1', [elsewhere.id])).rows
    )
    expect(left.n).toBe(1)
  })

  test('an organisation the session isn’t a member of answers 404', async () => {
    const approver = await account([home, 'approver'])
    expect((await list(approver, other.slug)).status).toBe(404)
    expect((await register(approver, device(), other.slug)).status).toBe(404)
  })

  test('API keys get 403 on /api', async () => {
    const response = await apiRequest(api, {
      as: asApiKey({ org: 'alerts-key-org', role: 'admin', scopes: ['read'] }),
      method: 'GET',
      path: '/api/push-subscriptions'
    })
    expect(response.status).toBe(403)
  })
})

describe('push subscriptions from Account › Notifications (no organisation in the request)', () => {
  test.each([
    ['the account segment', 'account'],
    ['no header', undefined]
  ])('with %s, a browser registers in each membership, lists once and is removed from all', async (_, org) => {
    const approver = await account([home, 'approver'], [other, 'viewer'])
    const browser = device()
    const created = await register(approver, browser, org)
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: string }
    expect(await rowsOf(approver.accountId, browser.endpoint)).toEqual([home.id, other.id].sort())

    expect((await list(approver, org)).body).toEqual({
      data: [expect.objectContaining({ id, endpoint: browser.endpoint })],
      next_cursor: null
    })
    expect((await list(approver, home.slug)).body.data).toHaveLength(1)

    expect((await remove(approver, id, org)).status).toBe(204)
    expect(await rowsOf(approver.accountId, browser.endpoint)).toEqual([])
    expect((await remove(approver, id, org)).status).toBe(404)
  })

  test('the list pages across organisations by cursor', async () => {
    const approver = await account([home, 'approver'], [other, 'approver'])
    await register(approver, device(), home.slug)
    await register(approver, device(), other.slug)
    await register(approver, device(), 'account')
    const first = await list(approver, 'account', { limit: '2' })
    expect(first.body.data).toHaveLength(2)
    const second = await list(approver, 'account', { limit: '2', cursor: first.body.next_cursor! })
    expect(second.body.data).toHaveLength(1)
    expect(second.body.next_cursor).toBeNull()
    expect(new Set([...first.body.data, ...second.body.data].map((d) => d.endpoint)).size).toBe(3)
  })

  test('a cursor this API didn’t issue answers 422', async () => {
    const approver = await account([home, 'approver'])
    const forged = Buffer.from(JSON.stringify({ seq: 1 })).toString('base64url')
    expect((await list(approver, 'account', { cursor: forged })).status).toBe(422)
  })

  test('an account with no organisation has nowhere to register: 404', async () => {
    const loner = await account()
    expect((await register(loner, device(), 'account')).status).toBe(404)
    expect((await list(loner, 'account')).body).toEqual({ data: [], next_cursor: null })
  })
})

describe('the VAPID public key', () => {
  test('is VAPID_PUBLIC_KEY for any signed-in session, without an organisation', async () => {
    const response = await apiRequest(api, {
      as: await account(),
      method: 'GET',
      path: '/api/push/vapid-public-key'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ public_key: VAPID_PUBLIC_KEY })
  })

  test('answers 503 while the vapid-keys job hasn’t made one', async () => {
    const unset = createTestApi({ deps: deps(undefined) })
    const response = await apiRequest(unset.api, {
      as: await account(),
      method: 'GET',
      path: '/api/push/vapid-public-key'
    })
    expect(response.status).toBe(503)
  })
})
