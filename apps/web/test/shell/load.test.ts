import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadShellData } from '../../features/shell/load'

// Server-side reads have no default origin, so each test names the API's.
beforeEach(() => {
  vi.stubEnv('API_ORIGIN', 'http://localhost:3000')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const membership = {
  id: 'membership-test',
  org_id: 'org-test',
  account_id: 'account-test',
  role: 'owner',
  reads_malay: false,
  org_name: 'Test organisation',
  org_slug: 'test-org'
}
const project = {
  id: 'project-test',
  org_id: 'org-test',
  name: 'Test project',
  slug: 'test-project',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: '2027-02-05',
  site_name: 'Test site',
  site_lat: 3,
  site_lon: 101,
  archived_at: null,
  camera_day_start: '08:00',
  camera_day_end: '18:00',
  warning_area_terms: [],
  packs: []
}
const preferences = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  sidebar_collapsed: true
}

function answerShell(input: string | URL) {
  const { pathname } = new URL(input)
  if (pathname === '/api/me/memberships') return Response.json({ data: [membership], next_cursor: null })
  if (pathname === '/api/me/preferences') return Response.json(preferences)
  return Response.json({ data: [project], next_cursor: null })
}

test('loads only real memberships and their scoped projects, following cursors and forwarding the session', async () => {
  const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input)
    const headers = new Headers(init?.headers)
    expect(headers.get('cookie')).toBe('session=test')
    expect(init?.cache).toBe('no-store')
    if (url.pathname === '/api/me/memberships') {
      return Response.json({
        data: url.searchParams.has('cursor') ? [] : [membership],
        next_cursor: url.searchParams.has('cursor') ? null : 'next'
      })
    }
    if (url.pathname === '/api/me/preferences') return new Response(null, { status: 501 })
    expect(url.pathname).toBe('/v1/projects')
    expect(headers.get('Skyclause-Organization')).toBe('test-org')
    return Response.json({ data: [project, { ...project, id: 'foreign', org_id: 'other' }], next_cursor: null })
  })
  vi.stubGlobal('fetch', fetcher)
  const data = await loadShellData(new Headers({ cookie: 'session=test' }))
  expect(data.memberships).toEqual([membership])
  expect(data.projects).toEqual([project])
  expect(data.sidebarCollapsed).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(4)
})

test('routes /api/me reads to APP_ORIGIN and /v1/projects to API_ORIGIN in multi-host mode', async () => {
  vi.stubEnv('HOST_MODE', 'multi')
  vi.stubEnv('APP_ORIGIN', 'https://app.skyclause.m1ku.tech')
  vi.stubEnv('API_ORIGIN', 'https://api.skyclause.m1ku.tech')
  const fetcher = vi.fn(async (input: string | URL) => answerShell(input))
  vi.stubGlobal('fetch', fetcher)

  const data = await loadShellData(new Headers({ cookie: 'session=test' }))

  expect(data).toEqual({ memberships: [membership], projects: [project], sidebarCollapsed: true })
  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([
    'https://api.skyclause.m1ku.tech/v1/projects',
    'https://app.skyclause.m1ku.tech/api/me/memberships',
    'https://app.skyclause.m1ku.tech/api/me/preferences'
  ])
})

test('sends the session and a time limit to the configured origins, never to a host named by the request', async () => {
  vi.stubEnv('HOST_MODE', 'multi')
  vi.stubEnv('APP_ORIGIN', 'https://app.skyclause.m1ku.tech')
  vi.stubEnv('API_ORIGIN', 'https://api.skyclause.m1ku.tech')
  const fetcher = vi.fn(async (input: string | URL, _init?: RequestInit) => answerShell(input))
  vi.stubGlobal('fetch', fetcher)

  await loadShellData(
    new Headers({
      cookie: 'session=test',
      authorization: 'Bearer test',
      host: 'evil.example',
      'x-forwarded-host': 'evil.example',
      origin: 'https://evil.example'
    })
  )

  expect(fetcher).toHaveBeenCalledTimes(3)
  for (const [input, init] of fetcher.mock.calls) {
    const headers = new Headers(init?.headers)
    expect(['https://app.skyclause.m1ku.tech', 'https://api.skyclause.m1ku.tech']).toContain(new URL(input).origin)
    expect(headers.get('cookie')).toBe('session=test')
    expect(headers.get('authorization')).toBe('Bearer test')
    expect(headers.get('accept')).toBe('application/json')
    for (const name of ['host', 'x-forwarded-host', 'origin']) expect(headers.has(name)).toBe(false)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  }
})

