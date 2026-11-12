import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem, createApiFetch } from '../../lib/api-fetch'
import { testRegistry, validProblem } from './registry'

const apiFetch = createApiFetch(testRegistry)

test('explicit organisation scopes developer pages instead of the developers path segment', async () => {
  vi.stubGlobal('window', { location: { pathname: '/developers/webhooks' } })
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  await apiFetch('getProjects', { org: 'real-org', params: { instance: 'real-org' } })
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Skyclause-Organization')).toBe('real-org')
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

test('routes browser /api and /v1 calls to the app origin in multi-host mode', async () => {
  vi.stubEnv('HOST_MODE', 'multi')
  vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.example.test')
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test', pathname: '/' } })
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  const fetcher = createApiFetch({
    ...testRegistry,
    getMyPreferences: {
      method: 'GET',
      path: '/api/me/preferences',
      response: { parse: (value: unknown) => value }
    }
  })

  await fetcher('getMyPreferences', {})
  await fetcher('getProjects', { params: { instance: 'acme' } })

  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    'https://app.example.test/api/me/preferences',
    'https://app.example.test/api/v1/orgs/acme/projects'
  ])
})

test('routes server /api calls to APP_ORIGIN and /v1 calls to API_ORIGIN in multi-host mode', async () => {
  vi.stubEnv('HOST_MODE', 'multi')
  vi.stubEnv('APP_ORIGIN', 'https://app.example.test')
  vi.stubEnv('API_ORIGIN', 'https://api.example.test')
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  const fetcher = createApiFetch({
    ...testRegistry,
    getMyPreferences: {
      method: 'GET',
      path: '/api/me/preferences',
      response: { parse: (value: unknown) => value }
    }
  })

  await fetcher('getMyPreferences', {})
  await fetcher('getProjects', { params: { instance: 'acme' } })

  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    'https://app.example.test/api/me/preferences',
    'https://api.example.test/v1/orgs/acme/projects'
  ])
})

test('uses the organisation slug in the current URL for Skyclause-Organization', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test', pathname: '/acme/project/settings' } })
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)

  await apiFetch('getProjects', {
    params: { instance: 'acme' },
    query: { title: 'active' }
  })

  const [requestUrl, init] = fetchMock.mock.calls[0] ?? []
  expect(new Headers(init?.headers).get('Skyclause-Organization')).toBe('acme')
  const url = new URL(String(requestUrl), 'https://app.example.test')
  expect(url.pathname).toBe('/api/v1/orgs/acme/projects')
  expect(url.searchParams.get('title')).toBe('active')
})

test('adds one fresh Idempotency-Key to each idempotent call', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  const fetcher = createApiFetch(testRegistry)

  await fetcher('createProject', { params: { instance: 'acme' }, body: { detail: 'First project' } })
  await fetcher('createProject', { params: { instance: 'acme' }, body: { detail: 'Second project' } })

  const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
  expect(keys).toHaveLength(2)
  expect(keys.every(Boolean)).toBe(true)
  expect(new Set(keys).size).toBe(2)
  expect(fetchMock.mock.calls.every(([, init]) => init?.body !== undefined)).toBe(true)
  expect(
    fetchMock.mock.calls.every(([, init]) => new Headers(init?.headers).get('Content-Type') === 'application/json')
  ).toBe(true)
})

test('throws ApiProblem with the RFC 9457 body on a 4xx response', async () => {
  const problem = { ...validProblem, status: 422 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse(problem, 422))
  )

  const error = await apiFetch('getProjects', { params: { instance: 'acme' } }).catch((caught: unknown) => caught)

  expect(error).toBeInstanceOf(ApiProblem)
  expect(error).toMatchObject({ status: 422, body: problem })
})

test('a 429 keeps when to try again, from Retry-After in seconds or as an HTTP date', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-13T04:00:00.000Z'), toFake: ['Date'] })
  try {
    const limited = (retryAfter: string | null) =>
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...validProblem, status: 429 }), {
            status: 429,
            headers: {
              'Content-Type': 'application/problem+json',
              ...(retryAfter ? { 'Retry-After': retryAfter } : {})
            }
          })
      )
    const read = async (retryAfter: string | null) => {
      vi.stubGlobal('fetch', limited(retryAfter))
      return (await apiFetch('getProjects', { params: { instance: 'acme' } }).catch(
        (caught: unknown) => caught
      )) as ApiProblem
    }
    expect((await read('30')).retryAt).toBe('2026-11-13T04:00:30.000Z')
    expect((await read('Fri, 13 Nov 2026 04:02:00 GMT')).retryAt).toBe('2026-11-13T04:02:00.000Z')
    expect((await read(null)).retryAt).toBeNull()
    expect((await read('soon')).retryAt).toBeNull()
  } finally {
    vi.useRealTimers()
  }
})

