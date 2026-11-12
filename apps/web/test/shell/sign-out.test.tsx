// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { shellScope } from '../../features/shell/scope'
import { AccountMenu } from '../../features/shell/switchers'
import { PhoneMenu } from '../../features/shell/phone-menu'
import type { ShellData } from '../../features/shell/types'

const owner: ShellData = {
  memberships: [{ org_id: 'org-one', org_name: 'Test organisation one', org_slug: 'test-one', role: 'owner' }],
  projects: []
}
const guest: ShellData = {
  memberships: [{ org_id: 'commons', org_name: 'Commons', org_slug: 'commons', role: 'guest' }],
  projects: []
}

function openAccountMenu(data: ShellData, locale: 'en' | 'ms' = 'en') {
  const org = data.memberships[0]?.org_slug
  render(<AccountMenu scope={shellScope(data, `/${org ?? ''}`, { org }, locale)} />)
  const trigger = screen.getByRole('button', {
    name: locale === 'ms' ? 'Organisasi dan akaun' : 'Organisation and account'
  })
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' })
  fireEvent.click(trigger)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('the account menu signs out this session through the auth API', async () => {
  const fetchMock = vi.fn(async () => Response.json({ success: true }))
  vi.stubGlobal('fetch', fetchMock)
  openAccountMenu(owner)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/auth/sign-out')
  expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
  // Not every session: Security keeps "Sign out everywhere".
  expect(url).not.toContain('revoke')
  // The item keeps its name; its progress is a status line it is described by.
  const item = screen.getByRole('menuitem', { name: 'Sign out' })
  const status = await screen.findByRole('status')
  await waitFor(() => expect(status.textContent).toBe('Signing out…'))
  expect(item.getAttribute('aria-describedby')).toBe(status.id)
})

test('a signed-out session leaves by replacing the page, so Back does not reopen it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ success: true }))
  )
  const replace = vi.fn()
  const assign = vi.fn()
  vi.stubGlobal('location', { ...window.location, replace, assign })
  openAccountMenu(owner)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in'))
  expect(assign).not.toHaveBeenCalled()
})

test('a failed sign-out says so in the menu and stays where it was', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('offline')
    })
  )
  openAccountMenu(owner)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  const status = await screen.findByRole('status')
  await waitFor(() => expect(status.textContent).toBe('Couldn’t sign out just now. Try again.'))
  // Still the action, so it can be chosen again, and described by the failure.
  expect(screen.getByRole('menuitem', { name: 'Sign out' }).getAttribute('aria-describedby')).toBe(status.id)
})

test('a guest account, whose session cannot be signed back into, is offered no Sign out', async () => {
  openAccountMenu(guest)
  expect(await screen.findByRole('menuitem', { name: 'Appearance' })).toBeDefined()
  expect(screen.queryByRole('menuitem', { name: 'Sign out' })).toBeNull()
})

test('Sign out is in Malay in the Malay interface', async () => {
  openAccountMenu(owner, 'ms')
  expect(await screen.findByRole('menuitem', { name: 'Log keluar' })).toBeDefined()
})

test('the phone sheet keeps Sign out as its name, disabled while it runs, and says a failure in its status line', async () => {
  let fail!: () => void
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((_, reject) => (fail = () => reject(new TypeError('offline')))))
  )
  render(<PhoneMenu scope={shellScope(owner, '/test-one', { org: 'test-one' }, 'en')} now="2026-11-13T01:00:00.000Z" />)
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  const signOut = await screen.findByRole('button', { name: 'Sign out' })
  fireEvent.click(signOut)
  const status = document.getElementById(signOut.getAttribute('aria-describedby')!)!
  expect(status.getAttribute('role')).toBe('status')
  await waitFor(() => expect(status.textContent).toBe('Signing out…'))
  expect(signOut.getAttribute('aria-disabled')).toBe('true')
  fail()
  await waitFor(() => expect(status.textContent).toBe('Couldn’t sign out just now. Try again.'))
  expect(signOut.getAttribute('aria-disabled')).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBe(signOut)
})
