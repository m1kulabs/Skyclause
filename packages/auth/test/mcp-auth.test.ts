// #198 e-mcp-auth: the MCP OAuth provider contract on the pinned Better Auth version.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'
import { expectOneAudit } from '@skyclause/db/test/harness/index'
import { analyticsEvent, oauthGrant, rateLimit, systemPrincipal, withSystem, withTenant } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { authSettings, createAuth, getAuth, resources } from '../src/instance'
import { addMember, makeAccount, makeOrg, makeProjectIn, makeShareLinkFor, signIn, TEST_AUTH_ENV } from './harness'
import { completeOAuthConsent, getOAuthConsentDetails, oauthManagement } from '../src/oauth'
import { resolvePrincipal } from '../src/principal'

const APP = TEST_AUTH_ENV.APP_ORIGIN
const request = (auth: { handler: (request: Request) => Promise<Response> }, path: string, init?: RequestInit) =>
  auth.handler(
    new Request(`${APP}/api/auth${path}`, {
      headers: { Origin: APP, ...(init?.headers as Record<string, string> | undefined) },
      ...init
    })
  )

test('e-mcp-auth configures mcp() for both resource origins, public PKCE and the oauth scopes', () => {
  const auth = createAuth(authSettings())
  const oauth = auth.options.plugins.find((plugin) => plugin.id === 'oauth-provider')
  expect(oauth).toBeDefined()
  expect(oauth?.options).toMatchObject({
    scopes: ['read', 'draft'],
    loginPage: '/sign-in',
    consentPage: '/oauth/consent',
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationRequirePKCE: true,
    clientRegistrationDefaultApplicationType: 'web',
    resources: [`${TEST_AUTH_ENV.API_ORIGIN}/v1`, `${TEST_AUTH_ENV.MCP_ORIGIN}/mcp`]
  })
  expect(auth.options.plugins.some((plugin) => plugin.id === 'cimd')).toBe(true)
  expect(auth.options.plugins.some((plugin) => plugin.id === 'oauth-provider')).toBe(true)
})

test('NFR-15 keeps OAuth test doubles out of production modules', () => {
  const productionFiles = [
    new URL('../src/plugins/e-mcp-auth.ts', import.meta.url),
    new URL('../src/oauth.ts', import.meta.url),
    new URL('../../api/src/routes/oauth/index.ts', import.meta.url),
    new URL('../../../apps/web/features/oauth/consent-form.tsx', import.meta.url),
    new URL('../../../apps/web/features/settings/organisation/integrations/panel.tsx', import.meta.url)
  ]
  const testOnlyImports = productionFiles.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return source.match(/(?:from|import)\s+['"][^'"]*(?:\/test\/|\/testing)['"]/g) ?? []
  })
  expect(testOnlyImports).toEqual([])
})

test('pre-registers the playground as a public PKCE client for its callback and MCP resource', async () => {
  const auth = createAuth(authSettings())
  const metadata = await auth.handler(new Request(`${APP}/.well-known/oauth-authorization-server`))
  expect(metadata.status).toBe(200)

  const clientResult = await authDatabase().execute<{
    client_id: string
    name: string
    redirect_uris: string[]
    token_endpoint_auth_method: string
    require_pkce: boolean
    client_secret: string | null
  }>(sql`
    SELECT client_id, name, redirect_uris, token_endpoint_auth_method, require_pkce, client_secret
    FROM auth.oauth_client WHERE client_id = 'skyclause-playground'
  `)
  const resourceResult = await authDatabase().execute<{ resource_id: string }>(sql`
    SELECT resource_id FROM auth.oauth_client_resource WHERE client_id = 'skyclause-playground'
  `)

  expect(clientResult.rows[0]).toMatchObject({
    client_id: 'skyclause-playground',
    name: 'Skyclause Playground',
    redirect_uris: [`${APP}/developers/mcp/callback`],
    token_endpoint_auth_method: 'none',
    require_pkce: true,
    client_secret: null
  })
  expect(resourceResult.rows).toEqual([{ resource_id: `${TEST_AUTH_ENV.MCP_ORIGIN}/mcp` }])
})

test('RFC 8414 metadata advertises only S256, read and draft, registration, and RFC 9207 iss', async () => {
  const response = await createAuth(authSettings()).handler(
    new Request(`${APP}/.well-known/oauth-authorization-server`)
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    issuer: APP,
    authorization_endpoint: `${APP}/api/auth/oauth2/authorize`,
    token_endpoint: `${APP}/api/auth/oauth2/token`,
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['read', 'draft'],
    authorization_response_iss_parameter_supported: true,
    registration_endpoint: `${APP}/api/auth/oauth2/register`
  })
})

