// #94 through #93's middleware: real credentials in the test database, resolved by f-auth's resolvePrincipal and
// judged by its can, as the composition root registers them.
import '@skyclause/auth/test/harness/database'
import { requireHumanSession, type ApiApp } from '@skyclause/api'
import { apiRequest, createTestApi, testDeps } from '@skyclause/api/testing'
import { apiKeyManager, authHandler, can, oauthManagement, resolvePrincipal } from '@skyclause/auth'
import { findMembership, recordAudit, track, withSystem, withTenant } from '@skyclause/db'
import { asLogin, expectOneAudit } from '@skyclause/db/test/harness/index'
import {
  addMember,
  makeAccount,
  makeApiKey,
  makeGrant,
  makeGuestTokenFor,
  makeOrg,
  makeShareLinkFor,
  mintAccessToken,
  revokeSession,
  signIn,
  TEST_AUTH_ENV
} from '@skyclause/auth/testing'
import { API_ROUTES, ApiKey, createRoute, SCOPE_STATEMENTS, V1_ROUTES, type SkyclauseRoute } from '@skyclause/contracts'
import { beforeAll, describe, expect, test, vi } from 'vitest'
import { GET } from '../../app/v1/[[...route]]/route'
import { GET as getOAuthMetadata } from '../../app/.well-known/oauth-authorization-server/route'
import { POST as submitOAuthConsent } from '../../app/api/auth/oauth/consent/route'

const slug = async (response: Response) => ((await response.json()) as { type: string }).type.split('/').at(-1)
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const APP = TEST_AUTH_ENV.APP_ORIGIN

// A built `/v1` route behind requireHumanSession, as #93's own tests mount one.
const humanOnly = createRoute({
  method: 'get',
  path: '/v1/test/human-only',
  operationId: 'getTestHumanOnly',
  responses: { 204: { description: 'Admitted' } },
  x: { owner: 'test', statement: 'any', idempotent: false }
})
const built = (c: { body: (body: null, status: 204) => Response }) => c.body(null, 204)

const keyRead = createRoute({
  method: 'get',
  path: '/v1/test/key-read',
  operationId: 'getTestKeyRead',
  responses: {
    200: {
      description: 'The key is live.',
      content: { 'application/json': { schema: ApiKey } }
    }
  },
  x: { owner: 'test', statement: 'project.view', idempotent: false }
})
const keyReadHandler = (c: { json: (body: ApiKey, status: 200) => Response }) =>
  c.json(
    {
      id: 'key-read',
      name: 'key read test',
      prefix: 'skc_',
      scopes: ['read'],
      created_at: '2026-11-08T02:00:00Z',
      expires_at: '2026-12-08T02:00:00Z',
      last_used_at: null,
      created_by: 'key-creator'
    },
    200
  )

const clauseDraftEdit = createRoute({
  method: 'get',
  path: '/v1/test/clause-draft-edit',
  operationId: 'getTestClauseDraftEdit',
  responses: { 204: { description: 'Admitted.' } },
  x: { owner: 'test', statement: 'clause_draft.edit', idempotent: false }
})
const clauseDraftEditHandler = (c: { body: (body: null, status: 204) => Response }) => c.body(null, 204)
const sourcesManage = createRoute({
  method: 'get',
  path: '/v1/test/sources-manage',
  operationId: 'getTestSourcesManage',
  responses: { 204: { description: 'Admitted.' } },
  x: { owner: 'test', statement: 'sources.manage', idempotent: false }
})

let org: { id: string; slug: string }
let readKey: { id: string; key: string }
const credentials: Record<string, Record<string, string>> = {}
let apps: { v1: ApiApp; api: ApiApp }
let keyManagement: { v1: ApiApp; api: ApiApp; deps: ReturnType<typeof testDeps> }
let keyCreatorSession: { cookie: string }
let keyCreatorId: string

