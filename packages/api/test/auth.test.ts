import { z } from '@hono/zod-openapi'
import { createRoute, Problem, type Principal, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it, vi } from 'vitest'
import { requireHumanSession, requireRecentAuth } from '../src/middleware/auth'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  TEST_APP_ORIGIN,
  TEST_NOW,
  testDeps,
  testOrg
} from './harness'

async function problem(response: Response) {
  const body = await response.json()
  expect(Problem.safeParse(body).success).toBe(true)
  return body as { type: string; status: number }
}
const slug = (body: { type: string }) => body.type.split('/').at(-1)
const oauthRecordId = '8fcab91d-bf86-7ea7-87fa-9b13e74f0c70' // gitleaks:allow -- a UUIDv7 record id, not a secret.

// Test-only first-party routes for rules that need a built handler.
const ok = { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } } }
const updateSecurity = createRoute({
  method: 'patch',
  path: '/api/test/security',
  operationId: 'updateTestSecurity',
  responses: ok,
  x: { owner: 'test', statement: 'session', idempotent: false }
})
const memberOnly = createRoute({
  method: 'post',
  path: '/api/test/members-only',
  operationId: 'createTestMembersOnly',
  responses: ok,
  x: { owner: 'test', statement: 'session', idempotent: false }
})
const built = (c: { json: (body: unknown, status: 200) => Response }) => c.json({ ok: true }, 200)
const firstParty = () =>
  createTestApi({
    api: [updateSecurity, memberOnly] as SkyclauseRoute[],
    handlers: {
      updateTestSecurity: { handler: built, middleware: [requireRecentAuth()] },
      createTestMembersOnly: { handler: built, middleware: [requireHumanSession] }
    }
  })

describe('principal', () => {
  it('takes an in-process principal as is and never resolves one from the request (D5)', async () => {
    const resolvePrincipal = vi.fn(async () => null)
    const { v1 } = createTestApi({ deps: testDeps({ resolvePrincipal }) })
    const key = asApiKey({ org: 'inproc', role: 'admin', scopes: ['read'] })

    await apiRequest(v1, { as: key, method: 'GET', path: '/v1/me', headers: { Authorization: 'Bearer skc_other' } })
    expect(resolvePrincipal).not.toHaveBeenCalled()

    const response = await apiRequest(v1, { method: 'GET', path: '/v1/me' })
    expect(resolvePrincipal).toHaveBeenCalledWith(expect.any(Request), { surface: 'v1' })
    expect(response.status).toBe(401)
    expect(slug(await problem(response))).toBe('unauthenticated')
  })

  it('writes one mcp.tool_called audit row for a tool-bearing Skyclause-Client', async () => {
    const { v1, deps } = createTestApi()
    const key = asApiKey({ org: 'tools', role: 'editor', scopes: ['read'] })
    await apiRequest(v1, {
      as: key,
      method: 'GET',
      path: '/v1/projects',
      headers: { 'Skyclause-Client': 'mcp; name="claude-code"; tool="list_projects"' }
    })
    await apiRequest(v1, {
      as: key,
      method: 'GET',
      path: '/v1/projects',
      headers: { 'Skyclause-Client': 'mcp; name="claude-code"' }
    })
    expect(deps.audits).toEqual([
      {
        orgId: testOrg('tools').id,
        actor: key,
        action: 'mcp.tool_called',
        target: { type: 'mcp_tool', id: 'list_projects' },
        after: { operation_id: 'listProjects' }
      }
    ])
  })

  it('refuses a guest session bundle.approve with 403 and audits it as bundle.approve_denied (GST-7)', async () => {
    const { api, deps } = createTestApi()
    const guest = asSession({ org: 'commons', role: 'guest', guest: true })
    const response = await apiRequest(api, {
      as: guest,
      method: 'POST',
      path: '/api/bundles/b-1/approve',
      org: 'commons',
      body: { review_hash: 'h', calls: [] }
    })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')
    expect(deps.audits).toMatchObject([
      { orgId: testOrg('commons').id, action: 'bundle.approve_denied', target: { type: 'bundle', id: 'b-1' } }
    ])
  })
})

