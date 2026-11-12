// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Webhooks } from '../../features/webhooks/client'
import type { WebhookEventType } from '@skyclause/contracts'

const navigation = vi.hoisted(() => ({ search: '', push: vi.fn(), replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => '/developers/webhooks',
  useRouter: () => ({ push: navigation.push, replace: navigation.replace })
}))

const endpoint1 = {
  id: 'endpoint-1',
  url: 'https://receiver.example.test/hooks-1',
  events: ['call.sent' as WebhookEventType],
  project_ids: [] as string[],
  disabled_at: null,
  verified_at: '2026-11-06T01:00:00Z',
  status: 'verified',
  last_delivery_at: '2026-11-06T01:00:00Z'
}
const EVENT_A = '019a55b0-0000-7000-8000-00000000000a'
const EVENT_B = '019a55b0-0000-7000-8000-00000000000b'
const endpoint2 = { ...endpoint1, id: 'endpoint-2', url: 'https://receiver.example.test/hooks-2' }

function delivery(id: string, eventId: string, attempt: number, createdAt: string) {
  return {
    id,
    event_id: eventId,
    dispatch_id: `dispatch-${id}`,
    attempt,
    status_code: 503,
    latency_ms: 120,
    state: 'failed',
    attempted_at: createdAt,
    request_headers: {
      'Skyclause-Webhook-Id': eventId,
      'Skyclause-Webhook-Timestamp': '1793926800',
      'Skyclause-Signature': 'v1=test-signature'
    },
    request_body: {
      id: eventId,
      type: 'call.sent',
      created_at: createdAt,
      org_id: 'org-1',
      project_id: 'project-1',
      data: {}
    },
    raw_request_body: `{"id":"${eventId}"}`,
    response_headers: {},
    response_body: 'Receiver unavailable',
    error: 'receiver-unavailable',
    next_retry_at: '2026-11-06T01:05:00Z'
  }
}

const apiFetchMock = vi.hoisted(() =>
  vi.fn(async (operationId: string, args?: { params?: { id?: string } }) => {
    switch (operationId) {
      case 'listWebhooks':
        return { data: [endpoint1, endpoint2], next_cursor: null }
      case 'listProjects':
        return { data: [], next_cursor: null }
      case 'getWebhook':
        return args?.params?.id === 'endpoint-2' ? endpoint2 : endpoint1
      case 'listWebhookDeliveries':
        return {
          data: [
            delivery('delivery-a', EVENT_A, 1, '2026-11-06T01:00:00Z'),
            delivery('delivery-b', EVENT_B, 2, '2026-11-05T01:00:00Z')
          ],
          next_cursor: null
        }
      default:
        throw new Error(`unexpected operation ${operationId}`)
    }
  })
)

vi.mock('../../features/webhooks/operations', async (original) => {
  const actual = await original<typeof import('../../features/webhooks/operations')>()
  return { ...actual, apiFetch: apiFetchMock }
})

vi.stubGlobal('matchMedia', () => ({ addEventListener: () => {}, removeEventListener: () => {}, matches: false }))
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  navigation.search = ''
})

test('inspector auto-selects the first endpoint with replace', async () => {
  render(<Webhooks org="test-org" />)
  await screen.findByRole('list', { name: 'Inspect endpoint' })
  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith('/developers/webhooks?webhook=endpoint-1', { scroll: false })
  )
})

test('endpoint switch pushes the URL and swaps the inspected endpoint', async () => {
  const { container, rerender } = render(<Webhooks org="test-org" />)
  const rows = await screen.findByRole('list', { name: 'Inspect endpoint' })
  navigation.search = 'webhook=endpoint-1'
  rerender(<Webhooks org="test-org" />)
  await waitFor(() => expect(container.querySelector('p.webhook-url')?.textContent).toBe(endpoint1.url))
  expect(
    within(rows)
      .getByRole('link', { name: /hooks-1/ })
      .getAttribute('aria-current')
  ).toBe('true')

  const second = within(rows).getByRole('link', { name: /hooks-2/ })
  expect(second.getAttribute('href')).toBe('/developers/webhooks?webhook=endpoint-2')
  // A modified click is left to the browser (a new tab); a plain click changes the inspected endpoint in the app.
  second.addEventListener('click', (event) => event.preventDefault(), { once: true })
  fireEvent.click(second, { metaKey: true })
  expect(navigation.push).not.toHaveBeenCalled()
  fireEvent.click(second)
  expect(navigation.push).toHaveBeenCalledWith('/developers/webhooks?webhook=endpoint-2', { scroll: false })

  navigation.search = 'webhook=endpoint-2'
  rerender(<Webhooks org="test-org" />)
  await waitFor(() => expect(container.querySelector('p.webhook-url')?.textContent).toBe(endpoint2.url))
})

