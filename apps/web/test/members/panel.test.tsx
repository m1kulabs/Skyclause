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
  expect(screen.getByText(/n=2/)).toBeDefined()
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

  fireEvent.click(await screen.findByRole('button', { name: /remove.*Aisha Rahman/i }))

  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Aisha Rahman')
})
