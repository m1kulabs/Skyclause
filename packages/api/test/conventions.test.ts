import { z } from '@hono/zod-openapi'
import { createRoute, Problem, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it, vi } from 'vitest'
import { IP_LIMIT } from '../src/middleware/rate-limit'
import { apiRequest, asApiKey, asOAuth, asSession, createTestApi, TEST_APP_ORIGIN, testDeps } from './harness'

type Json = Record<string, unknown>
const Note = z.object({ id: z.string(), text: z.string() })
const createNote = createRoute({
  method: 'post',
  path: '/v1/projects/{id}/notes',
  operationId: 'createTestNote',
  request: {
    params: z.object({ id: z.string() }),
    headers: z.object({ 'Skyclause-Organization': z.string(), 'Idempotency-Key': z.string() }),
    body: { required: true, content: { 'application/json': { schema: z.object({ text: z.string().min(1) }) } } }
  },
  responses: { 201: { description: 'A note', content: { 'application/json': { schema: Note } } } },
  x: { owner: 'test', statement: 'window.declare', idempotent: true }
})
const getStatus = createRoute({
  method: 'get',
  path: '/v1/public/{org}/{project}/test-status',
  operationId: 'getTestPublicStatus',
  responses: {
    200: { description: 'Status', content: { 'application/json': { schema: z.object({ up: z.boolean() }) } } }
  },
  x: { owner: 'test', statement: 'public', idempotent: false }
})

function notesApi(handler = vi.fn()) {
  let n = 0
  handler.mockImplementation(async (c) => {
    n += 1
    return c.json({ id: `note-${n}`, text: (await c.req.json()).text }, 201)
  })
  const app = createTestApi({
    v1: [createNote, getStatus] as SkyclauseRoute[],
    handlers: {
      createTestNote: { handler },
      getTestPublicStatus: { handler: (c) => c.json({ up: true }, 200) }
    }
  })
  return { ...app, handler }
}

const editor = () => asSession({ org: 'notes', role: 'editor' })
const post = (as: ReturnType<typeof editor>, body: unknown, idempotencyKey?: string) => ({
  as,
  method: 'POST',
  path: '/v1/projects/p-1/notes',
  org: 'notes',
  body,
  idempotencyKey
})

