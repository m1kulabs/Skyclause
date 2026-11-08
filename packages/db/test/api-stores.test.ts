import { randomUUID } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
  completeIdempotencyKey,
  findMembership,
  hitRateLimit,
  releaseIdempotencyKey,
  reserveIdempotencyKey
} from '../src/api'
import { withSystem } from '../src/client'
import { makeMember, makeOrganization, makeUser } from './factories'
import { asLogin, refusal } from './harness'

// f-api's S tables (#79 §3): system reads and writes them, retention sweeps them, nobody else touches them.
describe('grants', () => {
  const statements = (table: string) => ({
    select: `SELECT FROM ${table}`,
    insert: `INSERT INTO ${table} DEFAULT VALUES`,
    update: `UPDATE ${table} SET ${table === 'rate_limit' ? 'count = count' : 'key = key'} WHERE false`,
    delete: `DELETE FROM ${table} WHERE false`
  })

  test('system has every privilege and retention only SELECT and DELETE', async () => {
    for (const table of ['idempotency_key', 'rate_limit']) {
      const { select, insert, update, delete: remove } = statements(table)
      await asLogin('system', async (client) => {
        for (const statement of [select, update, remove]) await client.query(statement)
        // DEFAULT VALUES fails on the NOT NULL columns, not on a missing grant.
        expect(await refusal(client.query(insert))).toMatch(/null value/)
      })
      await asLogin('retention', async (client) => {
        for (const statement of [select, remove]) await client.query(statement)
        for (const statement of [insert, update])
          expect(await refusal(client.query(statement)), `${table}: ${statement}`).toMatch(/permission denied/)
      })
    }
  })

  test('app, auth_app and public_reader can reach neither table', async () => {
    for (const table of ['idempotency_key', 'rate_limit']) {
      for (const login of ['app', 'auth_app'] as const) {
        await asLogin(login, async (client) => {
          expect(await refusal(client.query(`SELECT FROM public.${table}`)), `${login} ${table}`).toMatch(
            /permission denied/
          )
        })
      }
      await asLogin('app', async (client) => {
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE public_reader')
        expect(await refusal(client.query(`SELECT FROM ${table}`)), `public_reader ${table}`).toMatch(
          /permission denied/
        )
        await client.query('ROLLBACK')
      })
    }
  })
})

const at = (iso: string) => new Date(iso)
const key = () => ({ scope: `org:${randomUUID()}`, route: 'POST /v1/projects/:id/windows', key: randomUUID() })
const reserve = (id: ReturnType<typeof key>, requestHash: string, now: Date, ttlMs = 86_400_000) =>
  withSystem('test', (tx) =>
    reserveIdempotencyKey(tx, { ...id, requestHash, expiresAt: new Date(now.getTime() + ttlMs) }, now)
  )

describe('idempotency keys', () => {
  test('reserve, then hold the pending key, then replay its response', async () => {
    const id = key()
    const now = at('2026-11-09T02:00:00Z')
    expect(await reserve(id, 'hash-a', now)).toBeNull()
    expect(await reserve(id, 'hash-a', now)).toEqual({
      requestHash: 'hash-a',
      expiresAt: at('2026-11-10T02:00:00Z'),
      response: null
    })
    const response = { status: 201, contentType: 'application/json', location: '/v1/windows/w-1', body: '{"id":"w-1"}' }
    await withSystem('test', (tx) => completeIdempotencyKey(tx, { ...id, requestHash: 'hash-a' }, response))
    expect(await reserve(id, 'hash-b', now)).toMatchObject({ requestHash: 'hash-a', response })
  })

  test('release frees a pending key, but never a completed one or another request’s', async () => {
    const id = key()
    const now = at('2026-11-09T02:00:00Z')
    await reserve(id, 'hash-a', now)
    await withSystem('test', (tx) => releaseIdempotencyKey(tx, { ...id, requestHash: 'hash-other' }))
    expect(await reserve(id, 'hash-a', now)).toMatchObject({ requestHash: 'hash-a', response: null })
    await withSystem('test', (tx) => releaseIdempotencyKey(tx, { ...id, requestHash: 'hash-a' }))
    expect(await reserve(id, 'hash-b', now)).toBeNull()

    const response = { status: 200, contentType: null, location: null, body: '' }
    await withSystem('test', (tx) => completeIdempotencyKey(tx, { ...id, requestHash: 'hash-b' }, response))
    await withSystem('test', (tx) => releaseIdempotencyKey(tx, { ...id, requestHash: 'hash-b' }))
    expect(await reserve(id, 'hash-b', now)).toMatchObject({ response })
  })

  test('an expired key is taken over with every column reset', async () => {
    const id = key()
    const first = at('2026-11-09T02:00:00Z')
    await reserve(id, 'hash-a', first)
    const response = { status: 201, contentType: 'application/json', location: '/x', body: '{}' }
    await withSystem('test', (tx) => completeIdempotencyKey(tx, { ...id, requestHash: 'hash-a' }, response))

    const later = at('2026-11-10T02:00:00Z')
    expect(await reserve(id, 'hash-b', later)).toBeNull()
    expect(await reserve(id, 'hash-b', later)).toEqual({
      requestHash: 'hash-b',
      expiresAt: at('2026-11-11T02:00:00Z'),
      response: null
    })
  })
})

describe('rate limits', () => {
  test('counts within a window and starts a new one once it ends', async () => {
    const bucket = `ip:${randomUUID()}`
    const hit = (iso: string) => withSystem('test', (tx) => hitRateLimit(tx, { bucket, windowS: 60, now: at(iso) }))
    expect(await hit('2026-11-09T02:00:00Z')).toEqual({ count: 1, resetAt: at('2026-11-09T02:01:00Z') })
    expect(await hit('2026-11-09T02:00:30Z')).toEqual({ count: 2, resetAt: at('2026-11-09T02:01:00Z') })
    expect(await hit('2026-11-09T02:01:00Z')).toEqual({ count: 1, resetAt: at('2026-11-09T02:02:00Z') })
  })
})

describe('membership', () => {
  test('finds an organisation by slug or ID with the account’s role, and null for strangers', async () => {
    const org = await makeOrganization()
    const user = await makeUser()
    await makeMember({ organizationId: org.id, userId: user.id, role: 'approver' })
    const stranger = await makeUser()
    const find = (ref: string, accountId: string | null) =>
      withSystem('test', (tx) => findMembership(tx, ref, accountId))

    expect(await find(org.slug, user.id)).toEqual({ id: org.id, slug: org.slug, role: 'approver' })
    expect(await find(org.id, user.id)).toEqual({ id: org.id, slug: org.slug, role: 'approver' })
    expect(await find(org.slug, stranger.id)).toEqual({ id: org.id, slug: org.slug, role: null })
    expect(await find(org.slug, null)).toEqual({ id: org.id, slug: org.slug, role: null })
    expect(await find('no-such-organisation', user.id)).toBeNull()
    expect(await find(randomUUID(), user.id)).toBeNull()
  })
})
