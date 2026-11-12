// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, expect, test, vi } from 'vitest'
import { ReauthDialog } from '../../features/reauth/reauth-dialog'

const startAuthentication = vi.hoisted(() => vi.fn())
vi.mock('@simplewebauthn/browser', () => ({ startAuthentication }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  startAuthentication.mockReset()
})

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init))
  )
}

test('offers a passkey first, verifies it, and exposes an accessible dialog', async () => {
  stubFetch(async (url, init) => {
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: true })
    if (url.endsWith('/passkey/options')) return Response.json({ options: { challenge: 'challenge' } })
    if (url.endsWith('/passkey/verify')) return Response.json({ fresh_until: new Date(Date.now() + 12 * 60 * 60_000) })
    throw new Error(`Unexpected request ${url} ${init?.method}`)
  })
  startAuthentication.mockResolvedValue({ id: 'test-credential' })
  const onOpenChange = vi.fn()

  render(<ReauthDialog open onOpenChange={onOpenChange} />)

  expect(await screen.findByRole('dialog', { name: 'Confirm it’s you' })).toBeVisible()
  const passkey = await screen.findByRole('button', { name: 'Use passkey' })
  expect(passkey).toBeVisible()
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }
  } as Parameters<typeof axe.run>[1])
  expect(results.violations.map(({ id }) => id)).toEqual([])

  fireEvent.click(passkey)

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'challenge' } })
  expect(fetch).toHaveBeenCalledWith(
    '/api/auth/step-up/passkey/verify',
    expect.objectContaining({ method: 'POST', credentials: 'same-origin' })
  )
})

test('magic link tells the person to check email and Continue refreshes the bound session', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/step-up'))
      return Response.json({
        fresh_until: fetchMock.mock.calls.length > 2 ? '2099-01-01T00:00:00.000Z' : '2000-01-01T00:00:00.000Z',
        passkey: false
      })
    if (url.endsWith('/magic-link')) return Response.json({ sent: true })
    throw new Error(`Unexpected request ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  const onOpenChange = vi.fn()
  render(<ReauthDialog open onOpenChange={onOpenChange} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Send me a sign-in link' }))
  expect(await screen.findByText('Check your email, then press Continue')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain('/api/auth/step-up/magic-link')
})

test('an expired or unconfirmed link does not close the dialog when Continue is pressed', async () => {
  stubFetch((url) => {
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: false })
    if (url.endsWith('/magic-link')) return Response.json({ sent: true })
    throw new Error(`Unexpected request ${url}`)
  })
  const onOpenChange = vi.fn()
  render(<ReauthDialog open onOpenChange={onOpenChange} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Send me a sign-in link' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))

  expect(await screen.findByText(/has not been confirmed yet/i)).toBeVisible()
  expect(onOpenChange).not.toHaveBeenCalledWith(false)
})

test('a failed email send says the email failed, and does not send the person to the email link again', async () => {
  stubFetch((url) => {
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: false })
    if (url.endsWith('/magic-link')) return new Response(null, { status: 503 })
    throw new Error(`Unexpected request ${url}`)
  })
  render(<ReauthDialog open onOpenChange={vi.fn()} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Send me a sign-in link' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('The email link could not be sent')
  expect(alert).not.toHaveTextContent(/confirm your identity/i)
})

test('once the email is sent, focus moves to the button that goes on instead of falling to the page', async () => {
  stubFetch((url) => {
    if (url.endsWith('/step-up')) return Response.json({ fresh_until: '2000-01-01T00:00:00.000Z', passkey: false })
    if (url.endsWith('/magic-link')) return Response.json({ sent: true })
    throw new Error(`Unexpected request ${url}`)
  })
  render(<ReauthDialog open onOpenChange={vi.fn()} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Send me a sign-in link' }))
  const next = await screen.findByRole('button', { name: 'Continue' })
  await waitFor(() => expect(next).toHaveFocus())
})
