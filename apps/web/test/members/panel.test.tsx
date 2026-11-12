// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import '../../features/members/i18n'
import Panel from '../../features/settings/organisation/members/panel'

const member = {
  id: 'member-aisha',
  org_id: 'org-a',
  account_id: 'account-aisha',
  role: 'approver',
  reads_malay: false,
  name: 'Aisha Rahman',
  email: 'aisha@example.test',
  last_active_at: '2026-11-09T03:15:00Z',
  sign_in_methods: ['email', 'google']
}

const owner = {
  ...member,
  id: 'member-owner',
  account_id: 'account-owner',
  role: 'owner',
  name: 'Morgan Owner',
  email: 'morgan@example.test'
}

function mockApi(members = [member]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.pathname.endsWith('/members') && method === 'GET') {
        return Response.json({ data: members, next_cursor: null })
      }
      if (url.pathname.endsWith('/invitations') && method === 'GET') {
        return Response.json({ data: [], next_cursor: null })
      }
      return new Response(null, { status: 204 })
    })
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('members panel uses API rows and hides Owner as an Admin grant option', async () => {
  mockApi([member, owner])
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  expect(await screen.findByText('Aisha Rahman')).toBeDefined()
  expect(screen.getByText('aisha@example.test')).toBeDefined()
  const role = await screen.findByRole('combobox', { name: 'Role for Aisha Rahman' })
  fireEvent.click(role)
  await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))
  expect(screen.queryByRole('option', { name: 'Owner' })).toBeNull()
  // A count is written as a count, not as n=.
  expect(screen.getByText('2 members')).toBeDefined()
  expect(screen.queryByText(/n=/)).toBeNull()
  expect(screen.getAllByText(/Google/)).toHaveLength(2)
  expect(screen.getAllByText('Owners change by transfer').length).toBeGreaterThan(0)
  const inviteEmail = screen.getByLabelText('Email address') as HTMLInputElement
  expect(inviteEmail.type).toBe('email')
  expect(inviteEmail.autocomplete).toBe('off')
  expect(inviteEmail.getAttribute('spellcheck')).toBe('false')
})

test('lowering a member role opens a named confirmation dialog', async () => {
  mockApi()
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  const role = await screen.findByRole('combobox', { name: 'Role for Aisha Rahman' })
  fireEvent.click(role)
  const option = await screen.findByRole('option', { name: 'Editor' })
  fireEvent.pointerDown(option, { pointerType: 'mouse' })
  fireEvent.mouseUp(option)
  fireEvent.click(option)

  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Aisha Rahman')
  expect(dialog.textContent).toContain('Editor')
})

test('removing a member opens a named confirmation dialog', async () => {
  mockApi()
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  const menu = await screen.findByRole('button', { name: 'More actions for Aisha Rahman' })
  fireEvent.pointerDown(menu, { pointerType: 'mouse' })
  fireEvent.click(menu)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove member' }))

  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Aisha Rahman')
})

test('a member row carries one quiet menu, not a Remove button per row', async () => {
  mockApi([member, owner])
  render(<Panel org="org-a" viewerRole="owner" locale="en" />)

  await screen.findByText('Aisha Rahman')
  expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  expect(screen.getAllByRole('button', { name: /^More actions for / })).toHaveLength(2)
  expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
})

test('a long list pages at fifty rows and never renders more', async () => {
  const many = Array.from({ length: 60 }, (_, index) => ({
    ...member,
    id: `member-${index}`,
    account_id: `account-${index}`,
    name: `Member ${String(index).padStart(2, '0')}`,
    email: `member${index}@example.test`
  }))
  mockApi(many)
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  await screen.findByText('Member 00')
  expect(document.querySelectorAll('[data-member-row]')).toHaveLength(50)
  expect(screen.getByText('1–50 of 60')).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByText('Member 50')
  expect(document.querySelectorAll('[data-member-row]')).toHaveLength(10)
  expect(screen.getByText('51–60 of 60')).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
})

test('sending an invite with no address names the field and focuses it', async () => {
  mockApi()
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  const send = await screen.findByRole('button', { name: 'Send invite' })
  expect((send as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(send)
  const email = screen.getByLabelText('Email address')
  expect((await screen.findAllByText('Enter an email address.')).length).toBeGreaterThan(0)
  expect(email.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(email)
})

function leaving() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

test('an address typed into the invite form is guarded against leaving, and an empty form is not', async () => {
  mockApi()
  render(<Panel org="org-a" viewerRole="admin" locale="en" />)

  const email = await screen.findByLabelText('Email address')
  expect(leaving()).toBe(false)
  fireEvent.change(email, { target: { value: 'new@example.test' } })
  expect(leaving()).toBe(true)
  fireEvent.change(email, { target: { value: '' } })
  expect(leaving()).toBe(false)
})
