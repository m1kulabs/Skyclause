// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardPage } from '../../features/dashboard/dashboard-page'
import { readDashboard, readDashboardBlock, type DashboardRead } from '../../features/dashboard/operations'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('../../features/dashboard/operations', async (original) => ({
  ...(await original<typeof import('../../features/dashboard/operations')>()),
  readDashboard: vi.fn(),
  readDashboardBlock: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.mocked(readDashboard).mockReset()
  vi.mocked(readDashboardBlock).mockReset()
})

const at = '2026-11-13T01:00:00.000Z'
const empty = { ok: true as const, data: [], n: 0 }
/** One project whose sources failed to read and whose other blocks loaded empty. */
const data = {
  projects: [{ id: 'p1', slug: 'river', name: 'River', archived_at: null, summary: null }],
  covered: 1,
  windowsBasis: 'latest_call',
  firstCall: null,
  strip: null,
  readAt: at,
  needs_review: empty,
  windows_at_risk: empty,
  signal_health: { ok: false, status: 503, at },
  upcoming_risks: empty,
  yesterday_grades: empty
} as unknown as DashboardRead

const block = (key: string) => document.querySelector<HTMLElement>(`[data-dashboard-block="${key}"]`)!

test("a block's Retry reads that block only, keeps the blocks that loaded, shows its own skeleton, then focuses its heading", async () => {
  let land!: (value: DashboardRead) => void
  vi.mocked(readDashboardBlock).mockReturnValue(new Promise((resolve) => (land = resolve)))
  render(<DashboardPage org="acme" initialData={data} initialError={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
  expect(block('needs_review').getAttribute('aria-busy')).toBeNull()
  expect(block('signal_health').getAttribute('aria-busy')).toBe('true')
  expect(block('signal_health').querySelector('[data-source-error]')).toBeNull()
  // Never the whole dashboard again: that is dozens of reads for one block.
  expect(vi.mocked(readDashboardBlock).mock.calls[0]?.slice(0, 2)).toEqual(['acme', 'signal_health'])
  expect(readDashboard).not.toHaveBeenCalled()

  await act(async () => land({ ...data, signal_health: empty } as DashboardRead))
  await waitFor(() => expect(document.activeElement?.id).toBe('dashboard-signal-health'))
  expect(block('signal_health').getAttribute('aria-busy')).toBeNull()
  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
})

test('a Retry whose read fails again keeps the loaded blocks and says the failed one failed again', async () => {
  vi.mocked(readDashboardBlock).mockRejectedValue(new ApiProblem(503, { title: 'Unavailable', status: 503 }))
  render(<DashboardPage org="acme" initialData={data} initialError={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  await waitFor(() => expect(document.activeElement?.id).toBe('dashboard-signal-health'))
  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
  expect(block('signal_health').querySelector('[data-source-error="503"]')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
})

test("the page's Retry keeps its heading in place, then focuses it once the dashboard lands", async () => {
  let land!: (value: DashboardRead) => void
  vi.mocked(readDashboard).mockReturnValue(new Promise((resolve) => (land = resolve)))
  render(<DashboardPage org="acme" initialData={null} initialError={503} initialErrorAt={at} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(document.getElementById('dashboard-needs-review')).toBeTruthy()
  expect(block('needs_review').getAttribute('aria-busy')).toBe('true')

  await act(async () => land({ ...data, signal_health: empty } as DashboardRead))
  await waitFor(() => expect(document.activeElement?.id).toBe('dashboard-needs-review'))
  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
})

test('a project whose read failed is named under the other projects’ rows, with the block’s Retry', async () => {
  const two = {
    ...data,
    projects: [...data.projects, { id: 'p2', slug: 'hill', name: 'Hill campus', archived_at: null, summary: null }],
    signal_health: {
      ok: true,
      data: [],
      n: 0,
      unread: [{ project: { id: 'p2', slug: 'hill', org_slug: 'acme' }, status: 503, at }]
    }
  } as unknown as DashboardRead
  render(<DashboardPage org="acme" initialData={two} initialError={null} />)
  expect(block('signal_health').textContent).toContain('Couldn’t read Hill campus just now.')
  // Nothing is known to be empty while a project was not read.
  expect(block('signal_health').textContent).not.toMatch(/No sources/)
  vi.mocked(readDashboardBlock).mockReturnValue(new Promise(() => {}))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(vi.mocked(readDashboardBlock).mock.calls[0]?.slice(0, 2)).toEqual(['acme', 'signal_health'])
  expect(block('signal_health').getAttribute('aria-busy')).toBe('true')
})

test('a rate-limited block says Skyclause is busy until when, with Retry held until then', () => {
  const limited = {
    ...data,
    signal_health: { ok: false, status: 429, at, retryAt: '2099-01-01T00:00:00.000Z' }
  } as unknown as DashboardRead
  render(<DashboardPage org="acme" initialData={limited} initialError={null} />)
  expect(block('signal_health').textContent).toContain('Skyclause is busy just now.')
  expect(block('signal_health').textContent).not.toMatch(/429|Couldn’t read/)
  expect((screen.getByRole('button', { name: 'Try again' }) as HTMLButtonElement).matches(':disabled')).toBe(true)
})
