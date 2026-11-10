import { randomUUID } from 'node:crypto'
import { createRoute, V1_ROUTES, type SkyclauseRoute } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import type { Registry } from '../src/app'
import { HANDLERS } from '../src/routes'
import { apiRequest, asApiKey, asOAuth, asSession, createTestApi, crossOrgCase } from './harness'

const ORG = 'api-keys-home'
const OTHER = 'api-keys-other'
const base = `/api/orgs/${ORG}/api-keys`
const body = { name: 'CI deploy', scopes: ['read'], expires_in_days: 30 }
type KeyResponse = {
  id: string
  key: string
  name: string
  prefix: string
  scopes: string[]
  created_at: string
  expires_at: string
  last_used_at: string | null
  created_by: string
}
const clauseDraftEdit = createRoute({
  method: 'get',
  path: '/v1/test/clause-draft-edit',
  operationId: 'getTestClauseDraftEdit',
  responses: { 204: { description: 'Admitted.' } },
  x: { owner: 'test', statement: 'clause_draft.edit', idempotent: false }
})

test('create shows the key once; an idempotent replay returns metadata without it', async () => {
  const { api, deps } = createTestApi()
  const actor = asSession({ org: ORG, role: 'owner' })
  const request = () =>
    apiRequest(api, {
      as: actor,
      method: 'POST',
      path: base,
      body,
      idempotencyKey: 'create-key-once'
    })

  const first = await request()
  expect(first.status).toBe(201)
  const created = (await first.json()) as KeyResponse
  expect(created).toMatchObject({
    name: body.name,
    scopes: body.scopes,
    prefix: 'skc_',
    created_by: actor.accountId,
    last_used_at: null
  })
  expect(created.key).toMatch(/^skc_/)
  expect(new Date(created.expires_at).getTime() - new Date(created.created_at).getTime()).toBe(30 * 86_400_000)

  const replay = await request()
  expect(replay.status).toBe(201)
  expect(await replay.json()).not.toHaveProperty('key')
  expect(deps.audits).toHaveLength(1)
  expect(deps.audits[0]).toMatchObject({ action: 'api_key.created', target: { id: created.id } })
  expect(deps.audits[0]).toMatchObject({
    after: {
      api_key_id: created.id,
      prefix: 'skc_',
      scopes: ['read'],
      expires_at: created.expires_at
    }
  })
  expect(JSON.stringify(deps.audits)).not.toContain(created.key)
  expect(deps.tracked).toEqual([{ name: 'api_key_created', props: { scopes: ['read'], expiry_days: 30 } }])
  expect(JSON.stringify([...deps.idempotency.records.values()])).not.toContain(created.key)
})

test.each([0, 366])('create refuses expires_in_days=%i', async (expires_in_days) => {
  const { api } = createTestApi()
  const response = await apiRequest(api, {
    as: asSession({ org: ORG, role: 'owner' }),
    method: 'POST',
    path: base,
    body: { ...body, expires_in_days },
    idempotencyKey: `bad-expiry-${expires_in_days}`
  })
  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ type: expect.stringContaining('validation-failed') })
})

test('a Viewer cannot create draft scopes, while an Editor can create an admin key with its role cap', async () => {
  const { api, v1 } = createTestApi({
    v1: [...(V1_ROUTES as readonly SkyclauseRoute[]), clauseDraftEdit as SkyclauseRoute],
    handlers: {
      ...HANDLERS,
      getTestClauseDraftEdit: { handler: (c: { body: (body: null, status: 204) => Response }) => c.body(null, 204) }
    } as unknown as Registry['handlers']
  })
  const viewer = asSession({ org: ORG, role: 'viewer' })
  for (const scope of ['draft', 'admin']) {
    const refused = await apiRequest(api, {
      as: viewer,
      method: 'POST',
      path: base,
      body: { ...body, scopes: [scope] },
      idempotencyKey: `viewer-${scope}`
    })
    expect(refused.status, scope).toBe(422)
    expect(await refused.json()).toMatchObject({ errors: [{ pointer: '/scopes' }] })
  }
  const viewerRead = await apiRequest(api, {
    as: viewer,
    method: 'POST',
    path: base,
    body,
    idempotencyKey: 'viewer-read'
  })
  expect(viewerRead.status).toBe(201)

  const editor = asSession({ org: ORG, role: 'editor' })
  const accepted = await apiRequest(api, {
    as: editor,
    method: 'POST',
    path: base,
    body: { ...body, scopes: ['admin'] },
    idempotencyKey: 'editor-admin'
  })
  expect(accepted.status).toBe(201)

  const editorKey = asApiKey({ org: ORG, role: 'editor', scopes: ['admin'] })
  const sources = await apiRequest(v1, {
    as: editorKey,
    method: 'POST',
    path: `/v1/projects/${randomUUID()}/sources`,
    body: {}
  })
  expect(sources.status).toBe(403)

  const draft = await apiRequest(v1, {
    as: editorKey,
    method: 'GET',
    path: '/v1/test/clause-draft-edit'
  })
  expect(draft.status).toBe(204)
})

