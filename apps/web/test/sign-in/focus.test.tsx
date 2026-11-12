// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const magicLink = vi.fn()
const passkey = vi.fn()
const social = vi.fn()
vi.mock('@skyclause/auth/client', () => ({ authClient: { signIn: { magicLink, passkey, social } } }))

const { SignInPanel } = await import('../../features/sign-in/panel')
const { signInLinks } = await import('../../features/sign-in/links')

beforeEach(() => {
  magicLink.mockReset()
  passkey.mockReset()
  social.mockReset()
  magicLink.mockResolvedValue({ data: {}, error: null })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderPanel(
  mode: 'sign-in' | 'sign-up' = 'sign-up',
  state: import('../../features/sign-in/model').AuthState = { kind: 'form' }
) {
  return render(
    <SignInPanel mode={mode} next={null} state={state} links={signInLinks('en', {})} now={new Date().toISOString()} />
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

test('a waiting passkey says so on its own button; the email form keeps its label and stays editable', async () => {
  let finish: (value: unknown) => void = () => {}
  passkey.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
  window.PublicKeyCredential = function PublicKeyCredential() {} as unknown as typeof window.PublicKeyCredential
  renderPanel('sign-in')
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
  expect(await screen.findByRole('button', { name: 'Waiting for your passkey…' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Sending…' })).toBeNull()
  expect((screen.getByRole('textbox', { name: 'Email address' }) as HTMLInputElement).readOnly).toBe(false)
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Waiting for your passkey…')
  await act(async () => finish({ data: null, error: { code: 'ERROR_CEREMONY_ABORTED', status: 400 } }))
  expect(await screen.findByRole('button', { name: 'Sign in with a passkey' })).toBeTruthy()
  expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('')
})

test('starting Google says so on the Google button only', async () => {
  social.mockReturnValueOnce(new Promise(() => {}))
  renderPanel('sign-in')
  fireEvent.submit(screen.getByRole('button', { name: 'Continue with Google' }).closest('form')!)
  expect(await screen.findByRole('button', { name: 'Opening Google…' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Send sign-in link' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Sending…' })).toBeNull()
})

test('sending the link says Sending on the email button and in the live line, which was there before', async () => {
  magicLink.mockReturnValueOnce(new Promise(() => {}))
  renderPanel('sign-in')
  const live = document.querySelector('[aria-live="polite"]')!
  expect(live.textContent).toBe('')
  submit('reader@example.test')
  expect(await screen.findByRole('button', { name: 'Sending…' })).toBeTruthy()
  expect(document.querySelector('[aria-live="polite"]')).toBe(live)
  expect(live.textContent).toBe('Sending…')
  expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeTruthy()
})

test('“Use a different email” opens in a new tab on a modified click, and in place on a plain one', async () => {
  renderPanel()
  submit('reader@example.test')
  const link = await screen.findByRole('link', { name: 'Use a different email' })
  // Last to hear the click: notes whether the page kept the browser's own handling, then stops jsdom navigating.
  let prevented: boolean | null = null
  const record = (event: Event) => {
    prevented = event.defaultPrevented
    event.preventDefault()
  }
  window.addEventListener('click', record)
  try {
    for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      prevented = null
      fireEvent.click(link, modifier)
      expect(prevented, JSON.stringify(modifier)).toBe(false)
    }
    expect(screen.getByRole('heading', { name: 'Check your email' })).toBeTruthy()
    fireEvent.click(link)
    expect(prevented).toBe(true)
  } finally {
    window.removeEventListener('click', record)
  }
  expect(await screen.findByRole('textbox', { name: 'Email address' })).toBeTruthy()
})

test('a link that cannot be confirmed names the button on this tab and the one on the first', async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
  vi.stubGlobal('fetch', fetchMock)
  try {
    renderPanel('sign-in', { kind: 'confirm', link: 'token', stepUp: false })
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This link couldn’t be confirmed. Try Sign in again, or return to the first tab and choose Send the link again.'
    )
    cleanup()
    renderPanel('sign-in', { kind: 'confirm', link: 'token', stepUp: true })
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm it’s you' }).closest('form')!)
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This link couldn’t be confirmed. Try Confirm it’s you again, or return to the first tab and choose Send me a sign-in link.'
    )
  } finally {
    vi.unstubAllGlobals()
  }
})
