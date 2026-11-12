// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Reach } from '../../features/subscribers/counts'
import '../../features/subscribe/catalogue'
import '../../features/subscribers/catalogue'
import { SubscriberTable } from '../../features/subscribers/table'
import type { Counts, Rows } from '../../features/subscribers'

type Row = Rows['data'][number]

const row = (id: string, email: string, extra: Partial<Row> = {}): Row => ({
  id,
  project_id: 'project-id',
  email,
  role: 'Student',
  window_ids: ['window-a', 'window-b'],
  channels: ['email'],
  language: 'en',
  confirmed_at: '2026-11-06T01:00:00Z',
  status: 'confirmed',
  suppressed: false,
  last_notice_at: '2026-11-06T02:00:00Z',
  consent: { at: '2026-11-06T00:00:00Z', form: 'subscribe_link', notice_version: '2026-11-06', language: 'en' },
  ...extra
})

const props = {
  from: 1,
  total: 2,
  hasPrevious: false,
  hasNext: false,
  busy: false,
  removing: false,
  onPrevious: () => undefined,
  onNext: () => undefined,
  onRemove: () => undefined,
  locale: 'en' as const
}

afterEach(cleanup)

test('a subscriber is one line: the consent record and last notice wait behind the email', () => {
  render(<SubscriberTable {...props} rows={[row('s1', 'amina@example.test'), row('s2', 'lee@example.test')]} />)
  const table = screen.getByRole('table')
  expect(table.getAttribute('data-slot')).toBe('table')
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(table.textContent).not.toContain('Notice version')
  expect(table.textContent).not.toContain('Last notice')

  fireEvent.click(screen.getByRole('button', { name: 'amina@example.test' }))
  const dialog = screen.getByRole('dialog')
  expect(
    within(dialog).getByText('Form: Subscribe link · Notice version: 2026-11-06 · Language: English')
  ).toBeDefined()
  expect(within(dialog).getByText('Last notice')).toBeDefined()
})

test('the consent form is said in words, never as the key the API records', () => {
  const imported = row('s1', 'amina@example.test', {
    consent: { at: '2026-11-06T00:00:00Z', form: 'import', notice_version: '2026-11-06', language: 'ms' }
  })
  const unknown = row('s2', 'lee@example.test', {
    consent: { at: '2026-11-06T00:00:00Z', form: 'mystery_form', notice_version: '2026-11-06', language: 'en' }
  })
  render(<SubscriberTable {...props} rows={[imported, unknown]} />)
  fireEvent.click(screen.getByRole('button', { name: 'amina@example.test' }))
  expect(screen.getByRole('dialog').textContent).toContain('Form: Added by the project')
  expect(screen.getByRole('dialog').textContent).not.toContain('import ·')
  cleanup()
  render(<SubscriberTable {...props} rows={[unknown]} />)
  fireEvent.click(screen.getByRole('button', { name: 'lee@example.test' }))
  expect(screen.getByRole('dialog').textContent).toContain('Form: Another form')
  expect(screen.getByRole('dialog').textContent).not.toContain('mystery_form')
})

test('row actions are one menu per row that names its subscriber, with Remove inside', async () => {
  const onRemove = vi.fn()
  render(<SubscriberTable {...props} rows={[row('s1', 'amina@example.test')]} onRemove={onRemove} />)
  expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
  const menu = screen.getByRole('button', { name: 'More actions for amina@example.test' })
  fireEvent.pointerDown(menu, { pointerType: 'mouse' })
  fireEvent.click(menu)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove subscriber' }))
  expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
})

test('the filter and the figure use one word, Suppressed, and the pager draws only a control that can go somewhere', () => {
  const { rerender } = render(<SubscriberTable {...props} rows={[row('s1', 'amina@example.test')]} />)
  expect(screen.getByRole('button', { name: 'Suppressed' })).toBeDefined()
  expect(screen.queryByText('Stopped')).toBeNull()
  // Twelve of twelve: nothing before and nothing after, so neither control is drawn.
  expect(screen.queryByRole('button', { name: /page$/ })).toBeNull()

  rerender(<SubscriberTable {...props} rows={[row('s1', 'amina@example.test')]} hasPrevious />)
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDefined()
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
})

test('a suppressed subscriber is dimmed by the filter, never removed', async () => {
  const rows = [
    row('s1', 'amina@example.test'),
    row('s2', 'bounce@example.test', { status: 'bounced', suppressed: true })
  ]
  render(<SubscriberTable {...props} rows={rows} />)
  fireEvent.click(screen.getByRole('button', { name: 'Suppressed' }))
  await waitFor(() => expect(screen.getByText('1 of 2 on this page match.')).toBeDefined())
  expect(screen.getAllByRole('row')).toHaveLength(3)
  expect(window.location.search).toContain('status=suppressed')
  window.history.replaceState(null, '', '/')
})

const counts = {
  total: 3,
  confirmed: 3,
  unconfirmed: 0,
  suppressed: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  by_window: [
    { window_id: '018f47a3-b2c1-7c00-8000-0000000034d0', count: 2 },
    { window_id: '018f47a3-b2c1-7c00-8000-0000000034d1', count: 1 }
  ],
  by_channel: [{ channel: 'email', count: 3 }]
} as unknown as Counts

test('subscriber counts by window are labelled with the window’s name and time, never an identifier', () => {
  const windows = new Map([
    ['018f47a3-b2c1-7c00-8000-0000000034d0', { title: 'Morning lecture', starts_at: '2026-11-13T00:30:00Z' }]
  ])
  render(<Reach counts={counts} windows={windows} locale="en" />)
  const card = screen.getByRole('region', { name: 'Count by window' })
  expect(within(card).getByText(/^Morning lecture · Fri, 13 Nov, 08:30 MYT$/)).toBeDefined()
  expect(within(card).getByText('A window that is no longer listed')).toBeDefined()
  expect(card.textContent).not.toContain('34d0')
  expect(card.textContent).not.toContain('…')
})

test('a failed read of the window names replaces the card with its own error', () => {
  render(
    <Reach
      counts={counts}
      windows={undefined}
      windowsError={<p role="alert">{['Could not read the window names']}</p>}
      locale="en"
    />
  )
  expect(screen.getByRole('alert').textContent).toBe('Could not read the window names')
  expect(screen.queryByRole('region', { name: 'Count by window' })).toBeNull()
})
