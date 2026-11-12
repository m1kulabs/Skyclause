// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { NightLanes } from '../../features/analysis/night-lanes'
import { apiFetch } from '../../features/analysis/operations'

vi.mock('../../features/analysis/operations', async (original) => ({
  ...(await original<typeof import('../../features/analysis/operations')>()),
  apiFetch: vi.fn()
}))

// An HTTP test double of listNights' row, never application data.
const night = {
  id: 'night-1',
  project_id: 'project-1',
  date: '2026-11-08',
  state: 'graded',
  doors: '2026-11-08T11:00:00Z',
  show: '2026-11-08T12:00:00Z',
  arrival_start: '2026-11-08T10:00:00Z',
  arrival_end: '2026-11-08T12:00:00Z',
  exit_start: '2026-11-08T15:00:00Z',
  exit_end: '2026-11-08T16:00:00Z',
  forecast: null
}

function answer(listings: () => unknown) {
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'listNights') return { data: [night], next_cursor: null }
    if (operation === 'listProjectListings') return listings()
    throw new Error(`not reached: ${operation}`)
  }) as never)
}

const lanes = () => (
  <NightLanes projectId="project-1" org="test-org" from="2026-11-01" to="2026-11-30" grades={[]} locale="en" />
)

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

test('listings that are not available yet mean no listings: the nights still draw, with no error and no Retry', async () => {
  answer(() => {
    throw new ApiProblem(501, { title: 'Not built', status: 501 })
  })
  render(lanes())
  expect(await screen.findByRole('heading', { name: 'Night of 8 November 2026' })).toBeTruthy()
  expect(document.querySelector('[data-source-error]')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

test('a real listings failure still says so with Retry, beside the nights it could read', async () => {
  let fail = true
  answer(() => {
    if (fail) throw new ApiProblem(503, { title: 'Unavailable', status: 503 })
    return { data: [], next_cursor: null }
  })
  render(lanes())
  expect(await screen.findByRole('heading', { name: 'Night of 8 November 2026' })).toBeTruthy()
  expect(await screen.findByText('Couldn’t read the listed shows just now.')).toBeTruthy()
  fail = false
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(screen.queryByText('Couldn’t read the listed shows just now.')).toBeNull())
  expect(screen.getByRole('heading', { name: 'Night of 8 November 2026' })).toBeTruthy()
})

test('a nights failure is still the block’s own error', async () => {
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'listNights') throw new ApiProblem(503, { title: 'Unavailable', status: 503 })
    return { data: [], next_cursor: null }
  }) as never)
  render(lanes())
  expect(await screen.findByText('Couldn’t read the Crowd nights just now.')).toBeTruthy()
})
