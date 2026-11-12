// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/account/profile/panel'

const updateUser = vi.hoisted(() => vi.fn())
vi.mock('@skyclause/auth/client', () => ({ authClient: { updateUser } }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  updateUser.mockReset()
})

function stubSession() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ user: { id: 'a', name: 'Aisha Rahman', email: 'aisha@example.test' } }))
  )
}

test('Save is always on offer; submitting an empty name says what is missing', async () => {
  stubSession()
  render(<Panel />)
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect((save as HTMLButtonElement).disabled).toBe(false)
  fireEvent.change(name, { target: { value: '   ' } })
  fireEvent.click(save)
  expect(await screen.findByText('Enter a name.')).toBeInTheDocument()
  expect(updateUser).not.toHaveBeenCalled()
})

test('saving the name it already has sends nothing and says so', async () => {
  stubSession()
  render(<Panel />)
  await screen.findByLabelText('Name')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByText('That is already your name.')).toBeInTheDocument()
  expect(updateUser).not.toHaveBeenCalled()
})

test('a failed save shows the panel’s own sentence, never the server’s English message', async () => {
  stubSession()
  updateUser.mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint', status: 500 } })
  render(<Panel locale="ms" />)
  const name = await screen.findByLabelText('Nama')
  fireEvent.change(name, { target: { value: 'Aisha R.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Simpan perubahan' }))
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Nama anda tidak dapat dikemas kini. Cuba lagi.')
  expect(document.body.textContent).not.toContain('duplicate key')
})

test('an unsaved name warns before the page is left, and a saved one does not', async () => {
  stubSession()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const link = document.createElement('a')
  link.href = '/elsewhere'
  document.body.append(link)
  // The link's own handler runs only when the guard lets the click through.
  const reached = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', reached)
  render(<Panel />)
  const name = await screen.findByLabelText('Name')
  fireEvent.change(name, { target: { value: 'Aisha R.' } })
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(reached).not.toHaveBeenCalled()

  updateUser.mockResolvedValue({ data: {} })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getByText('Name saved.')).toBeInTheDocument())
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(reached).toHaveBeenCalledTimes(1)
  link.remove()
  confirm.mockRestore()
})
