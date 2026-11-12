import { afterEach, expect, test, vi } from 'vitest'
import { loadShellData } from '../../features/shell/load'

afterEach(() => {
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
function answerShell(input: string | URL) {
  const { pathname } = new URL(input)
  if (pathname === '/api/me/memberships') return Response.json({ data: [membership], next_cursor: null })
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
    expect(url.pathname).toBe('/v1/projects')
    expect(headers.get('Skyclause-Organization')).toBe('test-org')
    return Response.json({ data: [project, { ...project, id: 'foreign', org_id: 'other' }], next_cursor: null })
  })
  vi.stubGlobal('fetch', fetcher)
  const data = await loadShellData(new Headers({ cookie: 'session=test' }))
  expect(data).toEqual({ memberships: [membership], projects: [project] })
  expect(fetcher).toHaveBeenCalledTimes(3)
})

test('routes /api/me reads to APP_ORIGIN and /v1/projects to API_ORIGIN in multi-host mode', async () => {
  vi.stubEnv('HOST_MODE', 'multi')
  vi.stubEnv('APP_ORIGIN', 'https://app.skyclause.m1ku.tech')
  vi.stubEnv('API_ORIGIN', 'https://api.skyclause.m1ku.tech')
  const fetcher = vi.fn(async (input: string | URL) => answerShell(input))
  vi.stubGlobal('fetch', fetcher)

  const data = await loadShellData(new Headers({ cookie: 'session=test' }))

  expect(data).toEqual({ memberships: [membership], projects: [project] })
  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([
    'https://api.skyclause.m1ku.tech/v1/projects',
    'https://app.skyclause.m1ku.tech/api/me/memberships'
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

  expect(fetcher).toHaveBeenCalledTimes(2)
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
    'http://localhost:3000/v1/projects'
  ])
})

const at = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

test('reports an unreadable memberships answer as a failed read, not as no organisations', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response('<!doctype html><title>Skyclause</title>', { headers: { 'Content-Type': 'text/html' } })
    )
  )
  expect(await loadShellData()).toEqual({ memberships: [], projects: [], membershipsError: { status: null, at } })
})

test.each([501, 500, 403])('reports the status when memberships answer %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status }))
  )
  expect(await loadShellData()).toEqual({ memberships: [], projects: [], membershipsError: { status, at } })
})

test('a 401 means no session: neither an error nor the no-organisation state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 }))
  )
  expect(await loadShellData()).toEqual({ memberships: [], projects: [], signedOut: true })
})

test('keeps memberships when project reads fail, marks that organisation, and never supplies sample projects', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) =>
      new URL(input).pathname === '/api/me/memberships'
        ? Response.json({ data: [membership], next_cursor: null })
        : Promise.reject(new Error('offline'))
    )
  )
  expect(await loadShellData()).toEqual({
    memberships: [membership],
    projects: [],
    projectsError: { 'org-test': { status: null, at } }
  })
})

test('invalid response data is a failed read', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ data: [{ org_name: 'incomplete' }], next_cursor: null }))
  )
  const data = await loadShellData()
  expect(data.memberships).toEqual([])
  expect(data.membershipsError).toEqual({ status: null, at })
})

test('uses the empty shell state in the test runtime without calling the API', async () => {
  vi.stubEnv('APP_ENV', 'test')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)

  expect(await loadShellData()).toEqual({ memberships: [], projects: [] })
  expect(fetcher).not.toHaveBeenCalled()
})

test('reads the planted harness cookie in the test runtime, and only there', async () => {
  const harness = {
    memberships: [{ org_id: 'org-test', org_name: 'Test organisation', org_slug: 'test-org', role: 'approver' }],
    projects: [{ id: 'project-test', org_id: 'org-test', name: 'Test project', slug: 'test-project' }]
  }
  const cookie = `session=test; skyclause-test-shell=${encodeURIComponent(JSON.stringify(harness))}`
  vi.stubEnv('APP_ENV', 'test')
  const fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  expect(await loadShellData(new Headers({ cookie }))).toEqual(harness)
  expect(fetcher).not.toHaveBeenCalled()

  vi.stubEnv('APP_ENV', 'production')
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => answerShell(input))
  )
  expect(await loadShellData(new Headers({ cookie }))).toEqual({ memberships: [membership], projects: [project] })
})