describe('/api surface', () => {
  it.each<[string, () => Principal]>([
    ['API key', () => asApiKey({ org: 'surface', role: 'owner', scopes: ['read', 'draft', 'admin'] })],
    ['OAuth', () => asOAuth({ org: 'surface', role: 'owner' })],
    ['guest token', () => asGuestToken({ org: 'surface' })],
    ['share link', () => asShareLink({ org: 'surface', access: 'reviewer' })],
    ['device', () => asDevice({ org: 'surface' })]
  ])('answers 403 to a %s principal', async (_, principal) => {
    const { api } = createTestApi()
    for (const path of ['/api/me/memberships', '/api/subscribe/token-1']) {
      const response = await apiRequest(api, { as: principal(), method: 'GET', path })
      expect(response.status, path).toBe(403)
      expect(slug(await problem(response))).toBe('insufficient-scope')
    }
  })

  it('refuses a cookie write from a foreign Origin, and passes a session bearer', async () => {
    const { api } = firstParty()
    const cookie = asSession({ org: 'surface', role: 'owner' })
    const foreign = await apiRequest(api, {
      as: cookie,
      method: 'POST',
      path: '/api/test/members-only',
      headers: { Origin: 'https://evil.example' }
    })
    expect(foreign.status).toBe(403)
    expect(slug(await problem(foreign))).toBe('insufficient-scope')

    const same = await apiRequest(api, { as: cookie, method: 'POST', path: '/api/test/members-only' })
    expect(same.status).toBe(200)

    const bearer = asSession({ org: 'surface', role: 'owner', via: 'bearer' })
    const cli = await apiRequest(api, {
      as: bearer,
      method: 'POST',
      path: '/api/test/members-only',
      headers: { Origin: 'https://evil.example' }
    })
    expect(cli.status).toBe(200)
  })

  it('lets a token route through with no principal', async () => {
    const { api } = createTestApi()
    const response = await apiRequest(api, { method: 'GET', path: '/api/subscribe/token-1' })
    // c-subscribers' handler answers: the token is unknown.
    expect(response.status).toBe(410)
  })

  it('refuses an OAuth principal on bundle approval before the approval handler runs', async () => {
    const { api } = createTestApi()
    const oauth = asOAuth({ org: 'approval-surface', role: 'owner', scopes: ['read', 'draft'] })
    const response = await apiRequest(api, {
      as: oauth,
      method: 'POST',
      path: '/api/bundles/b-1/approve',
      org: 'approval-surface',
      body: { review_hash: 'test-hash', calls: [] }
    })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')
  })
})

describe('organisation (D2)', () => {
  it('answers 400 organization-required without the header, and 404 for another organisation', async () => {
    const { v1 } = createTestApi()
    testOrg('other-org')
    const member = asSession({ org: 'mine', role: 'owner' })

    const missing = await apiRequest(v1, { as: member, method: 'GET', path: '/v1/projects' })
    expect(missing.status).toBe(400)
    expect(slug(await problem(missing))).toBe('organization-required')

    for (const org of ['other-org', testOrg('other-org').id, 'no-such-org']) {
      const other = await apiRequest(v1, { as: member, method: 'GET', path: '/v1/projects', org })
      expect(other.status, org).toBe(404)
      expect(slug(await problem(other))).toBe('not-found')
    }

    const own = await apiRequest(v1, { as: member, method: 'GET', path: '/v1/projects', org: 'mine' })
    expect(own.status).toBe(200)
  })

  it("takes a key's own organisation and answers 404 when the header names another", async () => {
    const { v1 } = createTestApi()
    testOrg('elsewhere')
    const key = asApiKey({ org: 'keyed', role: 'admin', scopes: ['read'] })
    expect((await apiRequest(v1, { as: key, method: 'GET', path: '/v1/projects' })).status).toBe(200)
    expect((await apiRequest(v1, { as: key, method: 'GET', path: '/v1/projects', org: 'keyed' })).status).toBe(200)
    expect((await apiRequest(v1, { as: key, method: 'GET', path: '/v1/projects', org: 'elsewhere' })).status).toBe(404)
  })

  it('reads the organisation from an /api/orgs/{org} path', async () => {
    const listQuery = {
      from() {
        return this
      },
      innerJoin() {
        return this
      },
      where() {
        return this
      },
      orderBy() {
        return this
      },
      async limit() {
        return []
      }
    }
    const { api } = createTestApi({
      deps: testDeps({
        withTenant: async (ctx, fn) =>
          fn({ orgId: ctx.orgId, principal: ctx.principal, select: () => listQuery } as never)
      })
    })
    testOrg('path-other')
    const admin = asSession({ org: 'path-org', role: 'admin' })
    expect((await apiRequest(api, { as: admin, method: 'GET', path: '/api/orgs/path-org/members' })).status).toBe(200)
    expect((await apiRequest(api, { as: admin, method: 'GET', path: '/api/orgs/path-other/members' })).status).toBe(404)
  })
})