const toggleOf = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-delivery-id="${id}"] button[aria-expanded]`)

test('deliveries are table rows, newest event first, with the event ID cut and copyable', async () => {
  const { container, rerender } = render(<Webhooks org="test-org" />)
  navigation.search = 'webhook=endpoint-1'
  rerender(<Webhooks org="test-org" />)
  const table = await screen.findByRole('table', { name: 'Delivery log' })
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)
  ).toEqual(['Time', 'Event', 'Attempt', 'Outcome', 'Duration', 'Details'])
  expect(
    [...container.querySelectorAll('[data-delivery-id]')].map((row) => row.getAttribute('data-delivery-id'))
  ).toEqual(['delivery-a', 'delivery-b'])
  // Only the last 8 characters of the ID show; the control copies the whole ID.
  const row = container.querySelector('[data-delivery-id="delivery-a"]') as HTMLElement
  expect(within(row).getByText('…0000000a')).toBeDefined()
  expect(within(row).getByRole('button', { name: 'Copy event ID' })).toBeDefined()
  expect(within(row).queryByText(EVENT_A)).toBeNull()
  expect(row.getAttribute('data-event-id')).toBe(EVENT_A)
})

test('delivery selection replaces the URL and opens the attempt', async () => {
  const { container, rerender } = render(<Webhooks org="test-org" />)
  navigation.search = 'webhook=endpoint-1'
  rerender(<Webhooks org="test-org" />)
  await screen.findByRole('table', { name: 'Delivery log' })
  // The newest attempt is open until another is chosen.
  expect(toggleOf(container, 'delivery-a')?.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: /Details of attempt 2/ }))
  expect(navigation.replace).toHaveBeenCalledWith('/developers/webhooks?webhook=endpoint-1&delivery=delivery-b', {
    scroll: false
  })
  expect(navigation.push).not.toHaveBeenCalled()

  navigation.search = 'webhook=endpoint-1&delivery=delivery-b'
  rerender(<Webhooks org="test-org" />)
  await waitFor(() => expect(toggleOf(container, 'delivery-b')?.getAttribute('aria-expanded')).toBe('true'))
  expect(toggleOf(container, 'delivery-a')?.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('[data-delivery-detail="delivery-b"]')).not.toBeNull()
  expect(container.querySelector('[data-delivery-detail="delivery-a"]')).toBeNull()
})

test('the open attempt can be closed, with nothing chosen in the URL', async () => {
  const { container, rerender } = render(<Webhooks org="test-org" />)
  navigation.search = 'webhook=endpoint-1'
  rerender(<Webhooks org="test-org" />)
  await screen.findByRole('table', { name: 'Delivery log' })
  expect(container.querySelector('[data-delivery-detail="delivery-a"]')).not.toBeNull()
  fireEvent.click(toggleOf(container, 'delivery-a')!)
  await waitFor(() => expect(container.querySelector('[data-delivery-detail="delivery-a"]')).toBeNull())
  expect(toggleOf(container, 'delivery-a')?.getAttribute('aria-expanded')).toBe('false')
  expect(navigation.push).not.toHaveBeenCalled()
})

test('the inspector speaks the request language', async () => {
  const { rerender } = render(<Webhooks org="test-org" locale="ms" />)
  navigation.search = 'webhook=endpoint-1'
  rerender(<Webhooks org="test-org" locale="ms" />)
  expect(await screen.findByRole('table', { name: 'Log penghantaran' })).toBeDefined()
  expect(screen.getByRole('button', { name: 'Daftar webhook' })).toBeDefined()
})
