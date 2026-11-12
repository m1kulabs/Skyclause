// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { OrgLive } from '../../features/org-live'
import { ReviewLink } from '../../features/shell/review'
import * as announceModule from '../../lib/announce'
import { Announcer } from '../../lib/announce'

const navigation = vi.hoisted(() => ({
  pathname: '/test-org',
  router: { refresh: vi.fn() }
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router
}))

const orgId = '019a45b0-0000-7000-8000-000000000011'
const sourceId = '019a45b0-0000-7000-8000-000000000012'
const ids = {
  bundle: '019a45b0-0000-7000-8000-000000000001',
  project: '019a45b0-0000-7000-8000-000000000003',
  first: '019a45b0-0000-7000-8000-000000000004'
}
const projectName = 'Test project'
const encoder = new TextEncoder()

interface StreamDouble {
  controller: ReadableStreamDefaultController<Uint8Array>
  response: Response
}

function streamDouble(): StreamDouble {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(stream) {
        controller = stream
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
  return { controller, response }
}

function domainEvent(id: string, type: string, data: Record<string, unknown>) {
  return {
    id,
    type,
    created_at: '2026-11-10T00:00:00.000Z',
    org_id: orgId,
    project_id: ids.project,
    data
  }
}

function send(stream: StreamDouble, event: string, data: unknown) {
  stream.controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
}

function setupFetch(slaDueAt = new Date(Date.now() + 8 * 60_000).toISOString()) {
  const streams: StreamDouble[] = []
  const streamHeaders: Headers[] = []
  const dueAt = slaDueAt
  const bundle = {
    id: ids.bundle,
    project_id: ids.project,
    run_id: '019a45b0-0000-7000-8000-000000000013',
    pack: 'sky',
    state: 'needs_review',
    superseded_by: null,
    review_hash: 'test-review',
    sla_due_at: dueAt,
    needs_review_at: new Date().toISOString(),
    approved_by: null,
    escalation_level: 0,
    draft_only: false,
    calls: [
      {
        id: ids.first,
        bundle_id: ids.bundle,
        window_id: null,
        night_id: null,
        mode: 'commute_disruption',
        watch: false,
        no_call: null,
        fired: [],
        recommendations: [],
        recipients: [],
        notices: [],
        reason: '',
        state: 'drafted',
        shadow: {
          scope: { kind: 'site', id: null },
          pack: 'sky',
          mode: 'commute_disruption',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        chosen: 'human',
        agrees: true,
        decision: null,
        expires_at: new Date().toISOString(),
        triggered_at: new Date().toISOString(),
        drafted_at: new Date().toISOString(),
        approved_at: null,
        sent_at: null,
        superseded_by_call_id: null,
        ics_uid: null,
        ics_sequence: 0
      }
    ],
    trigger: 'crossing',
    triggered_at: new Date().toISOString(),
    sheet_version_id: 'test-sheet',
    alerts: []
  }
  const project = {
    id: ids.project,
    org_id: orgId,
    name: projectName,
    slug: 'test-project',
    time_zone: 'Asia/Kuala_Lumpur',
    public: false,
    semester_ends_on: null,
    site_name: null,
    site_lat: null,
    site_lon: null,
    archived_at: null,
    camera_day_start: null,
    camera_day_end: null,
    warning_area_terms: [],
    packs: []
  }
  const sourcePage = {
    data: [
      {
        id: sourceId,
        kind: 'met_warning',
        external_id: 'MET warning',
        owner_org_id: null,
        name: 'MET warning',
        lat: null,
        lon: null,
        url: 'https://api.data.gov.my/weather/warning',
        cadence_s: 300,
        stale_after_s: 900,
        licence_id: 'test-licence',
        licence_label: 'Test licence',
        project_id: ids.project,
        role: 'warnings',
        state: { state: 'error', since: '2026-11-10T00:00:00.000Z', http_status: 503, pending_until: null },
        latest_reading: null,
        age_s: null,
        recent_errors: []
      }
    ],
    next_cursor: null
  }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/v1/events/stream')) {
      const stream = streamDouble()
      streams.push(stream)
      streamHeaders.push(new Headers(init?.headers))
      return stream.response
    }
    const body = url.includes(`/v1/bundles/${ids.bundle}`)
      ? bundle
      : url.includes(`/v1/projects/${ids.project}/sources`)
        ? sourcePage
        : url.includes(`/v1/projects/${ids.project}`)
          ? project
          : undefined
    if (body === undefined) return new Response(null, { status: 404 })
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { streams, streamHeaders, fetchMock, dueAt }
}

function live(org: string) {
  return (
    <>
      <OrgLive org={org} />
      <ReviewLink org={org} />
      <Announcer />
    </>
  )
}

function mountLive(org = 'test-org') {
  return render(live(org))
}

beforeEach(() => {
  navigation.pathname = '/test-org'
  navigation.router.refresh.mockReset()
  document.head.innerHTML =
    '<title>Dashboard · Skyclause</title><link rel="icon" type="image/svg+xml" href="/icon.svg">'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('recounts snapshots, dedupes repeated event IDs, and clears the final waiting count', async () => {
  const { streams, streamHeaders, dueAt } = setupFetch()
  const announcement = vi.spyOn(announceModule, 'announce')
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))
  expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/test-org#dashboard-needs-review')

  await act(async () => send(streams[0]!, 'snapshot', { needs_review: [], sources: [] }))
  // A known zero prints nothing: never "0".
  expect(screen.getByRole('link', { name: 'Review' }).textContent).toBe('Review')
  expect(document.querySelector('[data-count]')).toBeNull()
  const event = domainEvent('019a45b0-0000-7000-8000-000000000021', 'bundle.needs_review', {
    bundle_id: ids.bundle,
    pack: 'sky',
    state: 'needs_review',
    call_ids: [ids.first],
    sla_due_at: dueAt
  })
  await act(async () => send(streams[0]!, 'bundle.needs_review', event))

  await waitFor(() => expect(screen.getByRole('link', { name: 'Review, 1 waiting' })).toBeTruthy())
  expect(document.querySelector('[data-count="1"]')?.textContent).toBe('1')
  await waitFor(() =>
    expect(document.getElementById('skyclause-announcer')?.textContent).toContain(
      'New bundle needs review: Commute disruption, Test project, 8 min SLA'
    )
  )
  expect(document.title).toBe('(1) Dashboard · Skyclause')
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/brand/tab-1.svg')
  expect(announcement).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(navigation.router.refresh).toHaveBeenCalledTimes(1), { timeout: 2_000 })

  await act(async () => {
    send(streams[0]!, 'bundle.needs_review', event)
    streams[0]!.controller.close()
  })
  await waitFor(() => expect(streams).toHaveLength(2))
  await act(async () =>
    send(streams[1]!, 'snapshot', {
      needs_review: [{ bundle_id: ids.bundle, sla_due_at: dueAt }],
      sources: []
    })
  )

  expect(screen.getByRole('link', { name: 'Review, 1 waiting' })).toBeTruthy()
  expect(document.getElementById('skyclause-announcer')?.textContent).toContain(
    'New bundle needs review: Commute disruption, Test project, 8 min SLA'
  )
  expect(announcement).toHaveBeenCalledTimes(1)
  expect(streamHeaders.every((headers) => headers.get('Skyclause-Organization') === 'test-org')).toBe(true)
  expect(streamHeaders.every((headers) => !headers.has('Last-Event-ID'))).toBe(true)

  document.title = 'Windows · Skyclause'
  await waitFor(() => expect(document.title).toBe('(1) Windows · Skyclause'))

  await act(async () =>
    send(
      streams[1]!,
      'bundle.approved',
      domainEvent('019a45b0-0000-7000-8000-000000000022', 'bundle.approved', {
        bundle_id: ids.bundle,
        pack: 'sky',
        state: 'approved',
        call_ids: [ids.first],
        sla_due_at: dueAt,
        sending_call_ids: [ids.first],
        rejected_call_ids: []
      })
    )
  )
  await waitFor(() => expect(screen.getByRole('link', { name: 'Review' }).hasAttribute('aria-label')).toBe(false))
  expect(document.querySelector('[data-count]')).toBeNull()
  expect(document.title).toBe('Windows · Skyclause')
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg')
})

