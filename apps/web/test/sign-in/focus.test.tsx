// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

vi.mock('@skyclause/auth/client', () => ({
  authClient: { signIn: { magicLink: vi.fn(() => Promise.resolve({ data: {}, error: null })) } }
}))

const { SignInPanel } = await import('../../features/sign-in/panel')

afterEach(cleanup)

test('after the link is sent, focus moves from the vanished button to the result that replaced it', async () => {
  render(<SignInPanel mode="sign-up" next={null} state={{ kind: 'form' }} />)
  const email = screen.getByRole('textbox', { name: 'Email address' })
  fireEvent.change(email, { target: { value: 'reader@example.test' } })
  const submit = screen.getByRole('button', { name: 'Send sign-in link' })
  submit.focus()
  fireEvent.submit(submit.closest('form')!)
  const result = (await screen.findByText(/Sign-in link sent to reader@example\.test/)).closest('[role="status"]')
  await waitFor(() => expect(document.activeElement).toBe(result))
})
