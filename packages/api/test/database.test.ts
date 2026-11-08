import { z } from '@hono/zod-openapi'
import { createRoute, type Principal, type SkyclauseRoute } from '@skyclause/contracts'
import { project, withTenant } from '@skyclause/db'
import { makeMember, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/app'
import { IP_LIMIT } from '../src/middleware/rate-limit'
import { ApiError } from '../src/problems'
import { productionDeps } from '../src/production'
import { inTenant } from '../src/tenancy'
import { apiRequest, asSession, crossOrgCase, testCan } from './harness'

// #93's open line: the Postgres stores and the withTenant seam on the #79 §7 test database, through the deps
// production runs on (only the auth seams, #94's, and the env are stood in for).

const getTestProject = createRoute({
  method: 'get',
  path: '/v1/test-projects/{id}',
  operationId: 'getTestProject',
  request: { params: z.object({ id: z.string() }), headers: z.object({ 'Skyclause-Organization': z.string() }) },
  responses: {
    200: {
      description: 'A project',
      content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } }
    }
  },
  x: { owner: 'test', statement: 'project.view', idempotent: false }
})
const renameTestProject = createRoute({
  method: 'post',
  path: '/v1/test-projects/{id}/renames',
  operationId: 'createTestProjectRename',
  request: {
    params: z.object({ id: z.string() }),
    headers: z.object({ 'Skyclause-Organization': z.string(), 'Idempotency-Key': z.string() }),
    body: { required: true, content: { 'application/json': { schema: z.object({ name: z.string().min(1) }) } } }
  },
  responses: {
    201: {
      description: 'Renamed',
      content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } }
    }
  },
  x: { owner: 'test', statement: 'project.view', idempotent: true }
})
const getTestStatus = createRoute({
  method: 'get',
  path: '/v1/public/test-status',
  operationId: 'getTestStatus',
  responses: { 200: { description: 'Up', content: { 'application/json': { schema: z.object({ up: z.boolean() }) } } } },
  x: { owner: 'test', statement: 'public', idempotent: false }
})
const approveTestBundle = createRoute({
  method: 'post',
  path: '/api/test-bundles/{id}/approve',
  operationId: 'approveTestBundle',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'Approved', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } }
  },
  x: { owner: 'test', statement: 'bundle.approve', idempotent: false }
})
const routes = [getTestProject, renameTestProject, getTestStatus] as SkyclauseRoute[]

let renames = 0
const { v1, api } = createApi(
  {
    ...productionDeps,
    resolvePrincipal: async () => null,
    can: testCan,
    config: () => ({ appEnv: 'test', appOrigin: 'https://app.skyclause.m1ku.tech', ipHashKey: 'k'.repeat(48) })
  },
  {
    v1: routes,
    api: [approveTestBundle] as SkyclauseRoute[],
    handlers: {
      approveTestBundle: { handler: (c) => c.json({ ok: true }, 200) },
      getTestProject: {
        handler: (c) =>
          inTenant(c, async ({ tx }) => {
            const [row] = await tx
              .select()
              .from(project)
              .where(eq(project.id, c.req.param('id') ?? ''))
            if (!row) throw new ApiError(404, 'not-found', 'No such project.')
            return c.json({ id: row.id, name: row.name }, 200)
          })
      },
      createTestProjectRename: {
        handler: (c) =>
          inTenant(c, async ({ tx }) => {
            renames += 1
            const { name } = (await c.req.json()) as { name: string }
            const [row] = await tx
              .update(project)
              .set({ name })
              .where(eq(project.id, c.req.param('id') ?? ''))
              .returning()
            if (!row) throw new ApiError(404, 'not-found', 'No such project.')
            return c.json({ id: row.id, name: row.name }, 201)
          })
      },
      getTestStatus: { handler: (c) => c.json({ up: true }, 200) }
    }
  }
)

/** A real organisation with a project and a member whose session is `as`. */
async function organisation(role: 'viewer' | 'owner' = 'viewer') {
  const org = await makeOrganization()
  const membership = await makeMember({ organizationId: org.id, role })
  const as: Principal = { ...asSession({ org: org.slug, role }), accountId: membership.userId } as Principal
  const row = await withTenant({ orgId: org.id, principal: as }, (tx) => makeProject(tx))
  return { org, as, project: row }
}

