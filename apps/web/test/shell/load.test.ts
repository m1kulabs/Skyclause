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
  const fetcher = vi.fn(async (input: string | URL) => {
    const url = new URL(input)
    if (url.pathname === '/api/me/memberships') {
      return Response.json({ data: [membership], next_cursor: null })
    }
    if (url.pathname === '/api/me/preferences') {
      return Response.json({
        theme: 'dark',
        high_contrast: false,
        density: 'comfortable',
        reduced_motion: false,
        language: 'en',
        sidebar_collapsed: true
      })
    }
    return Response.json({ data: [project], next_cursor: null })
  })
  vi.stubGlobal('fetch', fetcher)

  const data = await loadShellData(new Headers({ cookie: 'session=test' }))

  expect(data).toEqual({ memberships: [membership], projects: [project], sidebarCollapsed: true })
  expect(fetcher.mock.calls.map(([url]) => String(url)).sort()).toEqual([
    'https://api.skyclause.m1ku.tech/v1/projects',
    'https://app.skyclause.m1ku.tech/api/me/memberships',
    'https://app.skyclause.m1ku.tech/api/me/preferences'
  ])
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