describe('idempotency', () => {
  it('replays the stored response for a repeated key, refuses another body, and frees the key after 24 h', async () => {
    const { v1, handler, deps } = notesApi()
    const member = editor()

    const first = await apiRequest(v1, post(member, { text: 'storm' }, 'key-1'))
    expect(first.status).toBe(201)
    const replay = await apiRequest(v1, post(member, { text: 'storm' }, 'key-1'))
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(await first.json())
    expect(handler).toHaveBeenCalledTimes(1)

    const mismatch = await apiRequest(v1, post(member, { text: 'haze' }, 'key-1'))
    expect(mismatch.status).toBe(422)
    const problem = (await mismatch.json()) as Json
    expect(Problem.safeParse(problem).success).toBe(true)
    expect(problem.type).toBe('https://docs.skyclause.m1ku.tech/problems/idempotency-mismatch')

    deps.clock.advance(24 * 3_600_000 + 1)
    const fresh = await apiRequest(v1, post(member, { text: 'haze' }, 'key-1'))
    expect(fresh.status).toBe(201)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('keeps no failed response, so a retry with the same key runs again', async () => {
    const { v1, handler } = notesApi()
    const member = editor()
    const invalid = await apiRequest(v1, post(member, { text: '' }, 'key-2'))
    expect(invalid.status).toBe(422)
    expect((await apiRequest(v1, post(member, { text: 'ok' }, 'key-2'))).status).toBe(201)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('answers 422 validation-failed pointing at the missing Idempotency-Key header', async () => {
    const { v1 } = notesApi()
    const response = await apiRequest(v1, post(editor(), { text: 'storm' }))
    expect(response.status).toBe(422)
    const body = (await response.json()) as Json
    expect(Problem.safeParse(body).success).toBe(true)
    expect(body).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/validation-failed',
      errors: [{ in: 'header', pointer: '/Idempotency-Key' }]
    })
  })

  it('answers 409 to a repeat while the first request still runs', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { v1 } = notesApi(
      vi.fn(async (c) => {
        await gate
        return c.json({ id: 'slow', text: 'slow' }, 201)
      })
    )
    const member = editor()
    const first = apiRequest(v1, post(member, { text: 'slow' }, 'key-3'))
    const second = await apiRequest(v1, post(member, { text: 'slow' }, 'key-3'))
    expect(second.status).toBe(409)
    release()
    expect((await first).status).toBe(201)
  })
})

describe('validation', () => {
  it('answers 422 validation-failed with a pointer per field', async () => {
    const { v1 } = notesApi()
    const response = await apiRequest(v1, post(editor(), { text: 7 }, 'key-4'))
    expect(response.status).toBe(422)
    const body = (await response.json()) as Json
    expect(Problem.safeParse(body).success).toBe(true)
    expect(body.errors).toEqual([{ in: 'body', pointer: '/text', detail: expect.any(String) }])
  })

  it('answers malformed JSON as 422 validation-failed', async () => {
    const { v1 } = notesApi()
    const response = await v1.fetch(
      new Request('https://api.skyclause.m1ku.tech/v1/projects/p-1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Skyclause-Organization': 'notes', 'Idempotency-Key': 'key-6' },
        body: '{"text":'
      }),
      { principal: editor() }
    )
    expect(response.status).toBe(422)
    expect(((await response.json()) as Json).type).toBe('https://docs.skyclause.m1ku.tech/problems/validation-failed')
  })

  it('fails a response that does not match its schema outside production, as a 500 without a stack', async () => {
    const { v1 } = createTestApi({
      v1: [createNote] as SkyclauseRoute[],
      handlers: { createTestNote: { handler: (c) => c.json({ id: 1 }, 201) } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await apiRequest(v1, post(editor(), { text: 'storm' }, 'key-5'))
    expect(response.status).toBe(500)
    const body = (await response.json()) as Json
    expect(Problem.safeParse(body).success).toBe(true)
    expect(body.type).toBe('https://docs.skyclause.m1ku.tech/problems/internal-error')
    expect(JSON.stringify(body)).not.toContain('at ')
  })
})

describe('rate limits', () => {
  it('answers 429 rate-limited with Retry-After in seconds once an IP passes its limit', async () => {
    const { v1, deps } = notesApi()
    const call = () =>
      apiRequest(v1, {
        method: 'GET',
        path: '/v1/public/o/p/test-status',
        headers: { 'X-Forwarded-For': '203.0.113.9' }
      })
    for (let i = 0; i < IP_LIMIT; i++) expect((await call()).status).toBe(200)
    deps.clock.advance(15_000)
    const limited = await call()
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('45')
    const body = (await limited.json()) as Json
    expect(Problem.safeParse(body).success).toBe(true)
    expect(body.type).toBe('https://docs.skyclause.m1ku.tech/problems/rate-limited')

    // Another address has its own bucket; the window resets after a minute.
    const other = await apiRequest(v1, {
      method: 'GET',
      path: '/v1/public/o/p/test-status',
      headers: { 'X-Forwarded-For': '203.0.113.9, 198.51.100.4' }
    })
    expect(other.status).toBe(200)
    deps.clock.advance(45_000)
    expect((await call()).status).toBe(200)
  })

  it('keys a credential bucket on the key, never the raw IP', async () => {
    const hits: string[] = []
    const deps = testDeps({
      rateLimits: {
        async hit({ bucket, now }) {
          hits.push(bucket)
          return { count: 1, resetAt: now }
        }
      }
    })
    const { v1 } = createTestApi({ deps })
    const key = asApiKey({ org: 'limits', role: 'admin', scopes: ['read'] })
    await apiRequest(v1, {
      as: key,
      method: 'GET',
      path: '/v1/projects',
      headers: { 'X-Forwarded-For': '203.0.113.9' }
    })
    await apiRequest(v1, { method: 'GET', path: '/v1/public/status', headers: { 'X-Forwarded-For': '203.0.113.9' } })
    expect(hits[0]).toBe(`api_key:${key.kind === 'api_key' && key.keyId}`)
    expect(hits[1]).toMatch(/^ip:[0-9a-f]{64}$/)
    expect(hits.join()).not.toContain('203.0.113.9')
  })
})

describe('in-process calls (D5)', () => {
  it('keep their principal on a public route, rate-limited by it and never by a shared IP bucket', async () => {
    const hits: string[] = []
    const deps = testDeps({
      rateLimits: {
        async hit({ bucket, now }) {
          hits.push(bucket)
          return { count: 1, resetAt: now }
        }
      }
    })
    const { v1 } = createTestApi({ deps })
    const grant = asOAuth({ org: 'public-mcp', role: 'viewer' })
    await apiRequest(v1, {
      as: grant,
      method: 'GET',
      path: '/v1/public/status',
      headers: { 'Skyclause-Client': 'mcp; name="claude-code"; tool="get_status"' }
    })
    expect(hits).toEqual([`oauth:${grant.kind === 'oauth' && grant.grantId}`])
    expect(deps.audits).toMatchObject([{ action: 'mcp.tool_called', target: { id: 'get_status' } }])
  })
})

describe('CORS', () => {
  it('allows * without credentials on /v1/public/*', async () => {
    const { v1 } = notesApi()
    const response = await apiRequest(v1, {
      method: 'GET',
      path: '/v1/public/o/p/test-status',
      headers: { Origin: 'https://someone.example' }
    })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('allows only APP_ORIGIN on other /v1 routes, exposing the API headers, also on a problem', async () => {
    const { v1 } = createTestApi()
    const preflight = await apiRequest(v1, {
      method: 'OPTIONS',
      path: '/v1/projects',
      headers: {
        Origin: TEST_APP_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,skyclause-organization,last-event-id'
      }
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN)
    const allowed = preflight.headers.get('Access-Control-Allow-Headers')?.split(',') ?? []
    for (const header of [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'Last-Event-ID',
      'Skyclause-Organization'
    ]) {
      expect(allowed).toContain(header)
    }
    expect(preflight.headers.get('Access-Control-Allow-Credentials')).toBeNull()

    const failed = await apiRequest(v1, { method: 'GET', path: '/v1/projects', headers: { Origin: TEST_APP_ORIGIN } })
    expect(failed.status).toBe(401)
    expect(failed.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN)
    expect(failed.headers.get('Access-Control-Expose-Headers')?.split(',')).toEqual([
      'Retry-After',
      'Deprecation',
      'Sunset',
      'Link'
    ])

    const foreign = await apiRequest(v1, {
      method: 'GET',
      path: '/v1/projects',
      headers: { Origin: 'https://evil.example' }
    })
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
