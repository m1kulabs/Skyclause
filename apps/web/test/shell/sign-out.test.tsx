// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { shellScope } from '../../features/shell/scope'
import { AccountMenu } from '../../features/shell/switchers'
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
  expect(await screen.findByRole('menuitem', { name: 'Signing out…' })).toBeDefined()
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
  expect(await screen.findByRole('menuitem', { name: 'Couldn’t sign out just now. Try again.' })).toBeDefined()
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