describe('#198 OAuth organisation settings routes', () => {
  it('requires recent authentication before creating an organisation OAuth client', async () => {
    const { api } = createTestApi()
    const staleOwner = asSession({
      org: 'oauth-admin',
      role: 'owner',
      authenticatedAt: new Date('2026-11-07T13:00:00Z')
    })
    const response = await apiRequest(api, {
      as: staleOwner,
      method: 'POST',
      path: '/api/orgs/oauth-admin/oauth-clients',
      org: 'oauth-admin',
      idempotencyKey: 'oauth-create-1',
      body: {
        client_name: 'Gemini Enterprise',
        redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
        scopes: ['read', 'draft']
      }
    })
    expect(response.status).toBe(401)
    expect(slug(await problem(response))).toBe('reauth-required')
  })

  it('requires recent authentication before deleting an organisation OAuth client', async () => {
    const { api } = createTestApi()
    const staleOwner = asSession({
      org: 'oauth-delete',
      role: 'owner',
      authenticatedAt: new Date('2026-11-07T13:00:00Z')
    })
    const response = await apiRequest(api, {
      as: staleOwner,
      method: 'DELETE',
      path: `/api/orgs/oauth-delete/oauth-clients/${oauthRecordId}`,
      org: 'oauth-delete'
    })
    expect(response.status).toBe(401)
    expect(slug(await problem(response))).toBe('reauth-required')
  })

  it.each([
    {
      method: 'POST',
      path: '/api/orgs/oauth-viewer/oauth-clients',
      idempotencyKey: 'oauth-viewer-create',
      body: {
        client_name: 'Gemini Enterprise',
        redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
        scopes: ['read']
      }
    },
    {
      method: 'DELETE',
      path: `/api/orgs/oauth-viewer/oauth-clients/${oauthRecordId}`
    }
  ])('requires integrations.manage for $method client writes', async (operation) => {
    const base = testDeps()
    const createClient = vi.fn(base.oauth.createClient)
    const deleteClient = vi.fn(base.oauth.deleteClient)
    const { api } = createTestApi({ deps: testDeps({ oauth: { ...base.oauth, createClient, deleteClient } }) })
    const viewer = asSession({ org: 'oauth-viewer', role: 'viewer' })
    const response = await apiRequest(api, {
      as: viewer,
      method: operation.method,
      path: operation.path,
      org: 'oauth-viewer',
      idempotencyKey: 'idempotencyKey' in operation ? operation.idempotencyKey : undefined,
      body: 'body' in operation ? operation.body : undefined
    })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')
    expect(createClient).not.toHaveBeenCalled()
    expect(deleteClient).not.toHaveBeenCalled()
  })

  it('lets an Admin list OAuth clients and grants and revoke both kinds', async () => {
    const base = testDeps()
    const createClient = vi.fn(async (input: Parameters<typeof base.oauth.createClient>[0]) => ({
      ...(await base.oauth.createClient(input)),
      id: '8fcab91d-bf86-7ea7-87fa-9b13e74f0c70'
    }))
    const { api } = createTestApi({ deps: testDeps({ oauth: { ...base.oauth, createClient } }) })
    const admin = asSession({ org: 'oauth-admin', role: 'admin' })
    expect(
      (
        await apiRequest(api, {
          as: admin,
          method: 'POST',
          path: '/api/orgs/oauth-admin/oauth-clients',
          org: 'oauth-admin',
          idempotencyKey: 'oauth-admin-create',
          body: {
            client_name: 'Gemini Enterprise',
            redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
            scopes: ['read']
          }
        })
      ).status
    ).toBe(201)
    expect(
      (
        await apiRequest(api, {
          as: admin,
          method: 'GET',
          path: '/api/orgs/oauth-admin/oauth-clients',
          org: 'oauth-admin'
        })
      ).status
    ).toBe(200)
    expect(
      (
        await apiRequest(api, {
          as: admin,
          method: 'GET',
          path: '/api/orgs/oauth-admin/oauth-grants',
          org: 'oauth-admin'
        })
      ).status
    ).toBe(200)
    expect(
      (
        await apiRequest(api, {
          as: admin,
          method: 'DELETE',
          path: `/api/orgs/oauth-admin/oauth-clients/${oauthRecordId}`,
          org: 'oauth-admin'
        })
      ).status
    ).toBe(204)
    expect(
      (
        await apiRequest(api, {
          as: admin,
          method: 'DELETE',
          path: `/api/orgs/oauth-admin/oauth-grants/${oauthRecordId}`,
          org: 'oauth-admin'
        })
      ).status
    ).toBe(204)
  })

  // #115's meta-test: every OAuth settings operation answers 404 for another organisation, before the port runs.
  it('answers 404 for another organisation’s OAuth clients and grants through crossOrgCase', async () => {
    const base = testDeps()
    const oauth = {
      listClients: vi.fn(base.oauth.listClients),
      createClient: vi.fn(base.oauth.createClient),
      deleteClient: vi.fn(base.oauth.deleteClient),
      listGrants: vi.fn(base.oauth.listGrants),
      revokeGrant: vi.fn(base.oauth.revokeGrant)
    }
    const { api } = createTestApi({ deps: testDeps({ oauth }) })
    const admin = asSession({ org: 'oauth-admin', role: 'admin' })
    const other = testOrg('oauth-other').slug
    for (const crossOrg of [
      crossOrgCase('listOauthClients', { app: api, as: admin, params: { org: other } }),
      crossOrgCase('createOauthClient', {
        app: api,
        as: admin,
        params: { org: other },
        body: {
          client_name: 'Gemini Enterprise',
          redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
          scopes: ['read']
        }
      }),
      crossOrgCase('deleteOauthClient', { app: api, as: admin, params: { org: other, id: oauthRecordId } }),
      crossOrgCase('listOauthGrants', { app: api, as: admin, params: { org: other } }),
      crossOrgCase('revokeOauthGrant', { app: api, as: admin, params: { org: other, id: oauthRecordId } })
    ]) {
      await crossOrg.run()
    }
    for (const call of Object.values(oauth)) expect(call).not.toHaveBeenCalled()
  })

  it('returns the client secret once and does not store it in an idempotent replay', async () => {
    const base = testDeps()
    const createClient = vi.fn(
      async (input: { clientName: string; redirectUris: string[]; scopes: Array<'read' | 'draft'> }) => ({
        id: '8fcab91d-bf86-7ea7-87fa-9b13e74f0c70',
        client_id: 'one-time-client',
        client_name: input.clientName,
        redirect_uris: input.redirectUris,
        scopes: input.scopes,
        created_at: TEST_NOW.toISOString(),
        client_secret: 'one-time-secret',
        redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
        authorization_url: `${TEST_APP_ORIGIN}/api/auth/oauth2/authorize`,
        token_url: `${TEST_APP_ORIGIN}/api/auth/oauth2/token`
      })
    )
    const oauth = { ...base.oauth, createClient }
    const { api } = createTestApi({ deps: testDeps({ oauth }) })
    const owner = asSession({ org: 'oauth-create', role: 'owner' })
    const input = {
      client_name: 'Gemini Enterprise',
      redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
      scopes: ['read', 'draft']
    }
    const create = () =>
      apiRequest(api, {
        as: owner,
        method: 'POST',
        path: '/api/orgs/oauth-create/oauth-clients',
        org: 'oauth-create',
        idempotencyKey: 'oauth-create-secret-1',
        body: input
      })
    const first = await create()
    expect(first.status).toBe(201)
    expect(await first.json()).toMatchObject({ client_secret: 'one-time-secret', client_id: 'one-time-client' })
    const replay = await create()
    expect(replay.status).toBe(422)
    expect(await replay.text()).not.toContain('one-time-secret')
    expect(createClient).toHaveBeenCalledTimes(1)
  })
})

