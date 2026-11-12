// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

async function openShiftMenu(name: string) {
  const [menu] = await screen.findAllByRole('button', { name: new RegExp(`^More actions for ${name}, `) })
  if (!menu) throw new Error('no shift menu')
  fireEvent.pointerDown(menu, { pointerType: 'mouse' })
  fireEvent.click(menu)
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
  expect(screen.getByText('0 shifts')).toBeDefined()
  expect(screen.queryByText(/n=/)).toBeNull()
  // The button is outline: the one primary on the page is Save, and no heading repeats the button's words.
  expect(screen.queryByRole('heading', { name: 'Add an approver' })).toBeNull()
})

test('an Approver saves only their own shifts, leaving colleagues to the API', async () => {
  const shift = (id: string, account_id: string) => ({
    id: `00000000-0000-7000-8000-${id}`,
    account_id,
    project_id: null,
    days: [1],
    local_start: '14:00',
    local_end: '19:15',
    condition: 'storm_afternoon',
    order: 1,
    template: 'storm_afternoon'
  })
  const own = shift('000000000021', '00000000-0000-7000-8000-000000000002')
  const colleague = shift('000000000022', '00000000-0000-7000-8000-000000000003')
  const rota = {
    time_zone: 'Asia/Kuala_Lumpur',
    templates: [
      { template: 'storm_afternoon', local_start: '14:00', local_end: '19:15', condition: 'storm_afternoon' },
      { template: 'surge_night', local_start: '08:00', local_end: '22:00', condition: 'surge_night' }
    ],
    shifts: [own, colleague],
    on_duty: [],
    next_shift: null,
    unstaffed_slots: []
  }
  const bodies: Array<{ shifts: Array<{ account_id: string }> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        bodies.push(JSON.parse(String(init.body)))
        return Response.json({ ...rota, shifts: [colleague] })
      }
      return Response.json(rota)
    })
  )
  render(<Panel org="org-a" viewer={{ accountId: own.account_id, role: 'approver' }} locale="en" />)

  await openShiftMenu('You')
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove the Monday shift' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save rota' }))

  expect(await screen.findByText('Rota saved.')).toBeDefined()
  expect(bodies).toHaveLength(1)
  expect(bodies[0]!.shifts).toEqual([])
})

const approverAccount = '00000000-0000-7000-8000-000000000002'
const storm = {
  id: '00000000-0000-7000-8000-000000000031',
  account_id: approverAccount,
  project_id: null,
  days: [1, 2, 3],
  local_start: '14:00',
  local_end: '19:15',
  condition: 'storm_afternoon',
  order: 1,
  template: 'storm_afternoon'
}

function mockRota(shifts: unknown[]) {
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
          shifts,
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

test('a shift row is one menu, and its Remove names the days it removes the shift from', async () => {
  mockRota([storm])
  render(<Panel org="org-a" viewer={{ accountId: approverAccount, role: 'owner' }} locale="en" />)

  // One menu under each day the shift covers: three days, three menus, and no Edit or Remove button.
  expect(await screen.findAllByRole('button', { name: /^More actions for You, / })).toHaveLength(3)
  expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
  await openShiftMenu('You')
  expect(await screen.findByRole('menuitem', { name: 'Remove the Monday, Tuesday and Wednesday shift' })).toBeDefined()
  expect(screen.getByRole('menuitem', { name: 'Edit shift' })).toBeDefined()
})

test('a removed shift can be put back, and unsaved changes can be discarded without reloading', async () => {
  mockRota([storm])
  render(<Panel org="org-a" viewer={{ accountId: approverAccount, role: 'owner' }} locale="en" />)

  await openShiftMenu('You')
  fireEvent.click(await screen.findByRole('menuitem', { name: /^Remove the Monday/ }))
  expect(screen.getByText('0 shifts')).toBeDefined()
  expect(screen.getByText('Removed the Monday, Tuesday and Wednesday shift for You.')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
  expect(screen.getByText('1 shift')).toBeDefined()

  await openShiftMenu('You')
  fireEvent.click(await screen.findByRole('menuitem', { name: /^Remove the Monday/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByText('1 shift')).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull()
})

test('an incomplete shift names each field that is wrong and focuses the first', async () => {
  mockRota([])
  render(<Panel org="org-a" viewer={{ accountId: approverAccount, role: 'owner' }} locale="en" />)

  fireEvent.click(await screen.findByRole('button', { name: 'Add an approver' }))
  expect(screen.getByRole('heading', { name: 'Add an approver' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Add shift' }))
  expect(await screen.findByText('Choose at least one day.')).toBeDefined()
  expect(screen.getByRole('group', { name: 'Days' }).getAttribute('aria-describedby')).toBe('rota-days-error')
  await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('checkbox'))
  // Editing an existing shift names its submit for what it does.
  expect(screen.queryByRole('button', { name: 'Update shift' })).toBeNull()
})
