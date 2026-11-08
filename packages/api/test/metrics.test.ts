import { recordHttpServerDuration } from '@skyclause/config'
import { expect, it, vi } from 'vitest'
import { apiRequest, asApiKey, createTestApi } from './harness'

vi.mock('@skyclause/config', async (original) => ({
  ...(await original<typeof import('@skyclause/config')>()),
  recordHttpServerDuration: vi.fn()
}))

// #114's contract: one `http.server.request.duration` per request, with the full template from `/` and never a raw
// path, which `dashboards.tf` filters on `/(v1|api)/.*`.
it('records the route template with its surface prefix, and nothing for an unmatched path', async () => {
  const { v1, api } = createTestApi()
  const key = asApiKey({ org: 'metrics', role: 'admin', scopes: ['read'] })
  await apiRequest(v1, { as: key, method: 'GET', path: '/v1/projects/0192f0e4-0000-7000-8000-000000000001' })
  await apiRequest(api, { method: 'GET', path: '/api/subscribe/a-token' })
  await apiRequest(v1, { method: 'GET', path: '/v1/no/such/route' })

  expect(vi.mocked(recordHttpServerDuration).mock.calls).toEqual([
    [{ method: 'GET', route: '/v1/projects/:id', status: 501 }, expect.any(Number)],
    [{ method: 'GET', route: '/api/subscribe/:token', status: 501 }, expect.any(Number)]
  ])
})
