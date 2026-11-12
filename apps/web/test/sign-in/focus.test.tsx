// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const magicLink = vi.fn()
const passkey = vi.fn()
vi.mock('@skyclause/auth/client', () => ({ authClient: { signIn: { magicLink, passkey } } }))

const { SignInPanel } = await import('../../features/sign-in/panel')
const { signInLinks } = await import('../../features/sign-in/links')

beforeEach(() => {
  magicLink.mockReset()
  passkey.mockReset()
  magicLink.mockResolvedValue({ data: {}, error: null })
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderPanel(mode: 'sign-in' | 'sign-up' = 'sign-up') {
  return render(
    <SignInPanel
      mode={mode}
      next={null}
      state={{ kind: 'form' }}
      links={signInLinks('en', {})}
      now={new Date().toISOString()}
    />
  )
}

function submit(address: string) {
  const email = screen.getByRole('textbox', { name: 'Email address' })
  fireEvent.change(email, { target: { value: address } })
  const button = screen.getByRole('button', { name: 'Send sign-in link' })
  button.focus()
  fireEvent.submit(button.closest('form')!)
  return email
}

test('after the link is sent, focus moves from the vanished button to the heading that replaced it', async () => {
  renderPanel()
  submit('reader@example.test')
  const heading = await screen.findByRole('heading', { name: 'Check your email' })
  await waitFor(() => expect(document.activeElement).toBe(heading))
  expect(screen.getByRole('status').textContent).toContain('We sent a sign-in link to reader@example.test.')
})

test('an empty or malformed address is said beside the field, with no request and focus kept on the field', async () => {
  renderPanel()
  const email = submit('')
  expect(await screen.findByText('Enter your email address.')).toBeTruthy()
  expect(email.getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(email)
  submit('not-an-email')
  expect(await screen.findByText('Enter an email address like name@example.com.')).toBeTruthy()
  expect(magicLink).not.toHaveBeenCalled()
})

test('a refused send says when to ask again from the API’s Retry-After, never a status code', async () => {
  magicLink.mockImplementation(async (_body: unknown, options: { onError: (context: unknown) => void }) => {
    options.onError({ response: new Response(null, { status: 429, headers: { 'Retry-After': '600' } }) })
    return { data: null, error: { status: 429, message: 'Too many sign-in link requests.' } }
  })
  renderPanel()
  submit('reader@example.test')
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toMatch(/You can ask again at \d\d:\d\d MYT\./)
  expect(alert.textContent).not.toMatch(/429|RATE_LIMITED/)
  expect(alert.querySelector('time')).not.toBeNull()
})

test('the link’s window closes at its real end: the form returns with the address and one line', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  renderPanel()
  submit('reader@example.test')
  await screen.findByRole('heading', { name: 'Check your email' })
  await act(async () => {
    vi.advanceTimersByTime(15 * 60_000 + 1000)
  })
  const email = await screen.findByRole('textbox', { name: 'Email address' })
  expect((email as HTMLInputElement).value).toBe('reader@example.test')
  expect(screen.getByText(/Your sign-in link expired at/)).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(email))
})

test('a cancelled passkey prompt returns to rest silently; a passkey no account uses is said', async () => {
  passkey.mockResolvedValueOnce({ data: null, error: { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', status: 400 } })
  window.PublicKeyCredential = function PublicKeyCredential() {} as unknown as typeof window.PublicKeyCredential
  renderPanel('sign-in')
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
  await waitFor(() => expect(passkey).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('alert')).toBeNull()

  passkey.mockResolvedValueOnce({ data: null, error: { code: 'PASSKEY_NOT_FOUND', status: 400 } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
  expect((await screen.findByRole('alert')).textContent).toContain('No Skyclause account uses this passkey.')
})

test('a browser without passkeys says so in words and points to the email link', async () => {
  // @ts-expect-error -- this browser has no WebAuthn.
  delete window.PublicKeyCredential
  renderPanel('sign-in')
  expect(await screen.findByText('This browser can’t use passkeys. Use the email link.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull()
})
