import { z } from '@hono/zod-openapi'
import { API_ROUTES, createRoute, Problem, REGISTRY, V1_ROUTES, type SkyclauseRoute } from '@skyclause/contracts'
import { describe, expect, it } from 'vitest'
import { createApi } from '../src/app'
import { apiRequest, asDevice, asSession, createTestApi, testDeps, testOrg } from './harness'

const PROBLEM_TYPE = /^https:\/\/docs\.skyclause\.m1ku\.tech\/problems\/[a-z-]+$/

// A test-only registry: one operation with a handler and one without.
const getThing = createRoute({
  method: 'get',
  path: '/v1/things/{id}',
  operationId: 'getThing',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'A thing', content: { 'application/json': { schema: z.object({ id: z.string() }) } } }
  },
  x: { owner: 'test-things', statement: 'public', idempotent: false }
})
const listThings = createRoute({
  method: 'get',
  path: '/v1/things',
  operationId: 'listThings',
  responses: { 200: { description: 'Things', content: { 'application/json': { schema: z.array(z.string()) } } } },
  x: { owner: 'test-lists', statement: 'public', idempotent: false }
})

describe('mount-all', () => {
  it('answers 501 not-built naming the owner when an operation has no handler, and runs one that has', async () => {
    const { v1 } = createApi(testDeps(), {
      v1: [getThing, listThings] as SkyclauseRoute[],
      api: [],
      handlers: { getThing: { handler: (c) => c.json({ id: c.req.param('id') }, 200) } }
    })

    const built = await apiRequest(v1, { method: 'GET', path: '/v1/things/t1' })
    expect(built.status).toBe(200)
    expect(await built.json()).toEqual({ id: 't1' })

    const unbuilt = await apiRequest(v1, { method: 'GET', path: '/v1/things' })
    expect(unbuilt.status).toBe(501)
    expect(unbuilt.headers.get('content-type')).toMatch(/^application\/problem\+json/)
    const body = (await unbuilt.json()) as Record<string, unknown>
    expect(Problem.safeParse(body).success).toBe(true)
    expect(body).toMatchObject({
      type: 'https://docs.skyclause.m1ku.tech/problems/not-built',
      status: 501,
      owner: 'test-lists',
      instance: '/v1/things'
    })
    expect(body.detail).toContain('test-lists')
  })

  it('mounts every registry operation, and each answers 501 naming its owner until its handler lands', async () => {
    const { v1, api } = createTestApi({ handlers: {} })
    const member = asSession({ org: 'walk-org', role: 'owner', staff: true })
    // Staff use is audited in the Commons (D30), which `commons:provision` creates (D4).
    testOrg('commons')
    for (const route of REGISTRY) {
      const app = route.path.startsWith('/v1/') ? v1 : api
      const x = route['x-skyclause']
      const path = route.path.replace('{org}', 'walk-org').replace(/\{[^}]+\}/g, (name) => `${name.slice(1, -1)}-1`)
      const response = await apiRequest(app, {
        as:
          x.statement === 'public' || x.statement === 'token'
            ? undefined
            : x.statement === 'device'
              ? asDevice({ org: 'walk-org' })
              : member,
        method: route.method.toUpperCase(),
        path,
        org: 'walk-org',
        idempotencyKey: x.idempotent ? 'walk-key' : undefined,
        body: route.method === 'get' || route.method === 'delete' ? undefined : {}
      })
      expect(response.status, route.operationId).toBe(501)
      const body = (await response.json()) as Record<string, unknown>
      expect(body.type, route.operationId).toMatch(PROBLEM_TYPE)
      expect(body.owner, route.operationId).toBe(x.owner)
    }
    expect(V1_ROUTES.length + API_ROUTES.length).toBe(REGISTRY.length)
  }, 60_000)

  it('answers an unknown path under the surface with a 404 problem', async () => {
    const { v1, api } = createTestApi()
    for (const [app, path] of [
      [v1, '/v1/nothing-here'],
      [api, '/api/nothing-here']
    ] as const) {
      const response = await apiRequest(app, { method: 'GET', path })
      expect(response.status).toBe(404)
      const body = (await response.json()) as Record<string, unknown>
      expect(Problem.safeParse(body).success).toBe(true)
      expect(body.type).toBe('https://docs.skyclause.m1ku.tech/problems/not-found')
    }
  })
})