describe('on the test database', () => {
  it('serves a project through withTenant to its member, and 404s another organisation’s', async () => {
    const a = await organisation()
    const b = await organisation()
    const own = await apiRequest(v1, {
      as: a.as,
      method: 'GET',
      path: `/v1/test-projects/${a.project.id}`,
      org: a.org.slug
    })
    expect(own.status).toBe(200)
    expect(await own.json()).toEqual({ id: a.project.id, name: 'Test project' })

    const crossOrg = crossOrgCase('getTestProject', {
      app: v1,
      routes,
      as: a.as,
      org: a.org.slug,
      params: { id: b.project.id }
    })
    await crossOrg.run()
    // Naming the other organisation instead is 404 too: `auth.member` has no row for this account there.
    const named = await apiRequest(v1, {
      as: a.as,
      method: 'GET',
      path: `/v1/test-projects/${b.project.id}`,
      org: b.org.slug
    })
    expect(named.status).toBe(404)
  })

  it('replays an Idempotency-Key from idempotency_key and refuses it for another body', async () => {
    const a = await organisation()
    const rename = (name: string) =>
      apiRequest(v1, {
        as: a.as,
        method: 'POST',
        path: `/v1/test-projects/${a.project.id}/renames`,
        org: a.org.slug,
        idempotencyKey: `rename-${a.project.id}`,
        body: { name }
      })
    const before = renames
    const first = await rename('Bukit Jalil')
    expect(first.status).toBe(201)
    const replay = await rename('Bukit Jalil')
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(await first.json())
    expect(renames - before).toBe(1)
    const mismatch = await rename('Cheras')
    expect(mismatch.status).toBe(422)
    expect(((await mismatch.json()) as { type: string }).type).toBe(
      'https://docs.skyclause.m1ku.tech/problems/idempotency-mismatch'
    )
  })

  it('rate-limits by an IP hash in rate_limit, and never stores the address', async () => {
    const address = '203.0.113.77'
    const status = () =>
      apiRequest(v1, { method: 'GET', path: '/v1/public/test-status', headers: { 'X-Forwarded-For': address } })
    expect((await status()).status).toBe(200)
    const stored = await asLogin('postgres', async (client) => {
      const limits = await client.query<{ bucket: string }>('SELECT bucket FROM rate_limit')
      const keys = await client.query<{ scope: string }>('SELECT scope FROM idempotency_key')
      return [...limits.rows.map((row) => row.bucket), ...keys.rows.map((row) => row.scope)]
    })
    expect(stored.some((value) => /^ip:[0-9a-f]{64}$/.test(value))).toBe(true)
    expect(stored.filter((value) => value.includes(address))).toEqual([])

    // The same address, counted in rate_limit, passes IP_LIMIT within the minute.
    for (let hit = 2; hit <= IP_LIMIT; hit++) expect((await status()).status).toBe(200)
    const limited = await status()
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0)
  })

  it('writes one mcp.tool_called row to audit_event for a tool-bearing Skyclause-Client', async () => {
    const a = await organisation()
    await apiRequest(v1, {
      as: a.as,
      method: 'GET',
      path: `/v1/test-projects/${a.project.id}`,
      org: a.org.slug,
      headers: { 'Skyclause-Client': 'mcp; name="claude-code"; tool="get_project"' }
    })
    expect(await audits(a.org.id)).toEqual([
      {
        action: 'mcp.tool_called',
        target_type: 'mcp_tool',
        target_id: 'get_project',
        actor_id: a.as.kind === 'session' && a.as.accountId
      }
    ])
  })

  it('refuses a viewer bundle.approve with 403 and writes one bundle.approve_denied row', async () => {
    const a = await organisation('viewer')
    const response = await apiRequest(api, {
      as: a.as,
      method: 'POST',
      path: '/api/test-bundles/b-1/approve',
      org: a.org.slug
    })
    expect(response.status).toBe(403)
    expect(await audits(a.org.id)).toEqual([
      {
        action: 'bundle.approve_denied',
        target_type: 'test_bundle',
        target_id: 'b-1',
        actor_id: a.as.kind === 'session' && a.as.accountId
      }
    ])
  })
})

/** The organisation's audit rows, read as the superuser. */
function audits(orgId: string) {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query(
      'SELECT action, target_type, target_id, actor_id FROM audit_event WHERE org_id = $1 ORDER BY at',
      [orgId]
    )
    return rows
  })
}