test('public dynamic registration is active and refuses confidential or non-PKCE clients', async () => {
  const auth = createAuth(authSettings())
  const register = (authMethod: string, requirePkce = true) =>
    request(auth, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.51' },
      body: JSON.stringify({
        client_name: 'Issue 198 public test',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: authMethod,
        application_type: 'web',
        require_pkce: requirePkce
      })
    })

  expect((await register('none')).status).toBe(201)
  expect((await register('client_secret_post')).status).toBe(400)
  expect((await register('none', false)).status).toBe(400)
})

test('dynamic registration is limited to ten public clients per IP hash per hour', async () => {
  const auth = createAuth(authSettings())
  const register = () =>
    request(auth, '/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.53' },
      body: JSON.stringify({
        client_name: 'Rate limit acceptance client',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        require_pkce: true
      })
    })
  const statuses: number[] = []
  for (let i = 0; i < 11; i += 1) statuses.push((await register()).status)
  expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201))
  expect(statuses[10]).toBe(429)
  const buckets = await withSystem('test:oauth-registration-buckets', (tx) =>
    tx
      .select({ bucket: rateLimit.bucket })
      .from(rateLimit)
      .where(sql`${rateLimit.bucket} LIKE 'oauth-registration:%'`)
  )
  expect(buckets.length).toBeGreaterThan(0)
  expect(buckets.every(({ bucket }) => /^oauth-registration:[0-9a-f]{64}$/.test(bucket))).toBe(true)
  expect(JSON.stringify(buckets)).not.toContain('192.0.2.53')
})

test('a full PKCE consent creates a resource-bound grant_id that resolvePrincipal can read', async () => {
  const auth = getAuth().auth
  const settings = authSettings()
  const { api } = resources(settings)
  const org = await makeOrg()
  const account = await makeAccount()
  await addMember(org.id, account.id, 'editor')
  const project = await makeProjectIn(org.id)
  const session = await signIn(account.id)
  const registration = await request(auth, '/oauth2/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.52' },
    body: JSON.stringify({
      client_name: 'PKCE acceptance client',
      redirect_uris: ['https://client.example/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      require_pkce: true,
      resources: [api]
    })
  })
  const clientId = ((await registration.json()) as { client_id: string }).client_id
  const verifier = 'n5Qw2rT8bX3cV6mK9pL1sA4dF7gH0jN2qR5uW8yZ1aC'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const authorize = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    scope: 'read',
    state: 'pkce-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: api
  })
  const started = await auth.handler(
    new Request(`${APP}/api/auth/oauth2/authorize?${authorize}`, { headers: { Cookie: session.cookie } })
  )
  expect(started.status).toBe(302)
  const location = started.headers.get('Location')
  expect(location, await started.clone().text()).toBeTruthy()
  const query = new URL(location!, APP).search.slice(1)
  const consent = await completeOAuthConsent({
    headers: new Headers({ Cookie: session.cookie, Origin: APP }),
    oauthQuery: query,
    orgId: org.id,
    projectIds: [project.id],
    scopes: ['read'],
    accept: true
  })
  expect(consent.grantId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(new URL(consent.url, APP).searchParams.get('iss')).toBe(APP)
  await expectOneAudit('mcp.consent_granted', { orgId: org.id, targetId: consent.grantId })
  const connectedEvents = await withTenant(
    { orgId: org.id, principal: systemPrincipal('test:oauth-analytics') },
    (tx) =>
      tx.select({ props: analyticsEvent.props }).from(analyticsEvent).where(eq(analyticsEvent.name, 'mcp_connected'))
  )
  expect(connectedEvents).toEqual([{ props: { client: 'other' } }])
  const code = new URL(consent.url, APP).searchParams.get('code')!
  const tokenResponse = await request(auth, '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: 'https://client.example/callback',
      code_verifier: verifier,
      resource: api
    }).toString()
  })
  expect(tokenResponse.status).toBe(200)
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string }
  const principal = await resolvePrincipal(
    new Request(`${api}/projects`, { headers: { Authorization: `Bearer ${token}` } }),
    {
      surface: 'v1'
    }
  )
  expect(principal).toMatchObject({ kind: 'oauth', orgId: org.id, projectIds: [project.id], resource: 'api' })
  expect(
    await resolvePrincipal(new Request(`${api}/projects`, { headers: { Authorization: `Bearer ${token}` } }), {
      surface: 'mcp'
    })
  ).toBeNull()
  await oauthManagement.revokeGrant({
    orgId: org.id,
    id: consent.grantId!,
    now: new Date(),
    principal: {
      kind: 'session',
      via: 'cookie',
      client: 'app',
      clientName: null,
      accountId: account.id,
      sessionId: session.sessionId,
      isGuest: false,
      staff: false,
      orgId: org.id,
      role: 'editor',
      authenticatedAt: new Date()
    }
  })
  await expectOneAudit('mcp.consent_revoked', { orgId: org.id, targetId: consent.grantId })
  expect(
    await resolvePrincipal(new Request(`${api}/projects`, { headers: { Authorization: `Bearer ${token}` } }), {
      surface: 'v1'
    })
  ).toBeNull()
})

