// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/account/appearance/panel'

const stored = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  shortcuts: true
}

function mockApi() {
  const patches: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname === '/api/me/preferences' && init?.method === 'PATCH') {
        const update = JSON.parse(String(init.body))
        patches.push(update)
        return Response.json({ ...stored, ...update })
      }
      if (url.pathname === '/api/me/preferences') return Response.json(stored)
      return new Response(null, { status: 404 })
    })
  )
  return patches
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('offers Dusk, Day and System, each previewed as real markup in that theme', async () => {
  mockApi()
  const { container } = render(<Panel />)
  const names = screen.getAllByRole('radio', { name: /^(Dusk|Day|System)/ }).map((radio) => radio.getAttribute('value'))
  expect(names).toEqual(['dark', 'light', 'system'])
  // Previews are drawn in the theme they offer (the role tokens come from the theme class), and are not pictures.
  expect(container.querySelectorAll('.dark, .light').length).toBeGreaterThanOrEqual(4)
  expect(container.querySelector('img, canvas')).toBeNull()
  expect(container.querySelectorAll('[data-slot="switch"]')).toHaveLength(1)
  expect(await screen.findByRole('radio', { name: /^Dusk/ })).toHaveProperty('checked', true)
})

test('has no switch for collapsing the sidebar: the sidebar is gone', () => {
  mockApi()
  render(<Panel />)
  expect(screen.queryByText(/collapse sidebar/i)).toBeNull()
  expect(screen.queryByRole('switch', { name: /sidebar/i })).toBeNull()
})

test('a choice saves at once and says so', async () => {
  const patches = mockApi()
  render(<Panel />)
  fireEvent.click(screen.getByRole('radio', { name: /^Day/ }))
  await waitFor(() => expect(patches).toEqual([{ theme: 'light' }]))
  expect(await screen.findByText('Saved.')).toBeDefined()
  fireEvent.click(screen.getByRole('radio', { name: /^More contrast/ }))
  await waitFor(() => expect(patches).toContainEqual({ high_contrast: true }))
  fireEvent.click(screen.getByRole('radio', { name: /^Compact/ }))
  await waitFor(() => expect(patches).toContainEqual({ density: 'compact' }))
})
