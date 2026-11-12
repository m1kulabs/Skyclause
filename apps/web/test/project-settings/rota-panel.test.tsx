// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/project/rota/panel'

vi.mock('next/navigation', () => ({ useParams: () => ({ org: 'campus-org', project: 'bukit-jalil' }) }))

const project = { id: 'project-1', name: 'Bukit Jalil campus', time_zone: 'Asia/Kuala_Lumpur' }
const members = [
  {
    id: 'm1',
    org_id: 'o',
    account_id: 'account-aisha',
    role: 'approver',
    reads_malay: false,
    name: 'Aisha Rahman',
    email: 'aisha@example.test'
  },
  {
    id: 'm2',
    org_id: 'o',
    account_id: 'account-ben',
    role: 'admin',
    reads_malay: false,
    name: 'Ben Lim',
    email: 'ben@example.test'
  }
]
const shift = (id: string, accountId: string, projectId: string | null) => ({
  id,
  account_id: accountId,
  project_id: projectId,
  days: [1, 2],
  local_start: '08:00',
  local_end: '17:00',
  condition: null,
  order: 0,
  template: 'custom'
})

let shifts: ReturnType<typeof shift>[] = []
const api = vi.hoisted(() => vi.fn())
vi.mock('../../features/project-settings/operations', async (original) => {
  const actual = await original<typeof import('../../features/project-settings/operations')>()
  return { ...actual, projectSettingsApi: api, resolveProject: async () => project }
})

beforeEach(() => {
  shifts = []
  api.mockImplementation(async (operation: string) => {
    if (operation === 'getRota') return { shifts }
    if (operation === 'listMembers') return { data: members, next_cursor: null }
    if (operation === 'createRotaShift') {
      shifts = [...shifts, shift('new', 'account-aisha', 'project-1')]
      return shifts[shifts.length - 1]
    }
    throw new Error(`unexpected operation ${operation}`)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test('empty lists say so in a sentence, with no n= count', async () => {
  render(
    <>
      <div data-settings-aside />
      <Panel />
    </>
  )
  expect(await screen.findByText('No project shifts yet.')).toBeDefined()
  expect(screen.getByText('No inherited shifts.')).toBeDefined()
  expect(await screen.findAllByText('0 shifts')).toHaveLength(2)
  expect(document.body.textContent).not.toMatch(/n=\d/)
})

test('counts are plain and a shift is named by its person, never by an account ID', async () => {
  shifts = [shift('s1', 'account-aisha', 'project-1'), shift('s2', 'account-gone', null)]
  render(
    <>
      <div data-settings-aside />
      <Panel />
    </>
  )
  expect(await screen.findByRole('button', { name: 'Edit shift for Aisha Rahman' })).toBeDefined()
  expect(await screen.findAllByText('1 shift')).toHaveLength(2)
  expect(screen.getByText('Unknown member')).toBeDefined()
  expect(document.body.textContent).not.toContain('account-gone')
})

test('a shift with problems names each one beside its field and focuses the first', async () => {
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a shift' }))
  const editor = document.querySelector('[data-rota-editor]') as HTMLElement
  // The editor takes focus when it opens.
  await waitFor(() => expect(document.activeElement).toBe(within(editor).getByRole('heading', { name: 'Add a shift' })))
  fireEvent.change(within(editor).getByLabelText('Approver'), { target: { value: '' } })
  fireEvent.submit(editor)
  expect(within(editor).getByText('Choose an approver.')).toBeDefined()
  expect(within(editor).getByText('Choose at least one day.')).toBeDefined()
  expect(within(editor).getByText('Enter a start time.')).toBeDefined()
  expect(within(editor).getByText('Enter an end time.')).toBeDefined()
  expect(document.activeElement).toBe(within(editor).getByLabelText('Approver'))
  expect(within(editor).getByLabelText('Approver').getAttribute('aria-invalid')).toBe('true')
  expect(api).not.toHaveBeenCalledWith('createRotaShift', expect.anything())
})

test('an end that is not after the start explains the fix on the end field', async () => {
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a shift' }))
  const editor = document.querySelector('[data-rota-editor]') as HTMLElement
  fireEvent.click(within(editor).getByLabelText('Monday'))
  fireEvent.change(within(editor).getByLabelText('Start time'), { target: { value: '22:00' } })
  fireEvent.change(within(editor).getByLabelText('End time'), { target: { value: '06:00' } })
  fireEvent.submit(editor)
  const end = within(editor).getByLabelText('End time')
  expect(document.getElementById(end.getAttribute('aria-describedby')!)?.textContent).toBe(
    'The end time must be later than the start time. Split an overnight shift into two shifts.'
  )
  expect(document.activeElement).toBe(end)
})

test('saving keeps the panel in place and puts focus on the list it belongs to', async () => {
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a shift' }))
  const editor = document.querySelector('[data-rota-editor]') as HTMLElement
  fireEvent.click(within(editor).getByLabelText('Monday'))
  fireEvent.change(within(editor).getByLabelText('Start time'), { target: { value: '08:00' } })
  fireEvent.change(within(editor).getByLabelText('End time'), { target: { value: '17:00' } })
  fireEvent.submit(editor)
  await waitFor(() => expect(api).toHaveBeenCalledWith('createRotaShift', expect.anything()))
  expect(await screen.findByRole('button', { name: 'Edit shift for Aisha Rahman' })).toBeDefined()
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Project shifts', level: 3 }))
  )
  expect(screen.queryByRole('status', { name: /Loading/ })).toBeNull()
})

test('opening another shift over an edited one asks before it throws the edits away', async () => {
  shifts = [shift('s1', 'account-aisha', 'project-1')]
  render(<Panel />)
  fireEvent.click(await screen.findByRole('button', { name: 'Add a shift' }))
  const editor = document.querySelector('[data-rota-editor]') as HTMLElement
  fireEvent.change(within(editor).getByLabelText('Start time'), { target: { value: '09:00' } })
  const confirm = vi.fn(() => false)
  vi.stubGlobal('confirm', confirm)
  fireEvent.click(screen.getByRole('button', { name: 'Edit shift for Aisha Rahman' }))
  expect(confirm).toHaveBeenCalledTimes(1)
  // Declined: the editor still holds what was typed.
  expect((within(editor).getByLabelText('Start time') as HTMLInputElement).value).toBe('09:00')
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Edit shift for Aisha Rahman' }))
  await waitFor(() =>
    expect(
      within(document.querySelector('[data-rota-editor]') as HTMLElement).getByRole('heading', { name: 'Edit shift' })
    ).toBeDefined()
  )
})