test('SET-7 deferred writes forward keepalive only when requested', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  await apiFetch('createProject', {
    params: { instance: 'acme' },
    body: { detail: 'Deferred write test' },
    keepalive: true
  })
  await apiFetch('getProjects', { params: { instance: 'acme' } })
  expect(fetchMock.mock.calls[0]?.[1]?.keepalive).toBe(true)
  expect(fetchMock.mock.calls[1]?.[1]?.keepalive).toBeUndefined()
})

function typeChecks(fetcher: ReturnType<typeof createApiFetch<typeof testRegistry>>) {
  fetcher('getProjects', { params: { instance: 'acme' }, query: { title: 'active' } })
  // @ts-expect-error Operation IDs must come from the bound registry.
  fetcher('missingOperation', {})
  // @ts-expect-error Path parameter values come from the operation request schema.
  fetcher('getProjects', { params: { instance: 42 } })
}

void typeChecks

test('step-up retries can retain the same idempotency key', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  for (let attempt = 0; attempt < 2; attempt++) {
    await apiFetch('createProject', {
      params: { instance: 'acme' },
      body: { detail: 'Retry the same write' },
      idempotencyKey: 'same-write'
    })
  }
  expect(fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))).toEqual([
    'same-write',
    'same-write'
  ])
})

test('explicit organisation wins over the global connect route for client creation', async () => {
  vi.stubGlobal('window', { location: { pathname: '/connect' } })
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)
  await apiFetch('getProjects', { params: { instance: 'chosen-org' }, org: 'chosen-org' })
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Skyclause-Organization')).toBe('chosen-org')
})

test('reads a text/csv API response as text for filtered audit exports', async () => {
  const csvFetch = createApiFetch({
    exportCsv: {
      method: 'GET',
      path: '/api/orgs/acme/audit/export',
      response: {
        parse(value: unknown) {
          if (typeof value !== 'string') throw new TypeError('Expected a CSV string')
          return value
        }
      }
    }
  })
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('id,action\nentry-1,member.role_changed\n', { headers: { 'Content-Type': 'text/csv' } })
  )
  vi.stubGlobal('fetch', fetchMock)

  await expect(csvFetch('exportCsv', { headers: { Accept: 'text/csv' } })).resolves.toBe(
    'id,action\nentry-1,member.role_changed\n'
  )
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Accept')).toBe('text/csv')
})

// #737: the session cookie is host-only on the app host, so the browser reads /v1 through the app's own /api/v1.
test.each([undefined, 'https://api.example.test'])(
  'the browser sends /v1 to the app origin at /api/v1 when NEXT_PUBLIC_API_ORIGIN is %j',
  async (publicApiOrigin) => {
    vi.stubEnv('HOST_MODE', 'multi')
    vi.stubEnv('API_ORIGIN', 'https://api.example.test')
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', publicApiOrigin)
    vi.stubGlobal('window', { location: { origin: 'https://app.example.test', pathname: '/acme/rain/settings' } })
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('getProjects', { params: { instance: 'acme' }, query: { title: 'rain' } })

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://app.example.test/api/v1/orgs/acme/projects?title=rain'
    ])
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Skyclause-Organization')).toBe('acme')
  }
)

test('the browser keeps an explicit baseUrl, such as the camera’s API origin', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://app.example.test', pathname: '/acme' } })
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(validProblem))
  vi.stubGlobal('fetch', fetchMock)

  await createApiFetch(testRegistry, { baseUrl: 'https://api.example.test' })('getProjects', {
    params: { instance: 'acme' }
  })

  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(['https://api.example.test/v1/orgs/acme/projects'])
})

test('parses a CSV export as text through the operation response schema', async () => {
  const csv = 'id,kind\r\nentry-1,call_approved\r\n'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } }))
  )
  const fetcher = createApiFetch({
    exportLedger: {
      method: 'GET',
      path: '/v1/projects/{id}/ledger/export',
      request: { params: {} as { id: string } },
      response: {
        parse: (value: unknown) => {
          if (typeof value !== 'string') throw new Error('Expected CSV')
          return value
        }
      }
    }
  })
  expect(await fetcher('exportLedger', { params: { id: 'p' } })).toBe(csv)
})
