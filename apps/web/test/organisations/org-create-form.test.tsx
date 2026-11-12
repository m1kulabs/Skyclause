// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import '../../features/organisations/catalogue'
import { OrgCreateForm } from '../../features/organisations/org-create-form'
import { apiFetch } from '../../features/organisations/operations'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('../../features/organisations/operations', async (original) => ({
  ...(await original<typeof import('../../features/organisations/operations')>()),
  apiFetch: vi.fn()
}))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
  push.mockReset()
  refresh.mockReset()
})

async function expectAxeClean(): Promise<void> {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('')
}

test('reserved and format errors show inline as you type, with spellcheck off on the slug', async () => {
  render(<OrgCreateForm />)
  const slug = screen.getByLabelText('Slug') as HTMLInputElement
  expect(slug.getAttribute('spellcheck')).toBe('false')

  fireEvent.change(slug, { target: { value: 'New' } })
  expect(await screen.findByText('new is reserved. Choose another slug.')).toBeTruthy()
  fireEvent.change(slug, { target: { value: 'A' } })
  expect(await screen.findByText(/Use 2–39 lowercase letters/)).toBeTruthy()
  await expectAxeClean()
})

test('typing the first letter of the name shows no slug error before the slug is touched', async () => {
  render(<OrgCreateForm />)
  const slug = screen.getByLabelText('Slug') as HTMLInputElement
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'R' } })
  expect(slug.value).toBe('r')
  expect(screen.queryByText(/Use 2–39 lowercase letters/)).toBeNull()
  expect(slug.getAttribute('aria-invalid')).toBe('false')
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'New' } })
  expect(await screen.findByText('new is reserved. Choose another slug.')).toBeTruthy()
})

test('a one-letter suggested slug still fails on submit, with focus on the slug', async () => {
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'R' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  expect(await screen.findByText(/Use 2–39 lowercase letters/)).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Slug')))
  expect(apiFetch).not.toHaveBeenCalled()
})

test('the slug is suggested from the name and stays editable', async () => {
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('river-watch')
  fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'custom-slug' } })
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch 2' } })
  expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('custom-slug')
})

test('a taken slug shows its reason on submit, with focus moved to the field (ORG-1)', async () => {
  vi.mocked(apiFetch).mockRejectedValue(
    new ApiProblem(409, {
      type: 'https://docs.skyclause.m1ku.tech/problems/slug-taken',
      title: 'Slug taken',
      status: 409,
      detail: 'river-watch is taken. Choose another slug.'
    })
  )
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  const slug = screen.getByLabelText('Slug')
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  expect(await screen.findByText('river-watch is taken. Choose another slug.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(slug))
  expect(push).not.toHaveBeenCalled()
  await expectAxeClean()
})

test('success continues to the first run next step', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ id: 'org-id', slug: 'river-watch' } as never)
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/river-watch/new'))
})

test('success refreshes the shell after the push, so its switchers hold the new organisation', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ id: 'org-id', slug: 'river-watch' } as never)
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  // The refresh is queued behind the navigation, so it re-renders the new page's layouts from the root.
  expect(push.mock.invocationCallOrder[0]).toBeLessThan(refresh.mock.invocationCallOrder[0]!)
})

test('an empty form can be submitted: it says what is missing and focuses it, instead of a dead button', async () => {
  render(<OrgCreateForm />)
  const button = screen.getByRole('button', { name: 'Create organisation' }) as HTMLButtonElement
  expect(button.disabled).toBe(false)
  fireEvent.click(button)
  expect(await screen.findByText('Enter a name for the organisation.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Organisation name')))
  expect(apiFetch).not.toHaveBeenCalled()
})

test('a failed create says it was not created and moves focus to that message', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiProblem(503, { title: 'Unavailable', status: 503 }))
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  const alert = await screen.findByText('The organisation was not created. Try again.')
  expect(screen.queryByText('Could not load this organisation.')).toBeNull()
  await waitFor(() => expect(document.activeElement).toBe(alert.closest('[role="alert"]')))
  // The fields keep focus while a request runs: they are read-only, never disabled.
  expect((screen.getByLabelText('Slug') as HTMLInputElement).disabled).toBe(false)
})

test('the button stays busy after success until the next page takes over, so a second click cannot create it twice', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ id: 'org-id', slug: 'river-watch' } as never)
  render(<OrgCreateForm />)
  fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'River Watch' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
  await waitFor(() => expect(push).toHaveBeenCalledTimes(1))
  const busy = screen.getByRole('button', { name: 'Creating…' }) as HTMLButtonElement
  expect(busy.disabled).toBe(true)
  fireEvent.click(busy)
  expect(apiFetch).toHaveBeenCalledTimes(1)
})

test('the form is written in the language it is given', () => {
  render(<OrgCreateForm locale="ms" />)
  expect(screen.getByRole('button', { name: 'Cipta organisasi' })).toBeTruthy()
})
