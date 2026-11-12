import { z } from '@hono/zod-openapi'
import { createRoute, Problem, type Principal, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it, vi } from 'vitest'
import { CREDENTIAL_LIMIT, RATE_LIMIT_WINDOW_S } from '../src/middleware/rate-limit'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  TEST_APP_ORIGIN,
  TEST_NOW,
  testDeps
} from './harness'

// #737: the app host serves `/v1` at `/api/v1` for the browser's host-only session cookie. `v1Bridge` is the `/v1`
// operation set under `/api`'s surface rule, with no CORS; the Route Handler strips `/api` before it.

async function problem(response: Response) {
  const body = await response.json()
  expect(Problem.safeParse(body).success).toBe(true)
  return body as { type: string; detail: string }
}
const slug = (body: { type: string }) => body.type.split('/').at(-1)

const ok = { 200: { description: 'OK', content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } } } }
const write = createRoute({
  method: 'post',
  path: '/v1/test/writes',
  operationId: 'createTestWrite',
  responses: ok,
  x: { owner: 'test', statement: 'session', idempotent: true }
})
const writes = () => {
  const handler = vi.fn((c: { json: (body: unknown, status: 200) => Response }) => c.json({ ok: true }, 200))
  return { handler, ...createTestApi({ v1: [write] as SkyclauseRoute[], handlers: { createTestWrite: { handler } } }) }
}

describe('/v1 bridge on the app host', () => {
  it.each<[string, () => Principal]>([
    ['an API key', () => asApiKey({ org: 'bridge', role: 'owner', scopes: ['read', 'draft', 'admin'] })],
    ['an OAuth', () => asOAuth({ org: 'bridge', role: 'owner' })],
    ['a guest token', () => asGuestToken({ org: 'bridge' })],
    ['a share link', () => asShareLink({ org: 'bridge', access: 'reviewer' })],
    ['a device', () => asDevice({ org: 'bridge' })]
  ])('answers 403 to %s principal that /v1 itself admits', async (_, principal) => {
    const { v1, v1Bridge } = createTestApi()
    const as = principal()
    expect((await apiRequest(v1, { as, method: 'GET', path: '/v1/me' })).status).not.toBe(403)

    const response = await apiRequest(v1Bridge, { as, method: 'GET', path: '/v1/me' })
    expect(response.status).toBe(403)
    expect(slug(await problem(response))).toBe('insufficient-scope')
  })

  it('serves a cookie session the same read /v1 serves it', async () => {
    const { v1, v1Bridge } = createTestApi()
    const member = asSession({ org: 'bridge-read', role: 'viewer' })
    const read = { as: member, method: 'GET', path: '/v1/projects', org: 'bridge-read' }

    const bridged = await apiRequest(v1Bridge, read)
    expect(bridged.status).toBe(200)
    expect(await bridged.json()).toEqual(await (await apiRequest(v1, read)).json())
  })

  it('answers 401 to a request with no credential, and 404 to an unknown operation', async () => {
    const { v1Bridge } = createTestApi()
    const anonymous = await apiRequest(v1Bridge, { method: 'GET', path: '/v1/projects' })
    expect(anonymous.status).toBe(401)
    expect(slug(await problem(anonymous))).toBe('unauthenticated')

    const unknown = await apiRequest(v1Bridge, { method: 'GET', path: '/v1/no-such-operation' })
    expect(unknown.status).toBe(404)
    expect(slug(await problem(unknown))).toBe('not-found')
  })

  it('refuses a cookie write without APP_ORIGIN, and still asks for an Idempotency-Key', async () => {
    const { v1Bridge, handler } = writes()
    const cookie = asSession({ org: 'bridge-write', role: 'owner' })
    for (const origin of ['https://evil.example', 'null']) {
      const foreign = await apiRequest(v1Bridge, {
        as: cookie,
        method: 'POST',
        path: '/v1/test/writes',
        idempotencyKey: 'k-1',
        headers: { Origin: origin }
      })
      expect(foreign.status, origin).toBe(403)
      expect((await problem(foreign)).detail).toBe('A cookie write must come from the app origin.')
    }
    expect(handler).not.toHaveBeenCalled()

    const keyless = await apiRequest(v1Bridge, { as: cookie, method: 'POST', path: '/v1/test/writes' })
    expect(keyless.status).toBe(422)

    for (let attempt = 0; attempt < 2; attempt++) {
      const same = await apiRequest(v1Bridge, {
        as: cookie,
        method: 'POST',
        path: '/v1/test/writes',
        idempotencyKey: 'k-2',
        headers: { Origin: TEST_APP_ORIGIN }
      })
      expect(same.status).toBe(200)
    }
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('counts against the session’s own rate-limit bucket, shared with /v1', async () => {
    const deps = testDeps()
    const { v1Bridge } = createTestApi({ deps })
    const member = asSession({ org: 'bridge-limit', role: 'viewer' })
    for (let hit = 0; hit < CREDENTIAL_LIMIT; hit++) {
      await deps.rateLimits.hit({ bucket: `session:${member.sessionId}`, windowS: RATE_LIMIT_WINDOW_S, now: TEST_NOW })
    }

    const limited = await apiRequest(v1Bridge, { as: member, method: 'GET', path: '/v1/projects', org: 'bridge-limit' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBeTruthy()
  })

  it('sends no CORS headers, unlike /v1', async () => {
    const { v1, v1Bridge } = createTestApi()
    const preflight = {
      method: 'OPTIONS',
      path: '/v1/projects',
      headers: { Origin: TEST_APP_ORIGIN, 'Access-Control-Request-Method': 'GET' }
    }
    expect((await apiRequest(v1, preflight)).headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN)
    expect((await apiRequest(v1Bridge, preflight)).headers.get('Access-Control-Allow-Origin')).toBeNull()

    const publicRead = {
      method: 'GET',
      path: '/v1/public/no-org/no-project/status',
      headers: { Origin: 'https://x.example' }
    }
    expect((await apiRequest(v1, publicRead)).headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect((await apiRequest(v1Bridge, publicRead)).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
