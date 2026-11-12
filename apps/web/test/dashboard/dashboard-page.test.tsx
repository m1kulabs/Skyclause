// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DashboardPage } from '../../features/dashboard/dashboard-page'
import { readDashboard, type DashboardRead } from '../../features/dashboard/operations'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('../../features/dashboard/operations', async (original) => ({
  ...(await original<typeof import('../../features/dashboard/operations')>()),
  readDashboard: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.mocked(readDashboard).mockReset()
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

test("a block's Retry keeps the blocks that loaded, shows only its own skeleton, then focuses its heading", async () => {
  let land!: (value: DashboardRead) => void
  vi.mocked(readDashboard).mockReturnValue(new Promise((resolve) => (land = resolve)))
  render(<DashboardPage org="acme" initialData={data} initialError={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
  expect(block('needs_review').getAttribute('aria-busy')).toBeNull()
  expect(block('signal_health').getAttribute('aria-busy')).toBe('true')
  expect(block('signal_health').querySelector('[data-source-error]')).toBeNull()

  await act(async () => land({ ...data, signal_health: empty } as DashboardRead))
  await waitFor(() => expect(document.activeElement?.id).toBe('dashboard-signal-health'))
  expect(block('signal_health').getAttribute('aria-busy')).toBeNull()
  expect(screen.getByText(/No bundles need review/)).toBeTruthy()
})

test('a Retry whose read fails again keeps the loaded blocks and says the failed one failed again', async () => {
  vi.mocked(readDashboard).mockRejectedValue(new ApiProblem(503, { title: 'Unavailable', status: 503 }))
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