test('keeps every read on API_ORIGIN in single-host mode', async () => {
  vi.stubEnv('HOST_MODE', 'single')
  vi.stubEnv('API_ORIGIN', 'http://localhost:3000')
  const fetcher = vi.fn(async (input: string | URL) => answerShell(input))
  vi.stubGlobal('fetch', fetcher)

  await loadShellData(new Headers({ cookie: 'session=test' }))

  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([
    'http://localhost:3000/api/me/memberships',
    'http://localhost:3000/api/me/preferences',
    'http://localhost:3000/v1/projects'
  ])
})

test('sends no request when no API origin resolves, and logs that once however many reads it stops', async () => {
  vi.stubEnv('API_ORIGIN', undefined)
  vi.stubEnv('APP_ORIGIN', undefined)
  vi.stubEnv('HOST_MODE', undefined)
  const errorLines = vi.spyOn(console, 'error').mockImplementation(() => {})
  const fetcher = vi.fn(async (input: string | URL) => answerShell(input))
  vi.stubGlobal('fetch', fetcher)

  expect(await loadShellData(new Headers({ cookie: 'session=test' }))).toEqual({
    memberships: [],
    projects: [],
    sidebarCollapsed: false
  })

  expect(fetcher).not.toHaveBeenCalled()
  expect(errorLines).toHaveBeenCalledTimes(1)
  expect(JSON.parse(String(errorLines.mock.calls[0]?.[0]))).toMatchObject({
    severity: 'ERROR',
    message: 'shell cannot read the API',
    error: expect.stringContaining('API_ORIGIN')
  })
})

test('logs nothing when the API answers a read with an error, as it does a signed-out visitor', async () => {
  const errorLines = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 }))
  )

  await loadShellData(new Headers({ cookie: 'session=test' }))

  expect(errorLines).not.toHaveBeenCalled()
})

test('returns empty data when the origin answers a page instead of JSON', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response('<!doctype html><title>Skyclause</title>', { headers: { 'Content-Type': 'text/html' } })
    )
  )
  expect(await loadShellData()).toEqual({ memberships: [], projects: [], sidebarCollapsed: false })
})

test.each([501, 500, 401])('returns empty data when memberships answer %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status }))
  )
  expect(await loadShellData()).toEqual({ memberships: [], projects: [], sidebarCollapsed: false })
})

test('keeps memberships when project reads fail and never supplies sample projects', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) =>
      new URL(input).pathname === '/api/me/memberships'
        ? Response.json({ data: [membership], next_cursor: null })
        : Promise.reject(new Error('offline'))
    )
  )
  expect(await loadShellData()).toEqual({ memberships: [membership], projects: [], sidebarCollapsed: false })
})

test('invalid response data produces an empty result', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [{ org_name: 'incomplete' }], next_cursor: null }))
  )
  expect((await loadShellData()).memberships).toEqual([])
})

test('reads a saved rail preference from the server', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) =>
      new URL(input).pathname === '/api/me/preferences'
        ? Response.json({
            theme: 'dark',
            high_contrast: false,
            density: 'comfortable',
            reduced_motion: false,
            language: 'en',
            sidebar_collapsed: true
          })
        : Response.json({ data: [], next_cursor: null })
    )
  )
  expect((await loadShellData()).sidebarCollapsed).toBe(true)
})

test('uses the empty shell state in the test runtime without calling the API', async () => {
  vi.stubEnv('APP_ENV', 'test')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)

  expect(await loadShellData()).toEqual({ memberships: [], projects: [], sidebarCollapsed: false })
  expect(fetcher).not.toHaveBeenCalled()
})
