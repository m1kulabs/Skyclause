import { z } from '@hono/zod-openapi'
import { createRoute, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/problems'
import { inTenant } from '../src/tenancy'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  asSystem,
  createMailbox,
  createPushDouble,
  createTestApi,
  crossOrgCase,
  testOrg
} from './harness'

// A test-only operation whose service reads a project inside the tenant, as every owner's will.
const getTestProject = createRoute({
  method: 'get',
  path: '/v1/test-projects/{id}',
  operationId: 'getTestProject',
  request: { params: z.object({ id: z.string() }), headers: z.object({ 'Skyclause-Organization': z.string() }) },
  responses: {
    200: { description: 'A project', content: { 'application/json': { schema: z.object({ id: z.string() }) } } }
  },
  x: { owner: 'test', statement: 'project.view', idempotent: false }
})
const projects = new Map([
  ['p-alpha', testOrg('alpha').id],
  ['p-beta', testOrg('beta').id]
])
const testApi = () =>
  createTestApi({
    v1: [getTestProject] as SkyclauseRoute[],
    handlers: {
      getTestProject: {
        handler: (c) =>
          inTenant(c, async ({ tx }) => {
            const { orgId } = tx as unknown as { orgId: string }
            const id = c.req.param('id') ?? ''
            if (projects.get(id) !== orgId) throw new ApiError(404, 'not-found', 'No such project.')
            return c.json({ id }, 200)
          })
      }
    }
  })

describe('crossOrgCase', () => {
  const { v1 } = testApi()
  const member = asSession({ org: 'alpha', role: 'viewer' })
  const crossOrg = crossOrgCase('getTestProject', {
    app: v1,
    routes: [getTestProject] as SkyclauseRoute[],
    as: member,
    org: 'alpha',
    params: { id: 'p-beta' }
  })

  it(crossOrg.name, crossOrg.run)

  it('is not vacuous: the same principal reads its own organisation’s project', async () => {
    const own = await apiRequest(v1, { as: member, method: 'GET', path: '/v1/test-projects/p-alpha', org: 'alpha' })
    expect(own.status).toBe(200)
    await expect(
      crossOrgCase('getTestProject', {
        app: v1,
        routes: [getTestProject] as SkyclauseRoute[],
        as: member,
        org: 'alpha',
        params: { id: 'p-alpha' }
      }).run()
    ).rejects.toThrow()
  })
})

it('builds every principal kind of spec §1', () => {
  expect(asSession({ org: 'kinds', role: 'approver' })).toMatchObject({
    kind: 'session',
    via: 'cookie',
    client: 'app',
    isGuest: false,
    orgId: null,
    role: null
  })
  expect(asSession({ org: 'kinds', role: 'editor', via: 'bearer' })).toMatchObject({ client: 'cli' })
  expect(asApiKey({ org: 'kinds', role: 'editor', scopes: ['read'] })).toMatchObject({
    kind: 'api_key',
    client: 'api',
    orgId: testOrg('kinds').id,
    role: 'editor'
  })
  expect(asOAuth({ org: 'kinds', role: null, shareLinkId: 'link-1' })).toMatchObject({
    kind: 'oauth',
    client: 'mcp',
    role: null,
    shareLinkId: 'link-1'
  })
  expect(asGuestToken({ org: 'kinds' })).toMatchObject({ kind: 'guest_token', client: 'playground' })
  expect(asShareLink({ org: 'kinds', access: 'reviewer' })).toMatchObject({ kind: 'share_link', access: 'reviewer' })
  expect(asDevice({ org: 'kinds', sourceId: 's-1' })).toMatchObject({ kind: 'device', sourceId: 's-1' })
  expect(asSystem('auditor')).toEqual({ kind: 'system', client: 'worker', clientName: null, job: 'auditor' })
})

it('keeps what the mailbox and push doubles were asked to send', async () => {
  const mailbox = createMailbox()
  await mailbox.send({
    to: 'approver@example.org',
    from: 'notices',
    subject: 'Needs review',
    text: 'A bundle needs review.',
    category: 'approver_alert',
    idempotencyKey: 'alert-1'
  })
  expect(mailbox.sent).toMatchObject([{ to: 'approver@example.org', idempotencyKey: 'alert-1' }])

  const push = createPushDouble(410)
  const answer = await push.send(
    { endpoint: 'https://push.example/1', p256dh: 'k', auth: 'a' },
    { title: 'Needs review', body: 'A bundle', url: '/o/p/bundles/1', tag: 'bundle-1' },
    { ttlS: 60 }
  )
  expect(answer).toEqual({ status: 410 })
  expect(push.sent).toHaveLength(1)
})
