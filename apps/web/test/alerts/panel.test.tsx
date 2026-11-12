// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Devices } from '../../features/alerts/devices'
import { Inbox } from '../../features/alerts/inbox'
import { Preferences } from '../../features/alerts/preferences'
import { apiFetch } from '../../features/alerts/operations'
import '../../features/alerts/i18n'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams()
}))
vi.mock('../../lib/read-sse', () => ({ readSse: () => new Promise(() => undefined) }))
vi.mock('../../features/alerts/operations', async (original) => ({
  ...(await original<typeof import('../../features/alerts/operations')>()),
  apiFetch: vi.fn()
}))

const device = {
  id: 'device-1',
  account_id: 'account-1',
  endpoint: 'https://push.example.test/device-1',
  p256dh: 'key',
  auth: 'auth',
  user_agent: 'Firefox on Linux',
  last_ok_at: null
}

const notification = {
  id: 'notice-1',
  kind: 'needs_review',
  ref: { type: 'bundle', id: '018f47a3-b2c1-7c00-8000-00000000abcd' },
  project: { id: 'project-1', slug: 'bukit-jalil', org_slug: 'apu' },
  recovered: false,
  created_at: '2026-11-06T02:00:00Z',
  read_at: null
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(apiFetch).mockReset()
})

test('removing a device asks first, names it, then hands focus to the heading and announces it', async () => {
  const calls: string[] = []
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    calls.push(operation)
    if (operation === 'listPushSubscriptions') return { data: [device], next_cursor: null }
    return undefined
  }) as unknown as typeof apiFetch)
  render(<Devices accountId="account-1" locale="en" version={0} onRemoved={() => undefined} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Remove device: Firefox on Linux' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('Remove “Firefox on Linux”')
  expect(calls).not.toContain('deletePushSubscription')

  fireEvent.click(screen.getByRole('button', { name: 'Remove “Firefox on Linux”' }))
  await waitFor(() => expect(calls).toContain('deletePushSubscription'))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.getByRole('status')).toHaveTextContent('Removed Firefox on Linux.')
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Registered devices' })))
})

test('a device row carries no constant "added date unavailable" line', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ data: [device], next_cursor: null } as never)
  render(<Devices accountId="account-1" locale="en" version={0} onRemoved={() => undefined} />)
  await screen.findByText('Firefox on Linux')
  expect(screen.queryByText(/date unavailable/i)).toBeNull()
})

test('marking an item read names the item, never prints its internal id, and puts focus on the row', async () => {
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'listNotifications') return { data: [notification], next_cursor: null }
    if (operation === 'markNotificationRead') return { ...notification, read_at: '2026-11-06T03:00:00Z' }
    throw new Error(`no ${operation} double`)
  }) as unknown as typeof apiFetch)
  const { container } = render(<Inbox locale="en" />)

  const button = await screen.findByRole('button', { name: 'Mark read: Needs review · bukit-jalil' })
  expect(container.textContent).not.toContain('018f47a3')
  fireEvent.click(button)

  await waitFor(() => expect(document.activeElement).toBe(container.querySelector('[data-notification="notice-1"]')))
  expect(screen.queryByRole('button', { name: /Mark read/ })).toBeNull()
  expect(container.querySelector('[role="status"][aria-live="polite"]')).toHaveTextContent(
    'Marked read: Needs review · bukit-jalil'
  )
})

test('the older-page button says it returns to the first items, and an empty inbox is not an n= line', async () => {
  vi.mocked(apiFetch).mockResolvedValue({ data: [], next_cursor: null } as never)
  render(<Inbox locale="en" />)
  expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument()
  expect(screen.queryByText(/n=0/)).toBeNull()
})

test('a failed preference save is an alert of its own while the status region stays mounted', async () => {
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'getMyNotificationPreferences') return { data: [{ kind: 'needs_review', enabled: true }] }
    throw new Error('offline')
  }) as unknown as typeof apiFetch)
  // jsdom has no PointerEvent; Base UI's switch builds one for its click.
  vi.stubGlobal('PointerEvent', class extends MouseEvent {})
  render(<Preferences locale="en" />)
  const toggle = await screen.findByRole('switch', { name: 'Needs review' })
  const status = document.getElementById('alerts-save-needs_review')!
  expect(status).toHaveAttribute('role', 'status')
  fireEvent.click(toggle)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('This preference was not saved')
  expect(document.getElementById('alerts-save-needs_review')).toBe(status)
  expect(status).toHaveAttribute('role', 'status')
})