test('a signed-in reviewer consents to only the share link project with read and draft', async () => {
  const auth = getAuth().auth
  const { mcp } = resources(authSettings())
  const org = await makeOrg()
  const account = await makeAccount()
  const link = await makeShareLinkFor({ orgId: org.id, access: 'reviewer' })
  const session = await signIn(account.id)
  const registration = await request(auth, '/oauth2/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.54' },
    body: JSON.stringify({
      client_name: 'Reviewer share-link client',
      redirect_uris: ['https://client.example/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      require_pkce: true,
      resources: [mcp]
    })
  })
  const clientId = ((await registration.json()) as { client_id: string }).client_id
  const verifier = 'g3R8yW1uQ5mK9nP2aS7dF4hJ0xV6cB8zT1eL5qN3wA'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const authorize = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    scope: 'read draft',
    state: 'share-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcp
  })
  const started = await auth.handler(
    new Request(`${APP}/api/auth/oauth2/authorize?${authorize}`, {
      headers: { Cookie: `${session.cookie}; sc_share=${link.token}` }
    })
  )
  expect(started.status).toBe(302)
  const signedQuery = new URL(started.headers.get('Location')!, APP).search.slice(1)
  const consent = await completeOAuthConsent({
    headers: new Headers({ Cookie: `${session.cookie}; sc_share=${link.token}`, Origin: APP }),
    oauthQuery: signedQuery,
    orgId: org.id,
    projectIds: [],
    scopes: ['read', 'draft'],
    accept: true
  })
  const [grant] = await withTenant({ orgId: org.id, principal: systemPrincipal('test:oauth-share-consent') }, (tx) =>
    tx.select().from(oauthGrant).where(eq(oauthGrant.id, consent.grantId!)).limit(1)
  )
  expect(grant).toMatchObject({
    accountId: account.id,
    resource: 'mcp',
    projectIds: [link.projectId],
    shareLinkId: link.id,
    scopes: ['read', 'draft']
  })
  await expectOneAudit('mcp.consent_granted', { orgId: org.id, targetId: consent.grantId })
})

test('a denied consent is audited without issuing a code or recording a connection', async () => {
  const auth = getAuth().auth
  const { mcp } = resources(authSettings())
  const org = await makeOrg()
  const account = await makeAccount()
  await addMember(org.id, account.id, 'editor')
  const session = await signIn(account.id)
  const registration = await request(auth, '/oauth2/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '192.0.2.55' },
    body: JSON.stringify({
      client_name: 'Denial audit client',
      redirect_uris: ['https://client.example/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      require_pkce: true,
      resources: [mcp]
    })
  })
  const clientId = ((await registration.json()) as { client_id: string }).client_id
  const verifier = 'r4N8yW1uQ5mK9nP2aS7dF3hJ0xV6cB8zT1eL5qN2wA'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    scope: 'read',
    state: 'denial-audit',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcp
  })
  const started = await auth.handler(
    new Request(`${APP}/api/auth/oauth2/authorize?${params}`, { headers: { Cookie: session.cookie } })
  )
  const oauthQuery = new URL(started.headers.get('Location')!, APP).search.slice(1)

  const denied = await completeOAuthConsent({
    headers: new Headers({ Cookie: session.cookie, Origin: APP }),
    oauthQuery,
    orgId: org.id,
    projectIds: [],
    scopes: [],
    accept: false
  })

  expect(new URL(denied.url, APP).searchParams.has('code')).toBe(false)
  await expectOneAudit('mcp.consent_denied', { orgId: org.id, targetId: clientId })
  const connectedEvents = await withTenant(
    { orgId: org.id, principal: systemPrincipal('test:oauth-denied-analytics') },
    (tx) =>
      tx
        .select({ props: analyticsEvent.props })
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'mcp_connected'), eq(analyticsEvent.orgId, org.id)))
  )
  expect(connectedEvents).toEqual([])
})

