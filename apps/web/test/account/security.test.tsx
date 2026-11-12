// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/account/security/panel'

vi.mock('@simplewebauthn/browser', () => ({ startAuthentication: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const windowsChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'

interface Stubs {
  passkeys?: Array<{ id: string; name: string; createdAt: string }>
  sessions?: Array<{ id: string; token: string; createdAt: string; updatedAt: string; userAgent: string }>
  update?: () => Response | Promise<Response>
  security?: () => Response | Promise<Response>
  remove?: () => Response
}

/** The panel's own requests, answered from a mutable list so a removal shows on the next read. */
function stubAuth(stubs: Stubs = {}) {
  vi.stubGlobal('PointerEvent', class extends MouseEvent {})
  let passkeys = stubs.passkeys ?? [{ id: 'pk-1', name: 'Work laptop', createdAt: '2026-11-01T02:00:00Z' }]
  const sessions = stubs.sessions ?? [
    {
      id: 'session',
      token: 't1',
      createdAt: '2026-11-01T02:00:00Z',
      updatedAt: '2026-11-10T02:00:00Z',
      userAgent: windowsChrome
    },
    {
      id: 'other',
      token: 't2',
      createdAt: '2026-11-05T02:00:00Z',
      updatedAt: '2026-11-09T02:00:00Z',
      userAgent: windowsChrome
    }
  ]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/get-session'))
        return Response.json({
          session: { id: 'session', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
          user: { id: 'account', name: 'Account', email: 'account@example.test', magicLinkEnabled: true }
        })
      if (url.endsWith('/list-sessions')) return Response.json(sessions)
      if (url.endsWith('/list-accounts')) return Response.json([])
      if (url.endsWith('/list-user-passkeys')) return Response.json(passkeys)
      if (url.endsWith('/passkey/update-passkey')) return (await stubs.update?.()) ?? Response.json({})
      if (url.endsWith('/passkey/delete-passkey')) {
        passkeys = []
        return stubs.remove?.() ?? Response.json({})
      }
      if (url.endsWith('/api/me/security'))
        return (await stubs.security?.()) ?? Response.json({ magic_link_enabled: false })
      throw new Error(`Unexpected request ${url}`)
    })
  )
}

test('opening a rename puts the cursor in its field; closing it returns to that passkey’s Rename button', async () => {
  stubAuth()
  render(<Panel />)
  const rename = await screen.findByRole('button', { name: 'Rename Work laptop' })
  fireEvent.click(rename)
  const field = await screen.findByLabelText('Passkey name')
  expect(document.activeElement).toBe(field)
  expect(field.getAttribute('maxlength')).toBe('100')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename Work laptop' })))
})

test('a blank name is told so on submit instead of leaving a disabled button with no reason', async () => {
  stubAuth()
  render(<Panel />)
  const add = await screen.findByRole('button', { name: 'Add passkey' })
  expect((add as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(add)
  expect(await screen.findByText('Enter a name for the passkey.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Work laptop' }))
  fireEvent.change(await screen.findByLabelText('Passkey name'), { target: { value: '  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
  expect((await screen.findAllByText('Enter a name for the passkey.')).length).toBeGreaterThan(0)
})

test('a server’s own message is never shown: an unknown failure reads as the panel’s generic sentence', async () => {
  stubAuth({
    update: () => Response.json({ code: 'db-down', message: 'pg: relation "passkey" does not exist' }, { status: 500 })
  })
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Rename Work laptop' }))
  fireEvent.change(await screen.findByLabelText('Passkey name'), { target: { value: 'Home desktop' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('The account security change could not be completed. Try again.')
  expect(document.body.textContent).not.toContain('relation')
})

test('the magic-link switch stays enabled and focused while its change is on its way', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  stubAuth({
    security: async () => {
      await held
      return Response.json({ magic_link_enabled: false })
    }
  })
  render(<Panel />)
  const toggle = await screen.findByRole('switch', { name: 'Magic link sign-in' })
  await waitFor(() => expect(toggle.hasAttribute('data-disabled')).toBe(false))
  toggle.focus()
  fireEvent.click(toggle)
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Magic link sign-in' })).toBeInTheDocument())
  expect(toggle.hasAttribute('data-disabled')).toBe(false)
  expect(document.activeElement).toBe(toggle)
  release()
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'))
})

test('removing a passkey asks first; once it is gone the part’s heading holds focus', async () => {
  stubAuth()
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove Work laptop' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('Remove passkey')
  fireEvent.click(screen.getByRole('button', { name: /^Remove passkey/ }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Sign-in methods' })))
})

test('sessions on one device and browser are told apart by when they began, in the reader’s locale', async () => {
  stubAuth()
  render(<Panel locale="ms" />)
  const revoke = await screen.findAllByRole('button', { name: /^Batalkan Windows · Chrome · / })
  expect(revoke).toHaveLength(2)
  const names = revoke.map((button) => button.getAttribute('aria-label'))
  expect(new Set(names).size).toBe(2)
  expect(names[0]).toContain('MYT')
  expect(await screen.findByText(/Dicipta 1 November 2026/)).toBeInTheDocument()
})

test('unlinking and signing out confirm with phrases that carry the name once, not twice', async () => {
  stubAuth()
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('Sign out of “other sessions”')
  expect(dialog.textContent).not.toContain('“other sessions” “other sessions”')
  expect(dialog.textContent).not.toMatch(/everywhere “other sessions”/)
})
