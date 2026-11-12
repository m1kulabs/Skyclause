// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/project/share/panel'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'campus-org', project: 'bukit-jalil' }) }))

const project = { id: 'project-1', name: 'Bukit Jalil campus' }
const link = (id: string, expires: string | null = '2026-11-12T13:12:00.000Z') => ({
  id,
  project_id: 'project-1',
  access: 'reviewer',
  expires_at: expires,
  revoked_at: null as string | null,
  last_used_at: null
})

let pages: { data: ReturnType<typeof link>[]; next_cursor: string | null }[] = []
let createFails = false
let listFails: ApiProblem | null = null
const api = vi.hoisted(() => vi.fn())
vi.mock('../../features/project-settings/operations', async (original) => {
  const actual = await original<typeof import('../../features/project-settings/operations')>()
  return { ...actual, projectSettingsApi: api, resolveProject: async () => project }
})

beforeEach(() => {
  createFails = false
  listFails = null
  api.mockImplementation(async (operation: string, args?: { query?: { cursor?: string }; params?: { id: string } }) => {
    if (operation === 'listShareLinks' && listFails) throw listFails
    if (operation === 'listShareLinks') return pages[args?.query?.cursor ? Number(args.query.cursor) : 0]
    if (operation === 'createShareLink') {
      if (createFails) throw new Error('no')
      return { ...link('created'), url: 'https://example.test/share/abc' }
    }
    if (operation === 'revokeShareLink') return { ...link(args!.params!.id), revoked_at: '2026-11-06T01:00:00Z' }
    throw new Error(`unexpected operation ${operation}`)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

test('share links that are not available yet (501) say so plainly: no form, no retry, no failed read', async () => {
  listFails = new ApiProblem(501, { title: 'Not built' })
  render(<Panel />)
  expect(await screen.findByText('Share links are not available yet.')).toBeDefined()
  expect(screen.queryByRole('button')).toBeNull()
  expect(document.body.textContent).not.toMatch(/Couldn’t read|can’t show|501/)
})

test('a share link list that really failed still says so and offers Try again', async () => {
  listFails = new ApiProblem(503, { title: 'Unavailable' })
  render(<Panel />)
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined()
  expect(document.body.textContent).toContain('Couldn’t read the share links just now.')
})

test('no links is a sentence that points at the form, not an n= count', async () => {
  pages = [{ data: [], next_cursor: null }]
  render(<Panel />)
  expect(await screen.findByText('No share links yet. Create one above.')).toBeDefined()
  expect(document.body.textContent).not.toMatch(/n=\d/)
})

test('a failed create is shown beside the form, with the way forward', async () => {
  pages = [{ data: [link('one')], next_cursor: null }]
  createFails = true
  render(<Panel />)
  const form = (await screen.findByRole('button', { name: 'Create link' })).closest('form')!
  fireEvent.submit(form)
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toBe('Share link could not be created. Try again.')
  expect(form.closest('section')?.contains(alert)).toBe(true)
})

test('revoking names the link by its access and expiry, never its ID, then puts focus on the list heading', async () => {
  pages = [{ data: [link('share-link-one')], next_cursor: null }]
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
  const dialog = await screen.findByRole('alertdialog')
  const heading = within(dialog).getByRole('heading')
  expect(heading.textContent).toContain('Reviewer link, expires 12 November 2026')
  expect(dialog.textContent).not.toContain('share-link-one')
  fireEvent.click(within(dialog).getByRole('button', { name: /^Revoke link/ }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull())
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Share links', level: 3 }))
  )
})

test('every page of links is read and shown 50 at a time', async () => {
  const many = Array.from({ length: 120 }, (_, index) => link(`link-${index}`))
  pages = [
    { data: many.slice(0, 100), next_cursor: '1' },
    { data: many.slice(100), next_cursor: null }
  ]
  render(<Panel />)
  await screen.findByText('120 links')
  expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(50)
  expect(screen.getByText('1–50 of 120')).toBeDefined()
  const previous = screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement
  expect(previous.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('101–120 of 120')).toBeDefined()
  expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(20)
  expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(true)
})
