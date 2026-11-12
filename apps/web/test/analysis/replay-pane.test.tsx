// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiProblem } from '../../lib/api-fetch'
import { ReplayPane } from '../../features/analysis/replay-pane'
import { apiFetch } from '../../features/analysis/operations'
import type { AnalysisState } from '../../features/analysis/model'

vi.mock('../../features/analysis/operations', async (original) => ({
  ...(await original<typeof import('../../features/analysis/operations')>()),
  apiFetch: vi.fn()
}))

const state: AnalysisState = {
  tab: 'sky',
  period: '30d',
  pack: 'sky',
  sheet: 'sheet-1',
  subject: 'version',
  version: 'version-1',
  from: '2026-11-01',
  to: '2026-11-04',
  step: 'reading',
  project: 'test-project'
} as AnalysisState

let whatIf: () => unknown
beforeEach(() => {
  // HTTP test doubles of the clause sheet reads, never application data.
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'listClauseSheets') return { data: [{ id: 'sheet-1', pack: 'sky' }], next_cursor: null }
    if (operation === 'listClauseSheetVersions')
      return {
        data: [{ id: 'version-1', status: 'published', n: 3, content: { pack: 'sky', clauses: [] } }],
        next_cursor: null
      }
    if (operation === 'evaluateWhatIf') return whatIf()
    throw new Error(`not reached: ${operation}`)
  }) as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

const pane = () => (
  <ReplayPane projectId="project-1" org="test-org" state={state} change={() => {}} canDraft={false} locale="en" />
)

async function run() {
  render(pane())
  const button = await screen.findByRole('button', { name: 'Run replay' })
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(button)
}

test('a replay that is not available yet says so, never blames the inputs, and offers no Run that can only fail', async () => {
  whatIf = () => {
    throw new ApiProblem(501, { title: 'Not built', status: 501 })
  }
  await run()
  expect(await screen.findByText('What-if replay is not available yet.')).toBeTruthy()
  expect(screen.queryByText(/Check the selected subject and dates/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Run replay' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
})

test('a replay that failed to run says so and keeps Run, which runs it again', async () => {
  whatIf = () => {
    throw new ApiProblem(503, { title: 'Unavailable', status: 503 })
  }
  await run()
  expect(await screen.findByText('Couldn’t run the replay just now. Run it again.')).toBeTruthy()
  expect(screen.queryByText(/Check the selected subject and dates/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Run replay' })).toBeTruthy()
})

test('a sheet or range the replay refuses still points at the inputs', async () => {
  whatIf = () => {
    throw new ApiProblem(422, { title: 'Validation failed', status: 422 })
  }
  await run()
  expect(await screen.findByText('Replay failed. Check the selected subject and dates, then retry.')).toBeTruthy()
})
