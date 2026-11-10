import { randomUUID } from 'node:crypto'
import { recordAudit, withSystem, withTenant, member } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { makeOrganization, makeUser } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { problemType } from '../src'
import { apiRequest, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

const ORG = 'orgs-home'
const OTHER = 'orgs-other'

const deps = testDeps({ withTenant, recordAudit })
const { api } = createTestApi({ deps })

const owner = asSession({ org: ORG, role: 'owner' })
const editor = asSession({ org: ORG, role: 'editor' })
const guest = asSession({ org: ORG, role: 'viewer', guest: true })
const otherOwner = asSession({ org: OTHER, role: 'owner' })

beforeAll(async () => {
  await makeOrganization({ id: testOrg(ORG).id, slug: ORG })
  await makeOrganization({ id: testOrg(OTHER).id, slug: OTHER })
})

describe('POST /api/orgs (#102)', () => {
  test('creates an organisation for any signed-in account, idempotent on Idempotency-Key', async () => {
    const account = await makeUser()
    if (owner.kind !== 'session') throw new Error('test session expected')
    const creator = { ...owner, accountId: account.id }
    const idempotencyKey = randomUUID()
    const first = await apiRequest(api, {
      as: creator,
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey,
      body: { name: 'River Watch', slug: 'river-watch' }
    })
    expect(first.status).toBe(201)
    const created = (await first.json()) as Record<string, unknown>
    expect(created).toMatchObject({
      name: 'River Watch',
      slug: 'river-watch',
      plan: 'community',
      deletion_requested_at: null,
      purge_after: null,
      onboarding_skipped: false,
      ai_fallback_enabled: false,
      allow_member_ai_keys: false
    })
    expect(typeof created.id).toBe('string')

    const replay = await apiRequest(api, {
      as: creator,
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey,
      body: { name: 'River Watch', slug: 'river-watch' }
    })
    expect(replay.status).toBe(201)
    expect(((await replay.json()) as Record<string, unknown>).id).toBe(created.id)

    const found = await withSystem('orgs-test', (tx) =>
      tx
        .select({ userId: member.userId, role: member.role })
        .from(member)
        .where(eq(member.organizationId, created.id as string))
    )
    expect(found).toEqual([{ userId: account.id, role: 'owner' }])
  })

  test('reserved slugs are refused as slug-reserved; taken slugs as slug-taken (ORG-1)', async () => {
    const reserved = await apiRequest(api, {
      as: owner,
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey: randomUUID(),
      body: { name: 'New', slug: 'new' }
    })
    expect(reserved.status).toBe(409)
    expect(await reserved.json()).toMatchObject({
      type: problemType('slug-reserved'),
      detail: 'new is reserved. Choose another slug.'
    })

    await makeOrganization({ slug: 'taken-org' })
    const taken = await apiRequest(api, {
      as: owner,
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey: randomUUID(),
      body: { name: 'Taken again', slug: 'taken-org' }
    })
    expect(taken.status).toBe(409)
    expect(await taken.json()).toMatchObject({
      type: problemType('slug-taken'),
      detail: 'taken-org is taken. Choose another slug.'
    })
  })

  test('a guest gets 403 and a signed-out request gets 401', async () => {
    const refused = await apiRequest(api, {
      as: guest,
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey: randomUUID(),
      body: { name: 'Guest org', slug: 'guest-org' }
    })
    expect(refused.status).toBe(403)

    const signedOut = await apiRequest(api, {
      method: 'POST',
      path: '/api/orgs',
      idempotencyKey: randomUUID(),
      body: { name: 'Nobody org', slug: 'nobody-org' }
    })
    expect(signedOut.status).toBe(401)
  })
})

describe('GET /api/me/memberships (#102)', () => {
  test('lists the session organisations with slug, name and role', async () => {
    const account = await makeUser()
    const first = await makeOrganization({ slug: 'membership-first', name: 'First org' })
    const second = await makeOrganization({ slug: 'membership-second', name: 'Second org' })
    await authDatabase()
      .insert(member)
      .values([
        { organizationId: first.id, userId: account.id, role: 'owner', createdAt: new Date('2026-11-08T01:00:00Z') },
        { organizationId: second.id, userId: account.id, role: 'viewer', createdAt: new Date('2026-11-08T02:00:00Z') }
      ])
    const session = asSession({ org: ORG, role: 'owner' })
    if (session.kind !== 'session') throw new Error('test session expected')
    const response = await apiRequest(api, {
      as: { ...session, accountId: account.id },
      method: 'GET',
      path: '/api/me/memberships'
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: unknown[]; next_cursor: null }
    expect(body.next_cursor).toBeNull()
    expect(body.data).toMatchObject([
      {
        org_id: first.id,
        account_id: account.id,
        role: 'owner',
        org_name: 'First org',
        org_slug: 'membership-first'
      },
      {
        org_id: second.id,
        account_id: account.id,
        role: 'viewer',
        org_name: 'Second org',
        org_slug: 'membership-second'
      }
    ])
  })
})

describe('PATCH /api/orgs/{org} (#102)', () => {
  test('renames the organisation; the slug stays read-only', async () => {
    await makeOrganization({ id: testOrg('orgs-rename').id, slug: 'orgs-rename', name: 'Old name' })
    const renamer = asSession({ org: 'orgs-rename', role: 'owner' })
    const response = await apiRequest(api, {
      as: renamer,
      method: 'PATCH',
      path: '/api/orgs/orgs-rename',
      body: { name: 'New name' }
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ name: 'New name', slug: 'orgs-rename' })

    const withSlug = await apiRequest(api, {
      as: renamer,
      method: 'PATCH',
      path: '/api/orgs/orgs-rename',
      body: { name: 'New name', slug: 'other' }
    })
    expect(withSlug.status).toBe(422)
  })

  test('refuses an Editor with 403', async () => {
    const response = await apiRequest(api, {
      as: editor,
      method: 'PATCH',
      path: `/api/orgs/${ORG}`,
      body: { name: 'Editor name' }
    })
    expect(response.status).toBe(403)
  })

  test('answers 404 for another organisation', async () => {
    await crossOrgCase('updateOrganisation', {
      app: api,
      as: otherOwner,
      params: { org: ORG },
      body: { name: 'Other name' }
    }).run()
  })
})
