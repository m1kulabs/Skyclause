// #155 c-approver-alerts: `/api/push-subscriptions[/{id}]` and `/api/push/vapid-public-key` on the #79 §7 test
// database, through createTestApi with the real withTenant (only the auth seams are doubles).
import { randomUUID } from 'node:crypto'
import { recordAudit, withTenant } from '@skyclause/db'
import { makeOrganization, makePushSubscription } from '@skyclause/db/test/factories/index'
import { asLogin, memberOf } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  apiRequest,
  asApiKey,
  asSession,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg,
  TEST_APP_ORIGIN
} from './harness'

const ORG = 'alerts-home'
const OTHER = 'alerts-other'
const VAPID_PUBLIC_KEY = 'BA3OuKdQLlNKGUWzWI4yKm7YRt0quF-UVkAfYZ7SWlvNp5tA7nFX0M4hesxjmVsfkup-jgs2BUlV4CmdrDML1NE'
const config = (vapidPublicKey?: string) => () => ({
  appEnv: 'test' as const,
  appOrigin: TEST_APP_ORIGIN,
  ipHashKey: 'test-only-ip-hash-key-for-the-harness',
  vapidPublicKey
})
const { api } = createTestApi({ deps: testDeps({ withTenant, recordAudit, config: config(VAPID_PUBLIC_KEY) }) })

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

const device = () => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', // gitleaks:allow -- RFC 8291 §5's published example auth secret.
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/146.0'
})
const register = (as: ReturnType<typeof asSession>, body: ReturnType<typeof device>, org = ORG) =>
  apiRequest(api, { as, method: 'POST', path: '/api/push-subscriptions', body, org, idempotencyKey: randomUUID() })
const list = (as: ReturnType<typeof asSession>, org = ORG) =>
  apiRequest(api, { as, method: 'GET', path: '/api/push-subscriptions', org })
const remove = (as: ReturnType<typeof asSession>, id: string, org = ORG) =>
  apiRequest(api, { as, method: 'DELETE', path: `/api/push-subscriptions/${id}`, org })

describe('push subscriptions', () => {
  test('a member registers this browser, sees it listed, registers it again without a duplicate and removes it', async () => {
    const approver = asSession({ org: ORG, role: 'approver' })
    const browser = device()
    const created = await register(approver, browser)
    expect(created.status).toBe(201)
    const row = (await created.json()) as Record<string, unknown>
    expect(row).toEqual({
      id: expect.any(String),
      account_id: (approver as { accountId: string }).accountId,
      ...browser,
      last_ok_at: null
    })

    expect((await register(approver, { ...browser, auth: 'rotated-auth-secret' })).status).toBe(201)
    const listed = (await (await list(approver)).json()) as {
      data: Array<{ id: string; auth: string }>
      next_cursor: null
    }
    expect(listed).toEqual({
      data: [expect.objectContaining({ id: row.id, auth: 'rotated-auth-secret' })],
      next_cursor: null
    })

    expect((await remove(approver, row.id as string)).status).toBe(204)
    expect(((await (await list(approver)).json()) as { data: unknown[] }).data).toEqual([])
  })

  test('the list pages by cursor and shows only the caller’s devices', async () => {
    const approver = asSession({ org: ORG, role: 'approver' })
    const other = asSession({ org: ORG, role: 'approver' })
    for (let i = 0; i < 3; i++) await register(approver, device())
    await register(other, device())
    const first = (await (
      await apiRequest(api, {
        as: approver,
        method: 'GET',
        path: '/api/push-subscriptions',
        org: ORG,
        query: { limit: '2' }
      })
    ).json()) as { data: unknown[]; next_cursor: string }
    expect(first.data).toHaveLength(2)
    const second = (await (
      await apiRequest(api, {
        as: approver,
        method: 'GET',
        path: '/api/push-subscriptions',
        org: ORG,
        query: { limit: '2', cursor: first.next_cursor }
      })
    ).json()) as { data: unknown[]; next_cursor: null }
    expect(second).toEqual({ data: [expect.any(Object)], next_cursor: null })
  })

  test('another account’s subscription answers 404 and stays', async () => {
    const owner = asSession({ org: ORG, role: 'approver' })
    const intruder = asSession({ org: ORG, role: 'admin' })
    const row = (await (await register(owner, device())).json()) as { id: string }
    const response = await remove(intruder, row.id)
    expect(response.status).toBe(404)
    expect(((await (await list(owner)).json()) as { data: unknown[] }).data).toHaveLength(1)
  })

  test('a browser that another organisation already gets alerts on answers 422 naming that', async () => {
    const browser = device()
    expect((await register(asSession({ org: OTHER, role: 'approver' }), browser, OTHER)).status).toBe(201)
    const response = await register(asSession({ org: ORG, role: 'approver' }), browser)
    expect(response.status).toBe(422)
    expect(((await response.json()) as { detail: string }).detail).toMatch(/another organisation/)
  })

  test('without Skyclause-Organization the routes answer 400 organization-required', async () => {
    const approver = asSession({ org: ORG, role: 'approver' })
    const response = await apiRequest(api, { as: approver, method: 'GET', path: '/api/push-subscriptions' })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { type: string }).type).toMatch(/organization-required/)
  })

  test('API keys get 403 on /api', async () => {
    const response = await apiRequest(api, {
      as: asApiKey({ org: ORG, role: 'admin', scopes: ['read'] }),
      method: 'GET',
      path: '/api/push-subscriptions',
      org: ORG
    })
    expect(response.status).toBe(403)
  })

  test('deletePushSubscription answers 404 for another organisation’s rows', async () => {
    const elsewhere = await withTenant({ orgId: testOrg(OTHER).id, principal: memberOf(testOrg(OTHER).id) }, (tx) =>
      makePushSubscription(tx)
    )
    const as = asSession({ org: ORG, role: 'owner' })
    await crossOrgCase('deletePushSubscription', { app: api, as, org: ORG, params: { id: elsewhere.id } }).run()
    const [left] = await asLogin(
      'postgres',
      async (c) =>
        (await c.query('SELECT count(*)::int AS n FROM push_subscription WHERE id = $1', [elsewhere.id])).rows
    )
    expect(left.n).toBe(1)
  })

  test('listPushSubscriptions answers 404 for an organisation the session isn’t a member of', async () => {
    const response = await list(asSession({ org: ORG, role: 'owner' }), OTHER)
    expect(response.status).toBe(404)
  })
})

describe('the VAPID public key', () => {
  test('is VAPID_PUBLIC_KEY for any signed-in session, without an organisation', async () => {
    const response = await apiRequest(api, {
      as: asSession({ org: ORG, role: 'viewer' }),
      method: 'GET',
      path: '/api/push/vapid-public-key'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ public_key: VAPID_PUBLIC_KEY })
  })

  test('answers 503 while the vapid-keys job hasn’t made one', async () => {
    const unset = createTestApi({ deps: testDeps({ withTenant, recordAudit, config: config(undefined) }) })
    const response = await apiRequest(unset.api, {
      as: asSession({ org: ORG, role: 'viewer' }),
      method: 'GET',
      path: '/api/push/vapid-public-key'
    })
    expect(response.status).toBe(503)
  })
})
