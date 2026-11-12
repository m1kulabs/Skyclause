// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Webhooks } from '../../features/webhooks/client'
import { Secret } from '../../features/webhooks/endpoint'
import type { WebhookEventType } from '@skyclause/contracts'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/test-org/settings/webhooks',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}))

const first = {
  id: 'endpoint-1',
  url: 'https://receiver.example.test/hooks-1',
  events: ['call.sent' as WebhookEventType, 'call.approved' as WebhookEventType],
  project_ids: [] as string[],
  disabled_at: null,
  verified_at: null as string | null,
  status: 'pending',
  last_delivery_at: '2026-11-06T01:00:00Z'
}
const second = { ...first, id: 'endpoint-2', url: 'https://receiver.example.test/hooks-2', project_ids: ['project-1'] }

const apiFetchMock = vi.hoisted(() =>
  vi.fn(async (operationId: string, args?: { params?: { id?: string } }) => {
    switch (operationId) {
      case 'listWebhooks':
        return { data: [first, second], next_cursor: null }
      case 'listProjects':
        return { data: [{ id: 'project-1', name: 'Bukit Jalil campus' }], next_cursor: null }
      case 'verifyWebhook':
        return { ...first, id: args?.params?.id, status: 'verified', verified_at: '2026-11-06T01:00:00Z' }
      case 'deleteWebhook':
        return undefined
      default:
        throw new Error(`unexpected operation ${operationId}`)
    }
  })
)

vi.mock('../../features/webhooks/operations', async (original) => {
  const actual = await original<typeof import('../../features/webhooks/operations')>()
  return { ...actual, apiFetch: apiFetchMock }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const openMenu = async (url: string) => {
  const trigger = await screen.findByRole('button', { name: `More actions for ${url}` })
  fireEvent.pointerDown(trigger, { pointerType: 'mouse' })
  fireEvent.click(trigger)
}

test('endpoints are table rows whose buttons name their endpoint, with the rest in a row menu', async () => {
  render(<Webhooks org="test-org" settings />)
  const table = await screen.findByRole('table', { name: 'Endpoints' })
  const rows = within(table).getAllByRole('row')
  expect(rows).toHaveLength(3)
  const row = rows[2]!
  expect(within(row).getByText(second.url).getAttribute('translate')).toBe('no')
  expect(within(row).getByText('2 events')).toBeDefined()
  // The project the endpoint is limited to is counted, never shown as an ID.
  expect(within(row).getByText('1 project').getAttribute('title')).toBe('Bukit Jalil campus')
  expect(within(row).queryByText('project-1')).toBeNull()
  expect(
    within(row)
      .getByRole('link', { name: `Open in inspector: ${second.url}` })
      .getAttribute('href')
  ).toBe('/developers/webhooks?webhook=endpoint-2')
  // Verify again and Delete are not repeated on every row: each row has one menu button.
  expect(screen.queryByRole('button', { name: /^Delete webhook/ })).toBeNull()
  expect(screen.getAllByRole('button', { name: /^More actions for/ })).toHaveLength(2)
})

test('verifying from the row menu reports the result next to the table', async () => {
  render(<Webhooks org="test-org" settings />)
  await openMenu(first.url)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Verify again' }))
  await waitFor(() =>
    expect(apiFetchMock).toHaveBeenCalledWith('verifyWebhook', { org: 'test-org', params: { id: 'endpoint-1' } })
  )
  expect(await screen.findByText(`${first.url}: Verified 6 November 2026, 09:00 MYT`)).toBeDefined()
})

test('deleting an endpoint asks for its URL, removes the row and puts focus on the Add button', async () => {
  render(<Webhooks org="test-org" settings />)
  await openMenu(first.url)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete webhook' }))
  const dialog = await screen.findByRole('alertdialog')
  const confirm = within(dialog).getByRole('button', { name: `Delete webhook “${first.url}”` })
  expect((confirm as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: first.url } })
  fireEvent.click(confirm)
  await waitFor(() =>
    expect(apiFetchMock).toHaveBeenCalledWith('deleteWebhook', { org: 'test-org', params: { id: 'endpoint-1' } })
  )
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^More actions for/ })).toHaveLength(1))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a webhook' })))
})

test('the signing secret takes focus, and discarding it asks first', async () => {
  const dismiss = vi.fn()
  render(<Secret value="skw_browser-test-only-secret" url={first.url} dismiss={dismiss} />)
  expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Signing secret' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard secret' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dismiss).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: `Discard secret for “${first.url}”` }))
  await waitFor(() => expect(dismiss).toHaveBeenCalledTimes(1))
})

test('a copy that the browser refuses is announced with what to do', async () => {
  render(<Secret value="skw_browser-test-only-secret" url={first.url} dismiss={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy secret' }))
  expect(await screen.findByText('Could not copy. Select the secret and copy it with your keyboard.')).toBeDefined()
})
