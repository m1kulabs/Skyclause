// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DeclareWindowDialog } from '../../features/windows/declare-window-dialog'
import type { WindowControls } from '../../features/windows/controls'
import { resolveProject, windowsApi, type WindowView } from '../../features/windows/operations'

vi.mock('../../features/windows/operations', async (original) => ({
  ...(await original<typeof import('../../features/windows/operations')>()),
  windowsApi: vi.fn(),
  resolveProject: vi.fn()
}))

let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() })
}))

// An HTTP test double of listWindows' row, never application data.
const declared: WindowView = {
  id: 'window-1',
  project_id: 'project-1',
  title: 'Test lecture',
  kind: 'class',
  starts_at: '2026-11-16T07:30:00Z',
  ends_at: '2026-11-16T08:30:00Z',
  tz: 'Asia/Kuala_Lumpur',
  declared_by: 'test-member',
  guest: false,
  via: 'app',
  expires_at: null,
  series_id: null,
  ics_feed_id: null,
  cancelled_at: null,
  share_link_id: null,
  moderation: 'visible',
  latest_calls: { sky: null, crowd: null }
} as WindowView

const none: WindowControls = { edit: false, cancel: false, importIcs: false, repeat: false }
const all: WindowControls = { edit: true, cancel: true, importIcs: true, repeat: true }

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia
  vi.mocked(resolveProject).mockResolvedValue({ id: 'project-1', slug: 'test-project' } as never)
  vi.mocked(windowsApi).mockImplementation((async (operation: string) => {
    if (operation === 'listWindows') return { data: [declared], next_cursor: null }
    throw new Error(`not reached: ${operation}`)
  }) as never)
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

test('without updateWindow and cancelWindow an existing window opens as its details, with no Save or Cancel window', async () => {
  search = new URLSearchParams('edit=window-1')
  render(<DeclareWindowDialog org="test-org" project="test-project" controls={none} />)
  const dialog = await screen.findByRole('dialog', { name: 'Window details' })
  expect(await within(dialog).findByText('Test lecture')).toBeTruthy()
  expect(within(dialog).getByText('Class')).toBeTruthy()
  expect(within(dialog).queryByRole('textbox')).toBeNull()
  expect(within(dialog).queryByRole('button', { name: 'Save window' })).toBeNull()
  expect(within(dialog).queryByRole('button', { name: 'Cancel window' })).toBeNull()
  // The one thing that works instead: declaring a new window.
  expect(within(dialog).getByRole('button', { name: 'Declare a window' })).toBeTruthy()
})

test('declaring offers neither Repeat nor the ICS import while they cannot work, and still saves one window', async () => {
  search = new URLSearchParams('declare=window&import=ics')
  render(<DeclareWindowDialog org="test-org" project="test-project" controls={none} />)
  const dialog = await screen.findByRole('dialog', { name: 'Declare a window' })
  expect(await within(dialog).findByRole('button', { name: 'Save window' })).toBeTruthy()
  expect(within(dialog).queryByRole('checkbox', { name: 'Repeat weekly' })).toBeNull()
  expect(within(dialog).queryByText('Import an ICS calendar')).toBeNull()
  expect(within(dialog).queryByLabelText('Calendar URL')).toBeNull()
})

test('once their handlers exist, the editor offers Save and Cancel window, and declaring offers Repeat and Import', async () => {
  search = new URLSearchParams('edit=window-1')
  const { unmount } = render(<DeclareWindowDialog org="test-org" project="test-project" controls={all} />)
  const editor = await screen.findByRole('dialog', { name: 'Edit window' })
  expect(await within(editor).findByRole('button', { name: 'Save window' })).toBeTruthy()
  expect(within(editor).getByRole('button', { name: 'Cancel window' })).toBeTruthy()
  unmount()

  search = new URLSearchParams('declare=window')
  render(<DeclareWindowDialog org="test-org" project="test-project" controls={all} />)
  const dialog = await screen.findByRole('dialog', { name: 'Declare a window' })
  expect(await within(dialog).findByRole('checkbox', { name: 'Repeat weekly' })).toBeTruthy()
  expect(within(dialog).getByText('Import an ICS calendar')).toBeTruthy()
})
