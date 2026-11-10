import { afterEach, expect, test, vi } from 'vitest'
import { aiKeyPorts } from '../src/services/ai-keys/ports'

const auth = vi.hoisted(() => ({
  source: {},
  request: vi.fn(),
  impersonation: vi.fn(),
  client: vi.fn()
}))
vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    async getClient() {
      return auth.source
    }
  },
  Impersonated: class {
    constructor(options: unknown) {
      auth.impersonation(options)
    }
  },
  IdTokenClient: class {
    constructor(options: unknown) {
      auth.client(options)
    }
    request = auth.request
  }
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test('saved-key tests use the worker invoker identity and decode its timestamp', async () => {
  vi.stubEnv('WORKER_URL', 'https://worker.example')
  vi.stubEnv('WORKER_INVOKER_SA', 'invoker@example.iam.gserviceaccount.com')
  const at = '2026-11-10T03:00:00.000Z'
  auth.request.mockResolvedValueOnce({ data: { ok: true, detail: null, tested_at: at } })
  await expect(aiKeyPorts().testInWorker({ orgId: 'org-1', keyId: 'key-1' })).resolves.toEqual({
    ok: true,
    detail: null,
    testedAt: at
  })
  expect(auth.impersonation).toHaveBeenCalledWith({
    sourceClient: auth.source,
    targetPrincipal: 'invoker@example.iam.gserviceaccount.com'
  })
  expect(auth.client).toHaveBeenCalledWith(expect.objectContaining({ targetAudience: 'https://worker.example' }))
  expect(auth.request).toHaveBeenCalledWith({
    url: 'https://worker.example/internal/ai-keys/key-1/test',
    method: 'POST',
    data: { org_id: 'org-1' },
    validateStatus: expect.any(Function)
  })
})

test('a worker result without the required timestamp is refused', async () => {
  vi.stubEnv('WORKER_URL', 'https://worker.example')
  vi.stubEnv('WORKER_INVOKER_SA', 'invoker@example.iam.gserviceaccount.com')
  auth.request.mockResolvedValueOnce({ data: { ok: true, detail: null } })
  await expect(aiKeyPorts().testInWorker({ orgId: 'org-1', keyId: 'key-1' })).rejects.toThrow()
})

test('worker rate limits and missing keys retain their public problem status', async () => {
  vi.stubEnv('WORKER_URL', 'https://worker.example')
  vi.stubEnv('WORKER_INVOKER_SA', 'invoker@example.iam.gserviceaccount.com')
  auth.request.mockResolvedValueOnce({ status: 429 })
  await expect(aiKeyPorts().testInWorker({ orgId: 'org-1', keyId: 'key-1' })).rejects.toMatchObject({
    status: 429,
    slug: 'rate-limited',
    headers: { 'Retry-After': '360' }
  })
  auth.request.mockResolvedValueOnce({ status: 404 })
  await expect(aiKeyPorts().testInWorker({ orgId: 'org-1', keyId: 'key-1' })).rejects.toMatchObject({
    status: 404,
    slug: 'not-found'
  })
})
