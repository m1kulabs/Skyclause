// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SubscriberData } from '@skyclause/contracts'
import { afterEach, expect, test, vi } from 'vitest'
import { SubscriberRights, SubscriberRightsLinkError } from '../../features/subscriber-rights/subscriber-rights'
import { t } from '../../features/subscriber-rights/i18n'

const data: SubscriberData = {
  project_name: 'Bukit Jalil',
  subscriber: {
    id: 'subscriber-id',
    project_id: 'project-id',
    email: 'reader@example.test',
    role: 'Commuter',
    window_ids: ['window-id'],
    channels: ['email'],
    language: 'en',
    confirmed_at: '2026-11-01T01:00:00Z'
  },
  subscriber_status: 'confirmed',
  windows: [
    {
      id: 'window-id',
      title: 'Release wave',
      starts_at: '2026-11-10T01:00:00Z',
      ends_at: '2026-11-10T02:00:00Z',
      kind: 'class',
      tz: 'Asia/Kuala_Lumpur'
    }
  ],
  consent_records: [{ at: '2026-11-01T01:00:00Z', form: 'confirm', notice_version: '2026-11-01', language: 'en' }],
  delivery_history: [
    {
      id: 'notice-id',
      kind: 'call',
      call_id: 'call-id',
      call_permalink: '/c/call-id',
      channel: 'email',
      language: 'en',
      status: 'sent',
      at: '2026-11-02T01:00:00Z',
      accepted_at: '2026-11-02T01:00:00Z'
    }
  ],
  crowd_replies: [
    {
      id: 'reply-id',
      window_id: 'window-id',
      call_id: 'call-id',
      kind: 'keep',
      shift_to: null,
      at: '2026-11-02T01:05:00Z'
    }
  ],
  suppression: null
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('English catalogue contains subscriber data rights copy', () => {
  expect(t('subscriber-rights.title')).toContain('your data')
  expect(t('subscriber-rights.download')).toBe('Download your data')
  expect(t('subscriber-rights.delete')).toBe('Delete your data')
})

test('renders real tables with all subscriber data before client interaction', () => {
  const html = renderToStaticMarkup(<SubscriberRights initialData={data} token="manage-token" />)
  expect(html.match(/<table/g)).toHaveLength(5)
  expect(html).toContain('Bukit Jalil')
  expect(html).toContain('reader@example.test')
  expect(html).toContain('Release wave')
  // The permalink page is not built, so nothing links to it.
  expect(html).not.toContain('/c/call-id')
  expect(html).toContain('Download your data')
  expect(html).not.toContain('Deleted. Only a one-way hash')
})

test('the delete confirm names the project, shows pending state, then focuses the deletion result', async () => {
  let finish!: (response: Response) => void
  const send = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)))
  vi.stubGlobal('fetch', send)
  render(<SubscriberRights initialData={data} token="manage-token" />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete your data' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete data for Bukit Jalil' }))
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeTruthy()
  expect(send).toHaveBeenCalledWith('/api/subscribe/manage-token/data', { method: 'DELETE' })

  finish(new Response(null, { status: 204 }))
  const result = await screen.findByRole('heading', {
    name: 'Deleted. Only a one-way hash of your address is kept, so it is never emailed again.'
  })
  await waitFor(() => expect(document.activeElement).toBe(result))
})

test('subscriber page has no axe violations', async () => {
  const { container } = render(<SubscriberRights initialData={data} token="manage-token" />)
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => ({ font: '', measureText: () => ({ width: 0 }) }) as unknown as CanvasRenderingContext2D)
  try {
    const result = await axe.run(container)
    expect(result.violations.map(({ id, impact }) => ({ id, impact }))).toEqual([])
  } finally {
    canvas.mockRestore()
  }
})

test('the correction form names its fields and keeps the email literal (#691)', () => {
  const html = renderToStaticMarkup(<SubscriberRights initialData={data} token="manage-token" />)
  const input = (name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))![0]

  expect(input('email')).toMatch(/type="email"/)
  expect(input('email')).toMatch(/autoComplete="email"/i)
  expect(input('email')).toMatch(/spellCheck="false"/i)
  expect(input('role')).toMatch(/autoComplete="organization-title"/i)
  expect(html.match(/<main/g)).toHaveLength(1)
})

test('a Malay subscriber reads the page in Malay, in a Malay main landmark', () => {
  const html = renderToStaticMarkup(
    <SubscriberRights
      initialData={{ ...data, subscriber: { ...data.subscriber, language: 'ms' } }}
      token="manage-token"
    />
  )

  expect(html).toContain('lang="ms"')
  expect(html).toContain('Urus data anda')
  expect(html).toContain('Muat turun data anda')
  expect(html).not.toContain('Manage your data')
})

test('codes and identifiers read as words: channels, languages, forms, kinds and statuses, never IDs', () => {
  const html = renderToStaticMarkup(
    <SubscriberRights
      initialData={{
        ...data,
        subscriber: { ...data.subscriber, channels: ['email', 'in_app'] },
        consent_records: [{ ...data.consent_records[0]!, form: 'subscribe_link', language: 'ms' }]
      }}
      token="manage-token"
    />
  )
  for (const raw of [
    'in_app',
    'subscribe_link',
    '>ms<',
    'subscriber-id',
    'window-id',
    'notice-id',
    'reply-id',
    '>sent<',
    '>keep<',
    'Asia/Kuala_Lumpur'
  ]) {
    expect(html).not.toContain(raw)
  }
  for (const word of [
    'Email and In-app',
    'Subscribe link',
    'Bahasa Melayu',
    'Call notice',
    'Sent',
    'Keep the plan',
    'MYT'
  ]) {
    expect(html).toContain(word)
  }
})

test('a long history renders 50 rows at most and says how many it holds', () => {
  const many = Array.from({ length: 73 }, (_, index) => ({
    ...data.delivery_history[0]!,
    id: `notice-${index}`,
    at: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString()
  }))
  render(<SubscriberRights initialData={{ ...data, delivery_history: many }} token="manage-token" />)
  const table = screen.getByRole('table', { name: t('subscriber-rights.delivery') })
  expect(table.querySelectorAll('tbody tr')).toHaveLength(50)
  expect(screen.getByText(t('subscriber-rights.showing_latest', { shown: '50', count: '73' }))).toBeTruthy()
})

test('a refused correction says so beside the email field and returns focus to it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 422 })))
  )
  render(<SubscriberRights initialData={data} token="manage-token" />)
  fireEvent.click(screen.getByRole('button', { name: t('subscriber-rights.save') }))
  const email = screen.getByRole('textbox', { name: t('subscriber-rights.email') })
  const message = await screen.findByText(t('subscriber-rights.email_rejected'))
  expect(email.getAttribute('aria-invalid')).toBe('true')
  expect(email.getAttribute('aria-describedby')).toBe(message.closest('p')!.id)
  await waitFor(() => expect(document.activeElement).toBe(email))
})

test('a failed link speaks the reader’s language', () => {
  const html = renderToStaticMarkup(<SubscriberRightsLinkError expired={false} locale="ms" />)
  expect(html).toContain('lang="ms"')
  expect(html).toContain(t('subscriber-rights.unavailable', {}, 'ms'))
})
