import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// #93: the Hono API through its Route Handlers, in the built server (HOST_MODE=single).

test('GET /openapi.json serves the committed document', async ({ request }) => {
  const response = await request.get('/openapi.json')
  expect(response.status()).toBe(200)
  const committed = readFileSync(new URL('../../../packages/api/openapi.json', import.meta.url), 'utf8')
  expect(await response.json()).toEqual(JSON.parse(committed))
})

test('an unknown /v1 or /api path answers a 404 problem', async ({ request }) => {
  for (const path of ['/v1/no-such-operation', '/api/no-such-operation']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(response.headers()['content-type'], path).toMatch(/^application\/problem\+json/)
    expect((await response.json()).type, path).toBe('https://docs.skyclause.m1ku.tech/problems/not-found')
  }
})