describe('session and scope rules', () => {
  it('answers 401 reauth-required to a session authenticated 13 hours ago', async () => {
    const { api } = firstParty()
    const stale = asSession({ org: 'auth', role: 'owner', authenticatedAt: new Date('2026-11-07T13:00:00Z') })
    const response = await apiRequest(api, { as: stale, method: 'PATCH', path: '/api/test/security' })
    expect(response.status).toBe(401)
    expect(slug(await problem(response))).toBe('reauth-required')

    const fresh = asSession({ org: 'auth', role: 'owner', authenticatedAt: new Date('2026-11-07T15:00:00Z') })
    expect((await apiRequest(api, { as: fresh, method: 'PATCH', path: '/api/test/security' })).status).toBe(200)
  })

  it('answers 403 from requireHumanSession to a guest session', async () => {
    const { api } = firstParty()
    const guest = asSession({ org: 'commons', role: 'guest', guest: true })
    const response = await apiRequest(api, { as: guest, method: 'POST', path: '/api/test/members-only' })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')
  })

  it('answers 403 insufficient-scope to a read key on a draft route', async () => {
    const { v1 } = createTestApi()
    const read = asApiKey({ org: 'scopes', role: 'owner', scopes: ['read'] })
    const response = await apiRequest(v1, {
      as: read,
      method: 'POST',
      path: '/v1/projects/p-1/windows',
      idempotencyKey: 'k-1',
      body: {}
    })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')

    const draft = asApiKey({ org: 'scopes', role: 'owner', scopes: ['read', 'draft'] })
    const allowed = await apiRequest(v1, {
      as: draft,
      method: 'POST',
      path: '/v1/projects/p-1/windows',
      idempotencyKey: 'k-1',
      body: {}
    })
    expect(allowed.status).toBe(501)
  })

  it('answers 403 to a non-staff session on a staff route', async () => {
    const { api } = createTestApi()
    const member = asSession({ org: 'staffless', role: 'owner' })
    expect((await apiRequest(api, { as: member, method: 'GET', path: '/api/admin/incidents' })).status).toBe(403)
  })
})