beforeAll(async () => {
  org = await makeOrg()
  const editor = await makeAccount()
  await addMember(org.id, editor.id, 'editor')
  const keyCreator = await makeAccount()
  await addMember(org.id, keyCreator.id, 'editor')
  keyCreatorId = keyCreator.id
  keyCreatorSession = await signIn(keyCreator.id)
  const guest = await makeAccount({ anonymous: true })
  const grants = {
    api: await makeGrant({ orgId: org.id, accountId: editor.id, scopes: ['read', 'draft'], resource: 'api' }),
    mcp: await makeGrant({ orgId: org.id, accountId: editor.id, scopes: ['read', 'draft'], resource: 'mcp' })
  }
  const token = (resource: 'api' | 'mcp') =>
    mintAccessToken({
      accountId: editor.id,
      clientId: grants[resource].clientId,
      resource,
      scope: 'read draft',
      grantId: grants[resource].id
    })
  readKey = await makeApiKey({ orgId: org.id, accountId: editor.id, scopes: ['read'] })
  credentials['API key'] = bearer(readKey.key)
  credentials['guest token'] = bearer(
    (await makeGuestTokenFor({ orgId: org.id, accountId: guest.id, scopes: ['read', 'draft'] })).token
  )
  credentials['OAuth token for /v1'] = bearer(await token('api'))
  credentials['OAuth token for /mcp'] = bearer(await token('mcp'))
  credentials['share link'] = {
    Cookie: `sc_share=${(await makeShareLinkFor({ orgId: org.id, access: 'reviewer' })).token}`
  }
  credentials['guest session'] = { Cookie: (await signIn(guest.id)).cookie }
  credentials['member session'] = { Cookie: (await signIn(editor.id)).cookie }
  apps = createTestApi({
    deps: testDeps({ resolvePrincipal, can }),
    v1: [
      ...(V1_ROUTES as readonly SkyclauseRoute[]),
      humanOnly as SkyclauseRoute,
      keyRead as SkyclauseRoute,
      clauseDraftEdit as SkyclauseRoute,
      sourcesManage as SkyclauseRoute
    ],
    handlers: {
      getTestHumanOnly: { handler: built, middleware: [requireHumanSession] },
      getTestKeyRead: { handler: keyReadHandler },
      getTestClauseDraftEdit: { handler: clauseDraftEditHandler },
      getTestSourcesManage: { handler: clauseDraftEditHandler }
    }
  })
  keyManagement = createTestApi({
    deps: testDeps({
      resolvePrincipal,
      can,
      apiKeys: apiKeyManager,
      withTenant,
      recordAudit,
      track,
      membership: {
        lookup: (ref, accountId) => withSystem('test:api-key-membership', (tx) => findMembership(tx, ref, accountId))
      }
    })
  })
})

test('a read key gets 403 insufficient-scope on a draft route', async () => {
  const route = (V1_ROUTES as readonly SkyclauseRoute[]).find((r) =>
    SCOPE_STATEMENTS.draft.includes(r['x-skyclause'].statement as never)
  )!
  const response = await apiRequest(apps.v1, {
    method: route.method.toUpperCase(),
    path: route.path.replace(/\{[^}]+\}/g, crypto.randomUUID()),
    headers: credentials['API key'],
    body: route.method === 'get' ? undefined : {},
    idempotencyKey: route['x-skyclause'].idempotent ? crypto.randomUUID() : undefined
  })
  expect(response.status).toBe(403)
  expect(await slug(response)).toBe('insufficient-scope')
})

test('an MCP resource token is unauthenticated on the API surface', async () => {
  const response = await apiRequest(apps.v1, {
    method: 'GET',
    path: '/v1/projects',
    headers: credentials['OAuth token for /mcp']
  })
  expect(response.status).toBe(401)
  expect(await slug(response)).toBe('unauthenticated')
})

describe('requireHumanSession', () => {
  test('admits a member’s session and refuses keys, guests and OAuth with 403', async () => {
    const get = (headers: Record<string, string>) =>
      apiRequest(apps.v1, { method: 'GET', path: '/v1/test/human-only', headers })
    expect((await get(credentials['member session']!)).status).toBe(204)
    for (const kind of ['API key', 'guest token', 'guest session', 'OAuth token for /v1']) {
      const response = await get(credentials[kind]!)
      expect(response.status, kind).toBe(403)
      expect(await slug(response), kind).toBe('insufficient-scope')
    }
  })

  test('a revoked session’s next request gets 401', async () => {
    const account = await makeAccount()
    const session = await signIn(account.id)
    const get = () =>
      apiRequest(apps.v1, { method: 'GET', path: '/v1/test/human-only', headers: { Cookie: session.cookie } })
    expect((await get()).status).toBe(204)
    await revokeSession(session.token)
    const response = await get()
    expect(response.status).toBe(401)
    expect(await slug(response)).toBe('unauthenticated')
  })
})

