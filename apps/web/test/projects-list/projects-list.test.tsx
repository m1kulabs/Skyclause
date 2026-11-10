// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { REGISTRY } from '@skyclause/contracts'
import '../../features/organisations/catalogue'
import '../../features/data-components/catalogue'
import { ProjectsList, __resetProjectAgeTimerForTests } from '../../features/projects-list/projects-list'
import { apiFetch, type ProjectListItem } from '../../features/organisations/operations'

vi.mock('../../features/organisations/operations', async (original) => ({
  ...(await original<typeof import('../../features/organisations/operations')>()),
  apiFetch: vi.fn()
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  __resetProjectAgeTimerForTests()
  vi.useRealTimers()
})

const packs = [
  { pack: 'sky', enabled: true, sheet_id: 'sheet-sky', schedule: null, sla_s: 600 },
  { pack: 'crowd', enabled: false, sheet_id: 'sheet-crowd', schedule: null, sla_s: 7200 }
] as const

const base = (patch: Partial<ProjectListItem> = {}): ProjectListItem => ({
  id: 'project-test',
  org_id: 'org-test',
  name: 'Bukit Jalil',
  slug: 'bukit-jalil',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: null,
  site_name: 'APU Campus',
  site_lat: 3.05,
  site_lon: 101.7,
  archived_at: null,
  camera_day_start: null,
  camera_day_end: null,
  warning_area_terms: [],
  packs: [...packs],
  ...patch
})

// HTTP test doubles of listProjects' answer with summaries, never application data.
const summarized = (): ProjectListItem =>
  base({
    summary: {
      pack_states: [
        {
          pack: 'sky',
          basis: 'engine_verdict',
          call_id: null,
          mode: 'commute_disruption',
          watch: false,
          no_call: {
            inputs: [{ name: 'gauge', source_id: '0232901RF', state: 'fresh', since: '2026-11-02T06:00:00Z' }]
          }
        },
        { pack: 'crowd', basis: null, call_id: null, mode: null, watch: false, no_call: null }
      ],
      windows_at_risk: 2,
      signal_health: { state: 'fresh', inputs_reporting: 3, oldest_age_s: 300 },
      latest_bundle: null,
      next_night: null,
      next_storm_date: null,
      next_action: null
    }
  }) as ProjectListItem

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

test('with zero projects the page shows n=0 and Create a project (ORG-5)', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ data: [], next_cursor: null })
  render(<ProjectsList org="test-org" canCreate archived={false} />)
  expect(await screen.findByText(/No projects yet \(n=0\)/)).toBeTruthy()
  expect(await screen.findByText(/n=0/)).toBeTruthy()
  const create = (await screen.findByText('Create a project')) as HTMLAnchorElement
  expect(create.getAttribute('href')).toBe('/test-org/new')
  await expectAxeClean()
})

test('without project.manage the empty page asks for an Admin', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ data: [], next_cursor: null })
  render(<ProjectsList org="test-org" canCreate={false} archived={false} />)
  expect(await screen.findByText('Ask an Admin to create a project')).toBeTruthy()
  expect(screen.queryByText('Create a project')).toBeNull()
})

test('summaries show each pack mode, the No call text, the review count and signal health (ORG-5)', async () => {
  vi.mocked(apiFetch).mockImplementation(async () => ({ data: [summarized()], next_cursor: null }) as never)
  render(<ProjectsList org="test-org" canCreate archived={false} />)
  expect(await screen.findByText('Bukit Jalil')).toBeTruthy()
  expect(await screen.findByText(/No call: gauge since \d{2}:\d{2} MYT/)).toBeTruthy()
  expect(await screen.findByText(/2 need review/)).toBeTruthy()
  expect(await screen.findByText(/Signal health/)).toBeTruthy()
  expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
    'listProjects',
    expect.objectContaining({ org: 'test-org', query: expect.objectContaining({ include: 'summary' }) })
  )
  await expectAxeClean()
})

test('archived projects sit behind ?archived=1', async () => {
  const archived = base({ id: 'project-old', name: 'Old project', slug: 'old', archived_at: '2026-10-01T00:00:00Z' })
  vi.mocked(apiFetch).mockResolvedValue({ data: [base(), archived], next_cursor: null })
  const { unmount } = render(<ProjectsList org="test-org" canCreate archived={false} />)
  expect(await screen.findByText('Bukit Jalil')).toBeTruthy()
  expect(screen.queryByText('Old project')).toBeNull()
  unmount()
  cleanup()
  render(<ProjectsList org="test-org" canCreate archived />)
  expect(await screen.findByText('Old project')).toBeTruthy()
  expect(screen.queryByText('Bukit Jalil')).toBeNull()
})

test('the list virtualises above 50 rows', async () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    base({ id: `project-${index}`, name: `Project ${index}`, slug: `project-${index}` })
  )
  vi.mocked(apiFetch).mockResolvedValue({ data: many, next_cursor: null })
  const { container } = render(<ProjectsList org="test-org" canCreate archived={false} />)
  expect(await screen.findByText('Project 0')).toBeTruthy()
  expect(container.querySelector('[data-virtualized="true"]')).toBeTruthy()
})

test('signal ages tick at least once a minute with an injected clock (NFR-1)', async () => {
  __resetProjectAgeTimerForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T07:12:00Z'))
  vi.mocked(apiFetch).mockResolvedValue({ data: [summarized()], next_cursor: null })
  render(<ProjectsList org="test-org" canCreate archived={false} />)
  await act(async () => {})
  expect(screen.getByText(/oldest 5 min old/)).toBeTruthy()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(61_000)
  })
  expect(screen.getByText(/oldest 6 min old/)).toBeTruthy()
})

test('the stubbed summaries parse against the listProjects response schema', () => {
  const listProjects = REGISTRY.find((route) => route.operationId === 'listProjects')!
  const response = listProjects.responses[200].content['application/json'].schema
  expect(() =>
    response.parse({
      data: [base(), base({ id: 'project-old', archived_at: '2026-10-01T00:00:00Z' }), summarized()],
      next_cursor: null
    })
  ).not.toThrow()
})
