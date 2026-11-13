// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Channels } from '../../features/channels'
import { apiFetch } from '../../features/subscribe/operations'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'apu', project: 'bukit-jalil' }) }))
vi.mock('../../features/subscribers/project', () => ({
  resolveProject: async () => ({ id: 'project-1', slug: 'bukit-jalil' })
}))
vi.mock('../../features/subscribe/operations', async (original) => ({
  ...(await original<typeof import('../../features/subscribe/operations')>()),
  apiFetch: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.mocked(apiFetch).mockReset()
})

function answer(channels: Array<{ channel: string; enabled: boolean }>, preview?: unknown) {
  vi.mocked(apiFetch).mockImplementation((async (operation: string) => {
    if (operation === 'listChannels') return { data: channels }
    if (operation === 'previewChannels') return preview
    throw new Error(`no ${operation} double`)
  }) as unknown as typeof apiFetch)
}

test('the panel is written in the language it is given, not one a query string asks for', async () => {
  answer([{ channel: 'email', enabled: true }])
  render(<Channels locale="ms" />)
  expect(await screen.findByText('Ke mana keputusan diluluskan dihantar')).toBeInTheDocument()
  expect(screen.queryByText('Where approved calls go')).toBeNull()
  expect(screen.getByText(/Pelanggan yang telah mengesahkan/)).toBeInTheDocument()
})

test('an empty channel list and an empty preview say so in words, with no n= count', async () => {
  answer([], { n: 0, call_id: null, previews: [] })
  const { container } = render(<Channels />)
  expect(await screen.findByText(/No channels yet/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Preview the latest notice' }))
  expect(await screen.findByText(/No approved call yet/)).toBeInTheDocument()
  expect(container.textContent).not.toMatch(/n=\d/)
})

test('a preview names no internal call id', async () => {
  answer([{ channel: 'email', enabled: true }], {
    n: 1,
    call_id: '018f47a3-b2c1-7c00-8000-00000000abcd',
    previews: []
  })
  const { container } = render(<Channels />)
  fireEvent.click(await screen.findByRole('button', { name: 'Preview the latest notice' }))
  expect(await screen.findByText('From the latest approved call.')).toBeInTheDocument()
  expect(container.textContent).not.toContain('018f47a3')
})

test('a channel’s visible name is a click target for its switch', async () => {
  answer([{ channel: 'email', enabled: true }])
  render(<Channels />)
  const name = await screen.findByText('Email', { selector: 'label' })
  const target = document.getElementById(name.getAttribute('for')!)
  expect(target).not.toBeNull()
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable Email' })).toBeInTheDocument())
})