test('every /api route answers 403 to API keys, guest tokens, OAuth tokens and share links', async () => {
  const admitted: string[] = []
  for (const route of API_ROUTES as readonly SkyclauseRoute[]) {
    const path = route.path.replace(/\{[^}]+\}/g, crypto.randomUUID())
    for (const kind of ['API key', 'guest token', 'OAuth token for /v1', 'OAuth token for /mcp', 'share link']) {
      const response = await apiRequest(apps.api, {
        method: route.method.toUpperCase(),
        path,
        headers: { ...credentials[kind], Origin: 'https://app.skyclause.m1ku.tech' }
      })
      if (response.status !== 403 || (await slug(response)) !== 'insufficient-scope') {
        admitted.push(`${route.method} ${route.path} as ${kind}: ${response.status}`)
      }
    }
  }
  expect(admitted).toEqual([])
  expect(API_ROUTES.length).toBeGreaterThan(100)
}, 120_000)

test('a full PKCE token gets 403 on bundle approval and every first-party /api route', async () => {
  const account = await makeAccount()
  await addMember(org.id, account.id, 'editor')
  const session = await signIn(account.id)
  const apiResource = `${TEST_AUTH_ENV.API_ORIGIN}/v1`
  const registered = await authHandler(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth2/register`, {
      method: 'POST',
      headers: {
        Origin: TEST_AUTH_ENV.APP_ORIGIN,
        'Content-Type': 'application/json',
        'cf-connecting-ip': '192.0.2.61'
      },
      body: JSON.stringify({
        client_name: 'Full-flow API boundary test',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        require_pkce: true,
        resources: [apiResource]
      })
    })
  )
  expect(registered.status).toBe(201)
  const clientId = ((await registered.json()) as { client_id: string }).client_id
  const verifier = 'f4R8yW1uQ5mK9nP2aS7dF4hJ0xV6cB8zT1eL5qN3wA'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    scope: 'read draft',
    state: 'api-boundary',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: apiResource
  })
  const started = await authHandler(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth2/authorize?${params}`, {
      headers: { Cookie: session.cookie }
    })
  )
  expect(started.status).toBe(302)
  const oauthQuery = new URL(started.headers.get('Location')!, TEST_AUTH_ENV.APP_ORIGIN).search.slice(1)
  const consent = await submitOAuthConsent(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth/consent`, {
      method: 'POST',
      headers: { Cookie: session.cookie, Origin: TEST_AUTH_ENV.APP_ORIGIN },
      body: new URLSearchParams([
        ['oauth_query', oauthQuery],
        ['org_id', org.id],
        ['all_projects', 'true'],
        ['scopes', 'read'],
        ['scopes', 'draft'],
        ['accept', 'true']
      ])
    })
  )
  expect(consent.status).toBe(303)
  const code = new URL(consent.headers.get('Location')!, TEST_AUTH_ENV.APP_ORIGIN).searchParams.get('code')!
  const tokenResponse = await authHandler(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: 'https://client.example/callback',
        code_verifier: verifier,
        resource: apiResource
      }).toString()
    })
  )
  expect(tokenResponse.status).toBe(200)
  const token = ((await tokenResponse.json()) as { access_token: string }).access_token
  const headers = { Authorization: `Bearer ${token}` }
  const granted = await resolvePrincipal(new Request(`${apiResource}/projects`, { headers }), { surface: 'v1' })
  expect(granted?.kind).toBe('oauth')
  if (granted?.kind !== 'oauth') throw new Error('The consent token did not resolve to its grant.')
  const approval = await apiRequest(apps.api, {
    method: 'POST',
    path: '/api/bundles/11111111-1111-7111-8111-111111111111/approve',
    org: org.slug,
    headers,
    body: { review_hash: 'full-pkce-hash', calls: [] }
  })
  expect(approval.status).toBe(403)
  const admitted: string[] = []
  for (const route of API_ROUTES as readonly SkyclauseRoute[]) {
    const response = await apiRequest(apps.api, {
      method: route.method.toUpperCase(),
      path: route.path.replace(/\{[^}]+\}/g, crypto.randomUUID()),
      headers,
      body: route.method === 'get' ? undefined : {},
      idempotencyKey: route['x-skyclause'].idempotent ? crypto.randomUUID() : undefined
    })
    if (response.status !== 403 || (await slug(response)) !== 'insufficient-scope') {
      admitted.push(`${route.method} ${route.path}: ${response.status}`)
    }
  }
  expect(admitted).toEqual([])

  const revoker = await resolvePrincipal(
    new Request(`${TEST_AUTH_ENV.API_ORIGIN}/v1/projects`, { headers: { Cookie: session.cookie } }),
    { surface: 'v1' }
  )
  expect(revoker?.kind).toBe('session')
  await oauthManagement.revokeGrant({ orgId: org.id, id: granted.grantId, now: new Date(), principal: revoker! })
  const revokedRequest = await apiRequest(apps.v1, { method: 'GET', path: '/v1/projects', headers })
  expect(revokedRequest.status).toBe(401)
  expect(await slug(revokedRequest)).toBe('unauthenticated')
}, 120_000)

test('the composition root registers f-auth: the /v1 Route Handler no longer answers 501 naming f-auth', async () => {
  for (const headers of [{}, credentials['API key']!]) {
    const response = await GET(new Request('https://api.skyclause.m1ku.tech/v1/me', { headers }))
    expect(await response.json()).not.toMatchObject({ owner: 'f-auth' })
  }
})

test('RFC 8414 authorization metadata is served at the app-host well-known route', async () => {
  const response = await getOAuthMetadata(
    new Request(`${TEST_AUTH_ENV.APP_ORIGIN}/.well-known/oauth-authorization-server`)
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('application/json')
  expect(await response.json()).toMatchObject({
    issuer: TEST_AUTH_ENV.APP_ORIGIN,
    authorization_endpoint: `${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth2/authorize`,
    token_endpoint: `${TEST_AUTH_ENV.APP_ORIGIN}/api/auth/oauth2/token`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'draft'],
    authorization_response_iss_parameter_supported: true
  })
})

test('SET-6: a key can read, updates last_used_at, and a revoked key fails on its next request', async () => {
  const get = () => apiRequest(apps.v1, { method: 'GET', path: '/v1/test/key-read', headers: credentials['API key']! })

  const first = await get()
  expect(first.status).toBe(200)
  const used = await asLogin('postgres', (client) =>
    client.query<{ last_request: Date | null }>('SELECT last_request FROM auth.apikey WHERE id = $1', [readKey.id])
  )
  expect(used.rows[0]?.last_request).toBeInstanceOf(Date)

  await asLogin('postgres', (client) =>
    client.query('UPDATE auth.apikey SET enabled = false WHERE id = $1', [readKey.id])
  )
  const revoked = await get()
  expect(revoked.status).toBe(401)
  expect(await slug(revoked)).toBe('unauthenticated')
})

test('create returns the secret once, stores a hash, lists metadata, audits and revokes immediately', async () => {
  const headers = { Cookie: keyCreatorSession.cookie, Origin: APP }
  const input = { name: 'Integration CI key', scopes: ['read'], expires_in_days: 30 }
  const ingest = await makeApiKey({ orgId: org.id, accountId: keyCreatorId, scopes: ['ingest'], sourceId: 'camera-1' })
  const create = () =>
    apiRequest(keyManagement.api, {
      method: 'POST',
      path: `/api/orgs/${org.id}/api-keys`,
      headers: { ...headers, 'Idempotency-Key': 'integration-api-key-create' },
      body: input
    })
  const createdResponse = await create()
  expect(createdResponse.status, await createdResponse.clone().text()).toBe(201)
  const created = await createdResponse.json()
  expect(created).toMatchObject({
    name: input.name,
    scopes: input.scopes,
    prefix: 'skc_',
    created_by: keyCreatorId,
    last_used_at: null
  })
  expect(created.key).toMatch(/^skc_/)

  const replay = await create()
  expect(replay.status).toBe(201)
  expect(await replay.json()).not.toHaveProperty('key')
  expect(JSON.stringify([...keyManagement.deps.idempotency.records.values()])).not.toContain(created.key)

  const stored = await asLogin('postgres', (client) =>
    client.query<{ key: string; last_request: Date | null }>(
      'SELECT key, last_request FROM auth.apikey WHERE id = $1',
      [created.id]
    )
  )
  const { createHash } = await import('node:crypto')
  expect(stored.rows[0]?.key).toBe(createHash('sha256').update(created.key).digest('base64url'))
  expect(stored.rows[0]?.key).not.toBe(created.key)

  const listed = await apiRequest(keyManagement.api, {
    method: 'GET',
    path: `/api/orgs/${org.id}/api-keys`,
    headers
  })
  expect(listed.status).toBe(200)
  const listedBody = await listed.json()
  expect(listedBody.data).toContainEqual(
    expect.objectContaining({
      id: created.id,
      name: input.name,
      created_by: keyCreatorId
    })
  )
  expect(listedBody.data).not.toContainEqual(expect.objectContaining({ id: ingest.id }))
  const hiddenIngest = await apiRequest(keyManagement.api, {
    method: 'DELETE',
    path: `/api/orgs/${org.id}/api-keys/${ingest.id}`,
    headers
  })
  expect(hiddenIngest.status).toBe(404)

  const firstUse = await apiRequest(apps.v1, {
    method: 'GET',
    path: '/v1/test/key-read',
    headers: bearer(created.key)
  })
  expect(firstUse.status).toBe(200)
  const used = await asLogin('postgres', (client) =>
    client.query<{ last_request: Date | null }>('SELECT last_request FROM auth.apikey WHERE id = $1', [created.id])
  )
  expect(used.rows[0]?.last_request).toBeInstanceOf(Date)

  const createdAudit = await expectOneAudit('api_key.created', { orgId: org.id, targetId: created.id })
  expect(createdAudit.after).toMatchObject({
    api_key_id: created.id,
    prefix: 'skc_',
    scopes: ['read'],
    expires_at: created.expires_at
  })
  expect(JSON.stringify(createdAudit)).not.toContain(created.key)
  const event = await asLogin('postgres', (client) =>
    client.query<{ count: string }>(
      "SELECT count(*) FROM analytics_event WHERE org_id = $1 AND name = 'api_key_created'",
      [org.id]
    )
  )
  expect(Number(event.rows[0]?.count)).toBe(1)

  const revoked = await apiRequest(keyManagement.api, {
    method: 'DELETE',
    path: `/api/orgs/${org.id}/api-keys/${created.id}`,
    headers
  })
  expect(revoked.status).toBe(204)
  const revokedAudit = await expectOneAudit('api_key.revoked', { orgId: org.id, targetId: created.id })
  expect(revokedAudit.after).toMatchObject({ api_key_id: created.id, prefix: 'skc_', scopes: ['read'], revoked: true })
  expect(JSON.stringify(revokedAudit)).not.toContain(created.key)

  const nextRequest = await apiRequest(apps.v1, {
    method: 'GET',
    path: '/v1/test/key-read',
    headers: bearer(created.key)
  })
  expect(nextRequest.status).toBe(401)
  expect(await slug(nextRequest)).toBe('unauthenticated')
})

test('an Editor admin key is narrowed after a role change, and a departed creator gets 401', async () => {
  const created = await apiRequest(keyManagement.api, {
    method: 'POST',
    path: `/api/orgs/${org.id}/api-keys`,
    headers: {
      Cookie: keyCreatorSession.cookie,
      Origin: APP,
      'Idempotency-Key': 'role-capped-admin-key'
    },
    body: { name: 'Role capped admin', scopes: ['admin'], expires_in_days: 30 }
  })
  expect(created.status, await created.clone().text()).toBe(201)
  const key = await created.json()
  const headers = bearer(key.key)
  const clauseDraft = () => apiRequest(apps.v1, { method: 'GET', path: '/v1/test/clause-draft-edit', headers })
  const manageSources = () => apiRequest(apps.v1, { method: 'GET', path: '/v1/test/sources-manage', headers })
  expect((await clauseDraft()).status).toBe(204)
  expect((await manageSources()).status).toBe(403)

  await asLogin('postgres', (client) =>
    client.query("UPDATE auth.member SET role = 'viewer' WHERE organization_id = $1 AND user_id = $2", [
      org.id,
      keyCreatorId
    ])
  )
  expect((await clauseDraft()).status).toBe(403)

  await asLogin('postgres', (client) =>
    client.query('DELETE FROM auth.member WHERE organization_id = $1 AND user_id = $2', [org.id, keyCreatorId])
  )
  const departed = await clauseDraft()
  expect(departed.status).toBe(401)
  expect(await slug(departed)).toBe('unauthenticated')
})

test('Better Auth rejects a key after its expiry on the injected clock', async () => {
  const editor = await makeAccount()
  await addMember(org.id, editor.id, 'editor')
  vi.useFakeTimers()
  const createdAt = new Date('2026-11-08T02:00:00.000Z')
  vi.setSystemTime(createdAt)
  try {
    const expired = await apiKeyManager.create({
      organizationId: org.id,
      creatorId: editor.id,
      name: 'Injected clock expiry',
      scopes: ['read'],
      expiresInDays: 1
    })
    vi.setSystemTime(new Date(createdAt.getTime() + 86_400_001))
    const response = await apiRequest(apps.v1, {
      method: 'GET',
      path: '/v1/test/key-read',
      headers: bearer(expired.key)
    })
    expect(response.status).toBe(401)
    expect(await slug(response)).toBe('unauthenticated')
  } finally {
    vi.useRealTimers()
  }
})
