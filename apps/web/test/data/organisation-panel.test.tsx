// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { OrganisationDataPanel } from '../../features/data/organisation-panel'
import { organisationApiFetch } from '../../features/data/operations'

vi.mock('../../features/data/operations', async (original) => ({
  ...(await original<typeof import('../../features/data/operations')>()),
  organisationApiFetch: vi.fn()
}))

type PanelProps = Parameters<typeof OrganisationDataPanel>[0]

/** Built with createElement: the panel's `role` prop is the member's role, not an ARIA role. */
const panel = (props: PanelProps) => createElement(OrganisationDataPanel, props)

function answer(overrides: Record<string, () => unknown> = {}) {
  vi.mocked(organisationApiFetch).mockImplementation((async (operation: string) => {
    const handler = overrides[operation]
    if (handler) return handler()
    if (operation === 'listOrganisationExports') return { data: [], next_cursor: null }
    if (operation === 'getOrganisationDeletion')
      return { deletion_requested_at: '2026-11-10T02:00:00Z', purge_after: '2026-12-10T02:00:00Z' }
    throw new Error(`no ${operation} double`)
  }) as unknown as typeof organisationApiFetch)
}

afterEach(() => {
  cleanup()
  vi.mocked(organisationApiFetch).mockReset()
})

test('a failed cancel of a scheduled deletion says it could not be cancelled, beside the cancel button', async () => {
  answer({
    cancelOrganisationDeletion: () => {
      throw new Error('offline')
    }
  })
  render(panel({ org: 'northstar', role: 'owner' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel deletion' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Deletion could not be cancelled. Try again.')
  expect(screen.queryByText(/could not be scheduled/)).toBeNull()
  // The grace period is still running, so the cancel stays on offer.
  expect(screen.getByRole('button', { name: 'Cancel deletion' })).toBeInTheDocument()
})

test('a cancel that works clears the grace period and the error', async () => {
  answer({ cancelOrganisationDeletion: () => ({ deletion_requested_at: null, purge_after: null }) })
  render(panel({ org: 'northstar', role: 'owner' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel deletion' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel deletion' })).toBeNull())
  expect((await screen.findAllByText('Deletion is not scheduled.')).length).toBeGreaterThan(0)
})

test('the retention policy is the shared table with a row for each kind of data', async () => {
  answer()
  render(panel({ org: 'northstar', role: 'admin', locale: 'ms' }))
  const table = await screen.findByRole('table', { name: 'Penyimpanan data' })
  expect(table.getAttribute('data-slot')).toBe('table')
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  // The number and its unit never part across a line: a no-break space joins them.
  expect(table.textContent).toContain('183\u00a0hari')
})

test('an export request is announced, and a failed poll lands with the exports, not under the delete part', async () => {
  answer({
    createOrganisationExport: () => ({
      id: 'e1',
      scope: 'organisation',
      status: 'queued',
      formats: ['json'],
      error: null,
      expires_at: null,
      created_at: '2026-11-10T02:00:00Z',
      download_url: null
    })
  })
  render(panel({ org: 'northstar', role: 'owner' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Request export' }))
  await waitFor(() => expect(screen.getByText(/Export requested/)).toBeInTheDocument())
})
