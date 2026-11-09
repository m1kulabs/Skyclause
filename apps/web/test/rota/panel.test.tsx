// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import '../../features/rota/i18n'
import Panel from '../../features/settings/organisation/rota/panel'

const approver = {
  id: 'member-approver',
  org_id: 'org-a',
  account_id: 'account-approver',
  role: 'approver',
  reads_malay: false,
  name: 'Aisha Rahman',
  email: 'aisha@example.test',
  last_active_at: null,
  sign_in_methods: ['email']
}

function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname.endsWith('/rota')) {
        return Response.json({
          time_zone: 'Asia/Kuala_Lumpur',
          templates: [
            { template: 'storm_afternoon', local_start: '14:00', local_end: '19:15', condition: 'storm_afternoon' },
            { template: 'surge_night', local_start: '08:00', local_end: '22:00', condition: 'surge_night' }
          ],
          shifts: [],
          on_duty: [],
          next_shift: null,
          unstaffed_slots: []
        })
      }
      if (url.pathname.endsWith('/members')) return Response.json({ data: [approver], next_cursor: null })
      return new Response(null, { status: 204 })
    })
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('a new organisation shows both unassigned templates and the Add an approver action', async () => {
  mockApi()
  render(<Panel org="org-a" viewer={{ accountId: 'account-approver', role: 'owner' }} locale="en" />)

  expect(await screen.findByText(/On duty now/)).toBeDefined()
  expect(screen.getByText('Storm afternoons')).toBeDefined()
  expect(screen.getByText('Surge nights')).toBeDefined()
  const templates = screen.getByRole('region', { name: 'Templates' })
  expect(within(templates).getAllByText('No one assigned')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Add an approver' })).toBeDefined()
  expect(screen.getByText('Rota shifts (n=0)')).toBeDefined()
})