test('organisation lists show all keys to admins and only the caller’s keys to other members', async () => {
  const { api } = createTestApi()
  const owner = asSession({ org: ORG, role: 'owner' })
  const editor = asSession({ org: ORG, role: 'editor' })
  const create = (as: ReturnType<typeof asSession>, name: string, idempotencyKey: string) =>
    apiRequest(api, {
      as,
      method: 'POST',
      path: base,
      body: { ...body, name },
      idempotencyKey
    })
  await create(owner, 'Owner key', 'owner-key')
  await create(editor, 'Editor key', 'editor-key')

  const all = await apiRequest(api, { as: owner, method: 'GET', path: base })
  expect(all.status).toBe(200)
  expect(((await all.json()) as { data: KeyResponse[] }).data).toHaveLength(2)

  const own = await apiRequest(api, { as: editor, method: 'GET', path: base })
  expect(own.status).toBe(200)
  expect(((await own.json()) as { data: KeyResponse[] }).data.map((key) => key.name)).toEqual(['Editor key'])
})

test('the account list spans organisations and contains only the signed-in account’s keys', async () => {
  const { api } = createTestApi()
  const first = asSession({ org: ORG, role: 'editor' })
  const sameAccountInOtherOrg = asSession({ org: OTHER, role: 'editor', accountId: first.accountId })
  // The test membership lookup records this same account in both organisations.
  await apiRequest(api, {
    as: first,
    method: 'POST',
    path: base,
    body: { ...body, name: 'Home key' },
    idempotencyKey: 'home-key'
  })
  await apiRequest(api, {
    as: sameAccountInOtherOrg,
    method: 'POST',
    path: `/api/orgs/${OTHER}/api-keys`,
    body: { ...body, name: 'Other key' },
    idempotencyKey: 'other-key'
  })
  const listed = await apiRequest(api, { as: first, method: 'GET', path: '/api/me/api-keys' })
  expect(listed.status).toBe(200)
  expect(((await listed.json()) as { data: KeyResponse[] }).data.map((key) => key.name).sort()).toEqual([
    'Home key',
    'Other key'
  ])
})

test('only the creator or an Owner or Admin can revoke', async () => {
  const { api, deps } = createTestApi()
  const creator = asSession({ org: ORG, role: 'editor' })
  const approver = asSession({ org: ORG, role: 'approver' })
  const admin = asSession({ org: ORG, role: 'admin' })
  const created = await apiRequest(api, {
    as: creator,
    method: 'POST',
    path: base,
    body,
    idempotencyKey: 'revoke-target'
  })
  const key = (await created.json()) as KeyResponse

  const denied = await apiRequest(api, { as: approver, method: 'DELETE', path: `${base}/${key.id}` })
  expect(denied.status, await denied.clone().text()).toBe(403)
  const revoked = await apiRequest(api, { as: admin, method: 'DELETE', path: `${base}/${key.id}` })
  expect(revoked.status).toBe(204)
  const ownKeyResponse = await apiRequest(api, {
    as: creator,
    method: 'POST',
    path: base,
    body: { ...body, name: 'Creator revokes own key' },
    idempotencyKey: 'creator-revoke-target'
  })
  const ownKey = (await ownKeyResponse.json()) as KeyResponse
  const ownRevoked = await apiRequest(api, { as: creator, method: 'DELETE', path: `${base}/${ownKey.id}` })
  expect(ownRevoked.status).toBe(204)
  expect(deps.audits).toHaveLength(4)
  expect(deps.audits[0]).toMatchObject({ action: 'api_key.created' })
  expect(deps.audits[1]).toMatchObject({ action: 'api_key.revoked', target: { id: key.id } })
  expect(deps.audits[1]).toMatchObject({
    after: {
      api_key_id: key.id,
      prefix: 'skc_',
      scopes: ['read'],
      expires_at: key.expires_at,
      revoked: true
    }
  })
  expect(deps.tracked).toHaveLength(2)
})