test('announces escalations and source errors once until recovery', async () => {
  const { streams } = setupFetch(new Date(Date.now() - 65_000).toISOString())
  const announcement = vi.spyOn(announceModule, 'announce')
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))

  await act(async () =>
    send(streams[0]!, 'snapshot', {
      needs_review: [],
      sources: [{ source_id: sourceId, state: { state: 'error', since: '2026-11-10T00:00:00.000Z' } }]
    })
  )
  const since = '2026-11-10T00:00:00.000Z'
  await act(async () =>
    send(
      streams[0]!,
      'bundle.escalated',
      domainEvent('019a45b0-0000-7000-8000-000000000031', 'bundle.escalated', {
        bundle_id: ids.bundle,
        pack: 'sky',
        state: 'escalated',
        call_ids: [ids.first],
        sla_due_at: new Date(Date.now() - 65_000).toISOString(),
        level: 'next_approver'
      })
    )
  )

  const sourceEvent = (id: string, type: 'source.error' | 'source.recovered', state: 'error' | 'recovered') =>
    domainEvent(id, type, { source_id: sourceId, state, since, http_status: 503 })
  await act(async () => {
    send(streams[0]!, 'source.error', sourceEvent('019a45b0-0000-7000-8000-000000000032', 'source.error', 'error'))
    send(streams[0]!, 'source.error', sourceEvent('019a45b0-0000-7000-8000-000000000033', 'source.error', 'error'))
  })
  await act(async () =>
    send(
      streams[0]!,
      'source.recovered',
      sourceEvent('019a45b0-0000-7000-8000-000000000034', 'source.recovered', 'recovered')
    )
  )
  await act(async () =>
    send(streams[0]!, 'source.error', sourceEvent('019a45b0-0000-7000-8000-000000000035', 'source.error', 'error'))
  )

  await waitFor(() => expect(announcement).toHaveBeenCalledTimes(2))
  expect(announcement.mock.calls.map(([message]) => message)).toEqual([
    'Bundle escalated: Commute disruption, Test project, 1 min past SLA',
    'MET warning error since 08:00 MYT'
  ])
})

