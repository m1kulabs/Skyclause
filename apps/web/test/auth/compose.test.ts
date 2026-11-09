// #94 through #93's middleware: real credentials in the test database, resolved by f-auth's resolvePrincipal and
// judged by its can, as the composition root registers them.
import '@skyclause/auth/test/harness/database'
import { requireHumanSession, type ApiApp } from '@skyclause/api'
import { apiRequest, createTestApi, testDeps } from '@skyclause/api/testing'
import { authHandler, can, completeOAuthConsent, oauthManagement, resolvePrincipal } from '@skyclause/auth'
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
  signIn
} from '@skyclause/auth/testing'
import { API_ROUTES, createRoute, SCOPE_STATEMENTS, V1_ROUTES, type SkyclauseRoute } from '@skyclause/contracts'
import { beforeAll, describe, expect, test } from 'vitest'
import { GET } from '../../app/v1/[[...route]]/route'
import { GET as getOAuthMetadata } from '../../app/.well-known/oauth-authorization-server/route'
import { TEST_AUTH_ENV } from '@skyclause/auth/testing'

const slug = async (response: Response) => ((await response.json()) as { type: string }).type.split('/').at(-1)
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

// A built `/v1` route behind requireHumanSession, as #93's own tests mount one.
const humanOnly = createRoute({
  method: 'get',
  path: '/v1/test/human-only',
  operationId: 'getTestHumanOnly',
  responses: { 204: { description: 'Admitted' } },
  x: { owner: 'test', statement: 'any', idempotent: false }
})
const built = (c: { body: (body: null, status: 204) => Response }) => c.body(null, 204)

let org: { id: string; slug: string }
const credentials: Record<string, Record<string, string>> = {}
let apps: { v1: ApiApp; api: ApiApp }

beforeAll(async () => {
  org = await makeOrg()
  const editor = await makeAccount()
  await addMember(org.id, editor.id, 'editor')
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
  credentials['API key'] = bearer((await makeApiKey({ orgId: org.id, accountId: editor.id, scopes: ['read'] })).key)
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
    v1: [...(V1_ROUTES as readonly SkyclauseRoute[]), humanOnly as SkyclauseRoute],
    handlers: { getTestHumanOnly: { handler: built, middleware: [requireHumanSession] } }
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
  const consent = await completeOAuthConsent({
    headers: new Headers({ Cookie: session.cookie, Origin: TEST_AUTH_ENV.APP_ORIGIN }),
    oauthQuery,
    orgId: org.id,
    projectIds: null,
    scopes: ['read', 'draft'],
    accept: true
  })
  const code = new URL(consent.url, TEST_AUTH_ENV.APP_ORIGIN).searchParams.get('code')!
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
  await oauthManagement.revokeGrant({ orgId: org.id, id: consent.grantId!, now: new Date(), principal: revoker! })
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
