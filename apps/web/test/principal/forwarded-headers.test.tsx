// A malformed X-Forwarded-Host or X-Forwarded-Proto must never break the in-process requests a page builds.
import { afterEach, expect, test, vi } from 'vitest'
import { resolvePrincipal } from '@skyclause/auth'
import { api } from '../../lib/api'
import { getPrincipal } from '../../lib/principal'
import SubscriberDataPage from '../../app/(auth)/subscribe/[token]/data/page'

const incoming = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => incoming.headers }))
vi.mock('@skyclause/auth', () => ({ resolvePrincipal: vi.fn(async () => null) }))
vi.mock('../../lib/api', () => ({ api: { fetch: vi.fn(async () => new Response(null, { status: 404 })) } }))

const MALFORMED = [
  { 'x-forwarded-host': 'user@evil.com' },
  { 'x-forwarded-host': 'bad:port' },
  { 'x-forwarded-host': '' },
  { 'x-forwarded-proto': 'bad:port' },
  { 'x-forwarded-proto': '' }
]

afterEach(() => vi.clearAllMocks())

test('the page principal is read from a fixed in-process URL, whatever the forwarded headers say', async () => {
  vi.stubEnv('APP_ENV', 'production')
  for (const forwarded of MALFORMED) {
    incoming.headers = new Headers({ host: 'app.skyclause.m1ku.tech', cookie: 'a=b', ...forwarded })
    await expect(getPrincipal(), JSON.stringify(forwarded)).resolves.toBeNull()
    const request = vi.mocked(resolvePrincipal).mock.calls.at(-1)![0] as Request
    expect(new URL(request.url).host).toBe('in-process.invalid')
    expect(request.headers.get('cookie')).toBe('a=b')
  }
  vi.unstubAllEnvs()
})

test('the subscriber data page reads its API at a fixed in-process URL, whatever the forwarded headers say', async () => {
  for (const forwarded of MALFORMED) {
    incoming.headers = new Headers({ host: 'app.skyclause.m1ku.tech', 'x-forwarded-for': '203.0.113.9', ...forwarded })
    await expect(SubscriberDataPage({ params: Promise.resolve({ token: 'tok/en' }) })).resolves.toBeTruthy()
    const request = vi.mocked(api.fetch).mock.calls.at(-1)![0] as Request
    expect(request.url).toBe('https://in-process.invalid/api/subscribe/tok%2Fen/data')
    expect(request.headers.get('x-forwarded-for')).toBe('203.0.113.9')
  }
})
