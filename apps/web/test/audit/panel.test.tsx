// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AuditPanel } from '../../features/audit/panel'

const entryId = '018f47a3-b2c1-7c00-8000-000000000193'
const targetId = '018f47a3-b2c1-7c00-8000-000000000555'
const actorId = '018f47a3-b2c1-7c00-8000-000000000777'
const projectId = '018f47a3-b2c1-7c00-8000-000000000999'

const entry = {
  id: entryId,
  project_id: projectId,
  actor_type: 'account',
  actor_id: actorId,
  actor_name: 'Aisha Rahman',
  actor_role: 'admin',
  client: 'app',
  client_name: null,
  action: 'member.reads_malay_changed',
  target_type: 'member',
  target_id: targetId,
  before: null,
  after: null,
  created_at: '2026-11-10T02:00:00Z'
}

const project = {
  id: projectId,
  org_id: '019b7f4a-1e00-7000-8000-000000000001',
  name: 'Bukit Jalil',
  slug: 'bukit-jalil',
  time_zone: 'Asia/Kuala_Lumpur',
  public: false,
  semester_ends_on: null,
  site_name: 'APU',
  site_lat: 3.0559,
  site_lon: 101.6997,
  archived_at: null,
  camera_day_start: null,
  camera_day_end: null,
  warning_area_terms: [],
  packs: [
    { pack: 'sky', enabled: true, sheet_id: '019b7f4a-1e00-7000-8000-000000000401', schedule: null, sla_s: 600 },
    { pack: 'crowd', enabled: false, sheet_id: '019b7f4a-1e00-7000-8000-000000000402', schedule: null, sla_s: 7200 }
  ]
}

const member = (id: string, accountId: string, name: string) => ({
  id,
  org_id: 'org-a',
  account_id: accountId,
  role: 'admin',
  reads_malay: false,
  name,
  email: `${name.split(' ')[0]!.toLowerCase()}@example.test`,
  last_active_at: null,
  sign_in_methods: ['email']
})

function mockApi(entries: unknown[] = [entry]) {
  const requests: URL[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin)
      requests.push(url)
      if (url.pathname.endsWith('/audit')) return Response.json({ data: entries, next_cursor: null })
      if (url.pathname.endsWith('/members')) {
        return Response.json({
          data: [member('member-aisha', actorId, 'Aisha Rahman'), member(targetId, 'account-lee', 'Lee Wei')],
          next_cursor: null
        })
      }
      if (url.pathname.endsWith('/projects')) {
        return Response.json({ data: [project], next_cursor: null })
      }
      return new Response(null, { status: 204 })
    })
  )
  return requests
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

test('a record reads in words: the action as a sentence, the actor and the object by name, no raw identifier', async () => {
  mockApi()
  render(<AuditPanel org="org-a" locale="en" />)

  const row = await waitFor(() => {
    const found = document.querySelector('[data-audit-row]')
    expect(found).not.toBeNull()
    return found as HTMLElement
  })
  expect(within(row).getByText('Changed whether a member reads Malay')).toBeDefined()
  expect(within(row).getByText('Aisha Rahman · Admin')).toBeDefined()
  await waitFor(() => expect(within(row).getByText('Member: Lee Wei')).toBeDefined())
  await waitFor(() => expect(within(row).getByText('Bukit Jalil')).toBeDefined())
  expect(row.textContent).not.toContain('member.reads_malay_changed')
  expect(row.textContent).not.toContain(targetId)
  expect(row.textContent).not.toContain(actorId)
  expect(row.querySelector('time')?.getAttribute('datetime')).toBe(entry.created_at)
})

test('a person and an action are chosen from lists, not typed as identifiers', async () => {
  const requests = mockApi()
  render(<AuditPanel org="org-a" locale="en" />)

  const person = await screen.findByLabelText('Person')
  expect(person.tagName).toBe('SELECT')
  await waitFor(() => expect((person as HTMLSelectElement).disabled).toBe(false))
  expect(within(person).getByRole('option', { name: 'Lee Wei' })).toBeDefined()
  const action = screen.getByLabelText('Action', { exact: true })
  expect(within(action).getByRole('option', { name: 'Changed whether a member reads Malay' })).toBeDefined()
  expect(screen.queryByLabelText('Actor ID')).toBeNull()
  expect(screen.queryByLabelText('Target ID')).toBeNull()
  expect(screen.queryByLabelText('Project ID')).toBeNull()

  fireEvent.change(person, { target: { value: 'account-lee' } })
  expect(window.location.search).toContain('actor_id=account-lee')
  await waitFor(() => expect(requests.some((url) => url.searchParams.get('actor_id') === 'account-lee')).toBe(true))
})

test('the filters rest before the log is read again', async () => {
  const requests = mockApi()
  render(<AuditPanel org="org-a" locale="en" />)
  const from = await screen.findByLabelText('From')
  await waitFor(() => expect(requests.filter((url) => url.pathname.endsWith('/audit'))).toHaveLength(1))

  fireEvent.change(from, { target: { value: '2026-11-01' } })
  fireEvent.change(from, { target: { value: '2026-11-02' } })
  expect(requests.filter((url) => url.pathname.endsWith('/audit'))).toHaveLength(1)
  await waitFor(() => expect(requests.filter((url) => url.pathname.endsWith('/audit'))).toHaveLength(2))
  expect(
    requests
      .filter((url) => url.pathname.endsWith('/audit'))
      .at(-1)
      ?.searchParams.get('from')
  ).toBe('2026-11-02T00:00:00+08:00')
})

test('an identifier is only behind a copy control, named for its row', async () => {
  mockApi()
  const writeText = vi.fn(async () => undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  render(<AuditPanel org="org-a" locale="en" />)
  await waitFor(() => expect(document.querySelector('[data-audit-row]')).not.toBeNull())

  const menu = screen.getByRole('button', { name: /^More actions for Changed whether a member reads Malay/ })
  fireEvent.pointerDown(menu, { pointerType: 'mouse' })
  fireEvent.click(menu)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy object ID …00000555' }))

  await waitFor(() => expect(writeText).toHaveBeenCalledWith(targetId))
  await waitFor(() => expect(screen.getByText('ID copied.')).toBeDefined())
})

test('a failed read of the log is named with its source and offers to try again', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ title: 'Server error' }), { status: 503 }))
  )
  render(<AuditPanel org="org-a" locale="en" />)
  expect(await screen.findAllByText(/the audit log/i)).not.toHaveLength(0)
  expect((await screen.findAllByRole('button', { name: /try again/i })).length).toBeGreaterThan(0)
})

test('the log is written in Malay on request', async () => {
  mockApi()
  render(<AuditPanel org="org-a" locale="ms" />)
  await waitFor(() => expect(document.querySelector('[data-audit-row]')).not.toBeNull())
  expect(
    screen.getByText('Menukar sama ada seorang ahli membaca bahasa Melayu', { selector: 'td, td *' })
  ).toBeDefined()
  expect(screen.getByText(/Aisha Rahman · Pentadbir/)).toBeDefined()
})
