// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SubscriberData } from '@skyclause/contracts'
import { afterEach, expect, test, vi } from 'vitest'
import { SubscriberRights } from '../../features/subscriber-rights/subscriber-rights'
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
  expect(t('subscriber-rights.download')).toBe('Download my data')
  expect(t('subscriber-rights.delete')).toBe('Delete my data')
})

test('renders real tables with all subscriber data before client interaction', () => {
  const html = renderToStaticMarkup(<SubscriberRights initialData={data} token="manage-token" />)
  expect(html.match(/<table/g)).toHaveLength(5)
  expect(html).toContain('Bukit Jalil')
  expect(html).toContain('reader@example.test')
  expect(html).toContain('Release wave')
  expect(html).toContain('/c/call-id')
  expect(html).toContain('Download my data')
  expect(html).not.toContain('Deleted. We keep only a one-way hash')
})

test('the delete confirm names the project, shows pending state, then focuses the deletion result', async () => {
  let finish!: (response: Response) => void
  const send = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)))
  vi.stubGlobal('fetch', send)
  render(<SubscriberRights initialData={data} token="manage-token" />)

  fireEvent.click(screen.getByRole('button', { name: 'Delete my data' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete data for Bukit Jalil' }))
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeTruthy()
  expect(send).toHaveBeenCalledWith('/api/subscribe/manage-token/data', { method: 'DELETE' })

  finish(new Response(null, { status: 204 }))
  const result = await screen.findByRole('heading', {
    name: 'Deleted. We keep only a one-way hash of your address so we never email it again.'
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