test('API keys and OAuth tokens are refused by every API key management operation', async () => {
  const { api } = createTestApi()
  const keys = [
    { method: 'GET', path: base },
    { method: 'POST', path: base, body, idempotencyKey: 'key-create' },
    { method: 'DELETE', path: `${base}/${randomUUID()}` },
    { method: 'GET', path: '/api/me/api-keys' },
    { method: 'POST', path: '/api/me/api-keys', body, idempotencyKey: 'me-create' },
    { method: 'DELETE', path: `/api/me/api-keys/${randomUUID()}` }
  ] as const
  for (const as of [asApiKey({ org: ORG, role: 'owner', scopes: ['admin'] }), asOAuth({ org: ORG, role: 'owner' })]) {
    for (const operation of keys) {
      const response = await apiRequest(api, { as, ...operation })
      expect(response.status).toBe(403)
    }
  }
})

test('create needs a recent session', async () => {
  const { api } = createTestApi()
  const old = asSession({ org: ORG, role: 'owner', authenticatedAt: new Date('2026-11-07T13:00:00Z') })
  const recent = await apiRequest(api, {
    as: old,
    method: 'POST',
    path: base,
    body,
    idempotencyKey: 'old-session'
  })
  expect(recent.status).toBe(401)
  expect(await recent.json()).toMatchObject({ type: expect.stringContaining('reauth-required') })
})

test('organisation routes answer 404 for another organisation and its keys', async () => {
  const { api } = createTestApi()
  const owner = asSession({ org: ORG, role: 'owner' })
  const otherOwner = asSession({ org: OTHER, role: 'owner' })
  const created = await apiRequest(api, {
    as: otherOwner,
    method: 'POST',
    path: `/api/orgs/${OTHER}/api-keys`,
    body,
    idempotencyKey: 'other-org-key'
  })
  const elsewhere = (await created.json()) as KeyResponse

  for (const { run } of [
    crossOrgCase('listOrganisationApiKeys', { app: api, as: owner, params: { org: OTHER } }),
    crossOrgCase('createOrganisationApiKey', { app: api, as: owner, params: { org: OTHER }, body }),
    crossOrgCase('revokeOrganisationApiKey', { app: api, as: owner, params: { org: OTHER, id: elsewhere.id } }),
    crossOrgCase('revokeOrganisationApiKey', { app: api, as: owner, params: { org: ORG, id: elsewhere.id } })
  ]) {
    await run()
  }

  const listed = await apiRequest(api, { as: otherOwner, method: 'GET', path: `/api/orgs/${OTHER}/api-keys` })
  expect(((await listed.json()) as { data: KeyResponse[] }).data.map((key) => key.id)).toEqual([elsewhere.id])
})

test('a key is limited to 600 requests a minute and the 601st response has Retry-After', async () => {
  const { v1 } = createTestApi()
  const key = asApiKey({ org: ORG, role: 'owner', scopes: ['read'] })
  let last: Response | undefined
  for (let i = 0; i < 601; i++) {
    last = await apiRequest(v1, { as: key, method: 'GET', path: '/v1/me' })
  }
  expect(last?.status).toBe(429)
  expect(last?.headers.get('Retry-After')).toMatch(/^\d+$/)
})

test('key management operations require a signed-in session', async () => {
  const { api } = createTestApi()
  for (const operation of [
    { method: 'GET', path: base },
    { method: 'POST', path: base, body, idempotencyKey: 'unsigned-org-create' },
    { method: 'GET', path: '/api/me/api-keys' },
    { method: 'POST', path: '/api/me/api-keys', body, idempotencyKey: 'unsigned-me-create' }
  ] as const) {
    const response = await apiRequest(api, operation)
    expect(response.status).toBe(401)
  }
})