test('an organisation Gemini client is consent-locked and deleting it revokes its grants', async () => {
  const auth = getAuth().auth
  const org = await makeOrg()
  const account = await makeAccount()
  await addMember(org.id, account.id, 'owner')
  const session = await signIn(account.id)
  const principal = {
    kind: 'session' as const,
    via: 'cookie' as const,
    client: 'app' as const,
    clientName: null,
    accountId: account.id,
    sessionId: session.sessionId,
    isGuest: false,
    staff: false,
    orgId: org.id,
    role: 'owner' as const,
    authenticatedAt: new Date()
  }
  const created = await oauthManagement.createClient({
    orgId: org.id,
    principal,
    headers: new Headers({ Cookie: session.cookie, Origin: APP }),
    clientName: 'Gemini Enterprise',
    redirectUris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
    scopes: ['read', 'draft']
  })
  expect(created).toMatchObject({
    client_name: 'Gemini Enterprise',
    redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    authorization_url: `${APP}/api/auth/oauth2/authorize`,
    token_url: `${APP}/api/auth/oauth2/token`,
    scopes: ['read', 'draft']
  })
  expect(created.client_secret).toBeTruthy()
  expect(JSON.stringify(await oauthManagement.listClients(org.id, { limit: 100 }))).not.toContain(created.client_secret)

  const verifier = 'm2P7zN4aB9cD1eF6gH3jK8lQ5rS0tV2wX7yA4bC9dE'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const authorize = new URLSearchParams({
    response_type: 'code',
    client_id: created.client_id,
    redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
    scope: 'read',
    state: 'gemini-org-lock',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${TEST_AUTH_ENV.MCP_ORIGIN}/mcp`
  })
  const started = await auth.handler(
    new Request(`${APP}/api/auth/oauth2/authorize?${authorize}`, { headers: { Cookie: session.cookie } })
  )
  expect(started.status).toBe(302)
  const oauthQuery = new URL(started.headers.get('Location')!, APP).search.slice(1)
  const details = await getOAuthConsentDetails(new Headers({ Cookie: session.cookie }), oauthQuery)
  expect(details.lockedOrgId).toBe(org.id)
  await expect(
    completeOAuthConsent({
      headers: new Headers({ Cookie: session.cookie, Origin: APP }),
      oauthQuery,
      orgId: crypto.randomUUID(),
      projectIds: [],
      scopes: ['read'],
      accept: true
    })
  ).rejects.toThrow('This OAuth client is locked to another organisation.')

  const project = await makeProjectIn(org.id)
  const consent = await completeOAuthConsent({
    headers: new Headers({ Cookie: session.cookie, Origin: APP }),
    oauthQuery,
    orgId: org.id,
    projectIds: [project.id],
    scopes: ['read'],
    accept: true
  })
  const code = new URL(consent.url, APP).searchParams.get('code')!
  const tokenResponse = await request(auth, '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: created.client_id,
      client_secret: created.client_secret,
      code,
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      code_verifier: verifier,
      resource: `${TEST_AUTH_ENV.MCP_ORIGIN}/mcp`
    }).toString()
  })
  expect(tokenResponse.status).toBe(200)
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string }
  const tokenPrincipal = await resolvePrincipal(
    new Request(`${TEST_AUTH_ENV.MCP_ORIGIN}/mcp`, { headers: { Authorization: `Bearer ${token}` } }),
    { surface: 'mcp' }
  )
  expect(tokenPrincipal).toMatchObject({ kind: 'oauth', resource: 'mcp', orgId: org.id, projectIds: [project.id] })
  expect(await oauthManagement.deleteClient({ orgId: org.id, id: created.id, now: new Date(), principal })).toBe(true)
  const [revokedGrant] = await withTenant(
    { orgId: org.id, principal: systemPrincipal('test:oauth-client-revoke') },
    (tx) => tx.select().from(oauthGrant).where(eq(oauthGrant.id, consent.grantId!)).limit(1)
  )
  expect(revokedGrant?.revokedAt).toBeInstanceOf(Date)
  expect(
    await resolvePrincipal(
      new Request(`${TEST_AUTH_ENV.MCP_ORIGIN}/mcp`, { headers: { Authorization: `Bearer ${token}` } }),
      { surface: 'mcp' }
    )
  ).toBeNull()
  await expectOneAudit('mcp.client_created', { orgId: org.id, targetId: created.client_id })
  await expectOneAudit('mcp.client_revoked', { orgId: org.id, targetId: created.client_id })
  await expectOneAudit('mcp.consent_revoked', { orgId: org.id, targetId: consent.grantId })
})

test('authorize refuses a missing resource and a plain PKCE challenge before issuing a code', async () => {
  const auth = getAuth().auth
  const response = await request(
    auth,
    '/oauth2/authorize?response_type=code&client_id=unknown&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=read'
  )
  expect(response.status).not.toBe(404)
  expect(response.status).toBeGreaterThanOrEqual(400)
  const plain = await request(
    auth,
    '/oauth2/authorize?response_type=code&client_id=unknown&redirect_uri=https%3A%2F%2Fclient.example%2Fcallback&scope=read&resource=https%3A%2F%2Fapi.skyclause.m1ku.tech%2Fv1&code_challenge=plain&code_challenge_method=plain'
  )
  expect(plain.status).not.toBe(404)
  expect(plain.status).toBeGreaterThanOrEqual(400)
})

test('a guest cannot complete OAuth consent or receive an authorization code', async () => {
  const guest = await signIn((await makeAccount({ anonymous: true })).id)
  await expect(
    completeOAuthConsent({
      headers: new Headers({ Cookie: guest.cookie }),
      oauthQuery: '',
      orgId: crypto.randomUUID(),
      projectIds: [],
      scopes: ['read'],
      accept: true
    })
  ).rejects.toThrow('A signed-up member session is required for OAuth consent.')
})

async function playgroundConsent(cookie: string, state: string) {
  const verifier = 'k8R2yW1uQ5mK9nP2aS7dF4hJ0xV6cB8zT1eL5qN3wA'
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString(
    'base64url'
  )
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'skyclause-playground',
    redirect_uri: `${APP}/developers/mcp/callback`,
    scope: 'read',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: resources(authSettings()).mcp
  })
  const response = await request(getAuth().auth, `/oauth2/authorize?${params}`, { headers: { Cookie: cookie } })
  expect(response.status).toBe(302)
  return { oauthQuery: new URL(response.headers.get('Location')!, APP).search.slice(1), verifier }
}

test('an outstanding code cannot acquire a replacement consent grant’s projects', async () => {
  const org = await makeOrg()
  const account = await makeAccount()
  await addMember(org.id, account.id, 'editor')
  const projectA = await makeProjectIn(org.id)
  const projectB = await makeProjectIn(org.id)
  const session = await signIn(account.id)
  const first = await playgroundConsent(session.cookie, 'grant-a')
  const headers = new Headers({ Cookie: session.cookie, Origin: APP })
  const original = await completeOAuthConsent({
    headers,
    oauthQuery: first.oauthQuery,
    orgId: org.id,
    projectIds: [projectA.id],
    scopes: ['read'],
    accept: true
  })
  const second = await playgroundConsent(session.cookie, 'grant-b')
  const replacement = await completeOAuthConsent({
    headers,
    oauthQuery: second.oauthQuery,
    orgId: org.id,
    projectIds: [projectB.id],
    scopes: ['read'],
    accept: true
  })
  expect(original.grantId).not.toBe(replacement.grantId)

  const exchange = await request(getAuth().auth, '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'skyclause-playground',
      code: new URL(original.url).searchParams.get('code')!,
      redirect_uri: `${APP}/developers/mcp/callback`,
      code_verifier: first.verifier,
      resource: resources(authSettings()).mcp
    }).toString()
  })
  expect(exchange.status).toBeGreaterThanOrEqual(400)
  expect(await exchange.json()).not.toHaveProperty('access_token')
})

test('a guest cannot bypass the consent page through the provider’s native consent endpoint', async () => {
  const member = await signIn((await makeAccount()).id)
  const guest = await signIn((await makeAccount({ anonymous: true })).id)
  const { oauthQuery } = await playgroundConsent(member.cookie, 'guest-native-consent')
  const response = await request(getAuth().auth, '/oauth2/consent', {
    method: 'POST',
    headers: { Cookie: guest.cookie, Origin: APP, 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept: true, scope: 'read', oauth_query: oauthQuery })
  })
  expect(response.status).toBe(403)
  expect(await response.json()).not.toHaveProperty('url')
})
