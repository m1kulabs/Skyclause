import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem, createApiFetch } from '../../lib/api-fetch'
import { testRegistry, validProblem } from './registry'

const apiFetch = createApiFetch(testRegistry)

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
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
  expect(url.pathname).toBe('/v1/orgs/acme/projects')
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
