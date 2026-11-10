// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/account/security/panel'

const startAuthentication = vi.hoisted(() => vi.fn())
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  startAuthentication.mockReset()
})

const reauthRequired = {
  type: 'https://api.example.test/problems/reauth-required',
  title: 'Recent authentication required',
  status: 401,
  detail: 'Authenticate again.'
}

function stubAuth(security: () => Response) {
  // jsdom has no PointerEvent; Base UI's switch builds one for its click.
  vi.stubGlobal('PointerEvent', class extends MouseEvent {})
  const requests: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      requests.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/api/auth/get-session')) {
        return Response.json({
          session: { id: 'session', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z' },
          user: { id: 'account', name: 'Account', email: 'account@example.test', magicLinkEnabled: true }
        })
      }
      if (url.endsWith('/list-sessions') || url.endsWith('/list-accounts') || url.endsWith('/list-user-passkeys')) {
        return Response.json([])
      }
      if (url.endsWith('/api/auth/step-up'))
        return Response.json({ fresh_until: '2000-01-01T00:00:00Z', passkey: true })
      if (url.endsWith('/step-up/passkey/options')) return Response.json({ options: { challenge: 'challenge' } })
      if (url.endsWith('/step-up/passkey/verify')) return Response.json({})
      if (url.endsWith('/api/me/security')) return security()
      throw new Error(`Unexpected request ${url}`)
    })
  )
  return requests
}

test('a confirmed step-up retries the security change instead of reporting it cancelled', async () => {
  let attempts = 0
  const requests = stubAuth(() =>
    ++attempts === 1 ? Response.json(reauthRequired, { status: 401 }) : Response.json({ magic_link_enabled: false })
  )
  startAuthentication.mockResolvedValue({ id: 'test-credential' })

  render(<Panel />)
  const toggle = await screen.findByRole('switch', { name: 'Magic link sign-in' })
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)

  fireEvent.click(await screen.findByRole('button', { name: 'Use passkey' }))

  await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  expect(requests.filter((request) => request.endsWith('/api/me/security'))).toHaveLength(2)
  expect(screen.queryByText('Reauthentication was cancelled.')).not.toBeInTheDocument()
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('cancelling the step-up leaves the setting and says so', async () => {
  const requests = stubAuth(() => Response.json(reauthRequired, { status: 401 }))

  render(<Panel />)
  const toggle = await screen.findByRole('switch', { name: 'Magic link sign-in' })
  await waitFor(() => expect(toggle).toBeEnabled())
  fireEvent.click(toggle)

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

  expect(await screen.findByText('Reauthentication was cancelled.')).toBeVisible()
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(requests.filter((request) => request.endsWith('/api/me/security'))).toHaveLength(1)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
