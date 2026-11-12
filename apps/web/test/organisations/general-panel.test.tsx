// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/organisations/catalogue'
import Panel from '../../features/settings/organisation/general/panel'
import { apiFetch } from '../../features/organisations/operations'

vi.mock('../../features/organisations/operations', async (original) => ({
  ...(await original<typeof import('../../features/organisations/operations')>()),
  apiFetch: vi.fn()
}))

const membership = {
  id: 'membership-test',
  org_id: 'org-test',
  account_id: 'account-test',
  role: 'owner',
  reads_malay: false,
  org_name: 'Old name',
  org_slug: 'test-org'
}

function answer(name = 'Old name') {
  vi.mocked(apiFetch).mockImplementation((async (operation: string, options: unknown) => {
    if (operation === 'listMyMemberships') return { data: [{ ...membership, org_name: name }], next_cursor: null }
    if (operation === 'updateOrganisation')
      return { ...membership, name: (options as { body: { name: string } }).body.name, slug: 'test-org' }
    throw new Error(`no ${operation} double`)
  }) as typeof apiFetch)
}

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
})

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

test('renames the organisation while the slug stays read-only', async () => {
  answer()
  render(<Panel org="test-org" />)
  const name = (await screen.findByLabelText('Organisation name')) as HTMLInputElement
  expect(name.value).toBe('Old name')
  const slug = screen.getByLabelText(/Slug/) as HTMLInputElement
  expect(slug.value).toBe('test-org')
  expect(slug.readOnly).toBe(true)
  expect(slug.getAttribute('spellcheck')).toBe('false')

  fireEvent.change(name, { target: { value: 'New name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
  await waitFor(() =>
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('updateOrganisation', {
      org: 'test-org',
      body: { name: 'New name' }
    })
  )
  expect(await screen.findByText('Name saved.')).toBeTruthy()
  await expectAxeClean()
})

test('keyboard only: the name field and save button complete the rename', async () => {
  answer()
  render(<Panel org="test-org" />)
  const name = (await screen.findByLabelText('Organisation name')) as HTMLInputElement
  name.focus()
  expect(document.activeElement).toBe(name)
  fireEvent.change(name, { target: { value: 'Keyboard name' } })
  const save = screen.getByRole('button', { name: 'Save name' })
  save.focus()
  expect(document.activeElement).toBe(save)
  fireEvent.click(save)
  await waitFor(() =>
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      'updateOrganisation',
      expect.objectContaining({ body: { name: 'Keyboard name' } })
    )
  )
})

test('an empty or unchanged name is answered on submit, and unsaved edits warn before leaving', async () => {
  answer()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<Panel org="test-org" />)
  const name = (await screen.findByLabelText('Organisation name')) as HTMLInputElement
  const save = screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement
  expect(save.disabled).toBe(false)

  fireEvent.click(save)
  expect(await screen.findByText('That is already the organisation’s name.')).toBeTruthy()
  fireEvent.change(name, { target: { value: '  ' } })
  fireEvent.click(save)
  expect(await screen.findByText('Enter a name for the organisation.')).toBeTruthy()
  expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith('updateOrganisation', expect.anything())

  const link = document.createElement('a')
  link.href = '/elsewhere'
  document.body.append(link)
  const reached = vi.fn((event: Event) => event.preventDefault())
  link.addEventListener('click', reached)
  fireEvent.change(name, { target: { value: 'Another name' } })
  link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(reached).not.toHaveBeenCalled()
  link.remove()
  confirm.mockRestore()
})