test('shows raw counts accessibly and caps the favicon mark at 9+', async () => {
  const { streams } = setupFetch()
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))
  const bundleIds = Array.from({ length: 12 }, (_, index) => {
    const suffix = String(index + 1).padStart(12, '0')
    return `019a45b0-0000-7000-8000-${suffix}`
  })

  await act(async () =>
    send(streams[0]!, 'snapshot', {
      bundle_ids: bundleIds,
      source_states: { [sourceId]: { state: 'error', since: '2026-11-10T00:00:00.000Z' } }
    })
  )

  expect(screen.getByRole('link', { name: 'Review, 12 waiting' })).toBeTruthy()
  expect(document.querySelector('[data-count="12"]')?.textContent).toBe('12')
  expect(document.title).toBe('(12) Dashboard · Skyclause')
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/brand/tab-9+.svg')
})

test('keeps the title count when the browser rejects a favicon swap', async () => {
  const { streams } = setupFetch()
  const setAttribute = HTMLLinkElement.prototype.setAttribute
  vi.spyOn(HTMLLinkElement.prototype, 'setAttribute').mockImplementation(function (this: HTMLLinkElement, name, value) {
    if (name === 'href' && value.startsWith('/brand/tab-')) throw new Error('favicon update rejected')
    return setAttribute.call(this, name, value)
  })
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))

  await act(async () => send(streams[0]!, 'snapshot', { needs_review: [ids.bundle], sources: [] }))

  await waitFor(() => expect(document.title).toBe('(1) Dashboard · Skyclause'))
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg')
})

test('switching organisations clears the previous count and opens a fresh stream', async () => {
  const { streams, streamHeaders } = setupFetch()
  navigation.pathname = '/org-a'
  const mounted = mountLive('org-a')
  await waitFor(() => expect(streams).toHaveLength(1))
  await act(async () => send(streams[0]!, 'snapshot', { needs_review: [ids.bundle], sources: [] }))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Review, 1 waiting' })).toBeTruthy())

  navigation.pathname = '/org-b'
  mounted.rerender(live('org-b'))

  await waitFor(() => expect(streams).toHaveLength(2))
  expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/org-b#dashboard-needs-review')
  expect(document.querySelector('[data-count]')).toBeNull()
  expect(document.title).toBe('Dashboard · Skyclause')
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg')
  await act(async () => send(streams[1]!, 'snapshot', { needs_review: [], sources: [] }))
  expect(streamHeaders.map((headers) => headers.get('Skyclause-Organization'))).toEqual(['org-a', 'org-b'])
})

test('debounces refreshes on the approvals queue', async () => {
  const { streams } = setupFetch()
  navigation.pathname = '/test-org/approvals'
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))
  await act(async () => send(streams[0]!, 'snapshot', { needs_review: [], sources: [] }))

  await act(async () => {
    for (const [index, bundleId] of [ids.bundle, ids.first].entries()) {
      send(
        streams[0]!,
        'bundle.expired',
        domainEvent(`019a45b0-0000-7000-8000-00000000004${index}`, 'bundle.expired', {
          bundle_id: bundleId,
          pack: 'sky',
          state: 'expired',
          call_ids: [ids.first],
          sla_due_at: null
        })
      )
    }
  })
  await waitFor(() => expect(navigation.router.refresh).toHaveBeenCalledTimes(1), { timeout: 2_000 })
})

test('prints no count before the first snapshot, and drops it when the stream fails', async () => {
  const { streams, dueAt } = setupFetch()
  const announcement = vi.spyOn(announceModule, 'announce')
  mountLive()
  await waitFor(() => expect(streams).toHaveLength(1))

  // An event seen since page load is not the waiting count: only a snapshot says how many bundles wait.
  await act(async () =>
    send(
      streams[0]!,
      'bundle.needs_review',
      domainEvent('019a45b0-0000-7000-8000-000000000061', 'bundle.needs_review', {
        bundle_id: ids.bundle,
        pack: 'sky',
        state: 'needs_review',
        call_ids: [ids.first],
        sla_due_at: dueAt
      })
    )
  )
  await waitFor(() => expect(announcement).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('link', { name: 'Review' }).hasAttribute('aria-label')).toBe(false)
  expect(document.querySelector('[data-count]')).toBeNull()
  expect(document.title).toBe('Dashboard · Skyclause')

  await act(async () => send(streams[0]!, 'snapshot', { needs_review: [ids.bundle], sources: [] }))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Review, 1 waiting' })).toBeTruthy())
  expect(document.title).toBe('(1) Dashboard · Skyclause')

  await act(async () => streams[0]!.controller.error(new Error('stream dropped')))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Review' }).hasAttribute('aria-label')).toBe(false))
  expect(document.querySelector('[data-count]')).toBeNull()
  expect(document.title).toBe('Dashboard · Skyclause')
  expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.svg')
})
