import { setImmediate } from 'node:timers/promises'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { z } from '@hono/zod-openapi'
import { createRoute, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it } from 'vitest'
import { apiRequest, asSession, createTestApi, TEST_APP_ORIGIN, testDeps } from './harness'

// Exercise the native Response finalizer even when the suite was not launched with --expose-gc.
const gc: () => void =
  globalThis.gc ??
  (() => {
    setFlagsFromString('--expose_gc')
    const collect: () => void = runInNewContext('gc')
    setFlagsFromString('--no-expose_gc')
    return collect
  })()

async function collectResponses() {
  for (let i = 0; i < 5; i++) {
    gc()
    await setImmediate()
  }
}

const json = '{\n  "id": "rename", "name": "Bukit Jalil 🌳"\n}'
const schema = z.object({ id: z.string(), name: z.string() })

function responseApi({
  idempotent = false,
  production = false,
  bytes = new TextEncoder().encode(json),
  status = 201,
  contentType = 'application/json'
}: {
  idempotent?: boolean
  production?: boolean
  bytes?: Uint8Array<ArrayBuffer> | null
  status?: 201 | 204 | 205 | 304
  contentType?: string
} = {}) {
  let calls = 0
  const route = createRoute({
    method: 'post',
    path: '/v1/test-response',
    operationId: 'createTestResponse',
    responses: { [status]: { description: 'Response', content: { [contentType]: { schema } } } },
    x: { owner: 'test', statement: 'public', idempotent }
  })
  const deps = testDeps()
  if (production) {
    const config = deps.config()
    deps.config = () => ({ ...config, appEnv: 'production' })
  }
  const app = createTestApi({
    deps,
    v1: [route] as SkyclauseRoute[],
    handlers: {
      createTestResponse: {
        handler: () => {
          calls++
          const headers = new Headers({ 'Content-Type': contentType, 'X-Response': 'preserved' })
          headers.append('Set-Cookie', 'first=1; Path=/; HttpOnly')
          headers.append('Set-Cookie', 'second=2; Path=/; HttpOnly')
          return new Response(bytes, { status, statusText: 'Custom response', headers })
        }
      }
    }
  })
  const request = (body = { name: 'Bukit Jalil' }) =>
    apiRequest(app.v1, {
      method: 'POST',
      path: route.path,
      headers: { Origin: TEST_APP_ORIGIN },
      body,
      idempotencyKey: 'response-ownership'
    })
  return { request, calls: () => calls }
}

describe('response body ownership through CORS', () => {
  it('keeps a schema-validated response readable after collection', async () => {
    const app = responseApi()
    const response = await app.request()
    await collectResponses()
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Custom response')
    expect(response.headers.get('X-Response')).toBe('preserved')
    expect(response.headers.getSetCookie()).toEqual(['first=1; Path=/; HttpOnly', 'second=2; Path=/; HttpOnly'])
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(TEST_APP_ORIGIN)
    expect(response.headers.get('Vary')).toContain('Origin')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new TextEncoder().encode(json))
  })

  it.each([false, true])(
    'keeps first and replay bodies readable after collection (production=%s)',
    async (production) => {
      const app = responseApi({ idempotent: true, production })
      const first = await app.request()
      const replay = await app.request()
      await collectResponses()
      expect(first.status).toBe(201)
      expect(replay.status).toBe(201)
      expect(await replay.text()).toBe(json)
      expect(await first.text()).toBe(json)
      expect(app.calls()).toBe(1)
      const mismatch = await app.request({ name: 'Cheras' })
      expect(mismatch.status).toBe(422)
      expect(await mismatch.json()).toMatchObject({
        type: 'https://docs.skyclause.m1ku.tech/problems/idempotency-mismatch'
      })
    }
  )

  it('preserves original JSON bytes when validation decodes invalid UTF-8', async () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('{"id":"rename","name":"'),
      0xff,
      0xfe,
      ...new TextEncoder().encode('"}')
    ])
    const { request } = responseApi({ bytes })
    const response = await request()
    expect(response.status).toBe(201)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('preserves outgoing binary bytes during idempotency inspection', async () => {
    const bytes = new Uint8Array([0, 0xff, 0xfe, 0x80, 13, 10])
    const { request } = responseApi({ idempotent: true, bytes, contentType: 'application/octet-stream' })
    const response = await request()
    await collectResponses()
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Custom response')
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it.each([204, 205, 304] as const)('leaves the null body of an inspected %i response null', async (status) => {
    const { request } = responseApi({ idempotent: true, status, bytes: null, contentType: 'text/plain' })
    const response = await request()
    await collectResponses()
    expect(response.status).toBe(status)
    expect(response.statusText).toBe('Custom response')
    expect(response.body).toBeNull()
    expect(await response.text()).toBe('')
  })

  it('keeps uninspected event streams unbuffered', async () => {
    const route = createRoute({
      method: 'get',
      path: '/v1/test-events',
      operationId: 'getTestEvents',
      responses: { 200: { description: 'Events', content: { 'text/event-stream': { schema: z.string() } } } },
      x: { owner: 'test', statement: 'public', idempotent: false }
    })
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start: (value) => (controller = value) })
    const { v1 } = createTestApi({
      v1: [route] as SkyclauseRoute[],
      handlers: {
        getTestEvents: { handler: () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }) }
      }
    })
    const response = await apiRequest(v1, { method: 'GET', path: route.path })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    controller.enqueue(new TextEncoder().encode('data: updated\n\n'))
    expect(await reader.read()).toEqual({ done: false, value: new TextEncoder().encode('data: updated\n\n') })
    controller.close()
    expect(await reader.read()).toEqual({ done: true, value: undefined })
  })

  it('preserves the first API key after collection and redacts only its stored replay', async () => {
    const { api, deps } = createTestApi()
    const as = asSession({ org: 'ownership-keys', role: 'owner' })
    const request = () =>
      apiRequest(api, {
        as,
        method: 'POST',
        path: '/api/orgs/ownership-keys/api-keys',
        body: { name: 'CI deploy', scopes: ['read'], expires_in_days: 30 },
        idempotencyKey: 'ownership-key'
      })
    const first = await request()
    const replay = await request()
    await collectResponses()
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    const created = (await first.json()) as { key: string; id: string }
    expect(created.key).toMatch(/^skc_/)
    const { key: _key, ...metadata } = created
    expect(await replay.json()).toEqual(metadata)
    expect(deps.audits).toHaveLength(1)
    expect(JSON.stringify([...deps.idempotency.records.values()])).not.toContain(created.key)
  })
})
