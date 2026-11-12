// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Panel from '../../features/settings/organisation/integrations/panel'

type Row = Record<string, unknown>
const client = (index: number): Row => ({
  id: `client-${index}`,
  client_id: `cid-${index}`,
  client_name: `Client ${index}`,
  redirect_uris: [],
  scopes: ['read', 'draft'],
  created_at: '2026-11-05T01:00:00Z'
})
const grant = (project_ids: string[] | 'all'): Row => ({
  id: 'grant-1',
  client_id: 'cid-1',
  org_id: 'org-a',
  resource: 'api',
  project_ids,
  scopes: ['read', 'draft'],
  share_link_id: null,
  revoked_at: null,
  account_id: 'account-1',
  client_name: 'Client 1',
  created_at: '2026-11-05T01:00:00Z'
})

let clients: Row[] = []
let grants: Row[] = []
const requests: string[] = []

beforeEach(() => {
  clients = []
  grants = []
  requests.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      const method = (init?.method ?? 'GET').toUpperCase()
      requests.push(`${method} ${url.pathname}${url.search}`)
      const rows = url.pathname.endsWith('oauth-clients') ? clients : grants
      if (method === 'GET') {
        const cursor = url.searchParams.get('cursor')
        const start = cursor ? Number(cursor) : 0
        const next = start + 100 < rows.length ? String(start + 100) : null
        return Response.json({ data: rows.slice(start, start + 100), next_cursor: next })
      }
      if (method === 'DELETE') {
        grants = grants.filter((row) => !url.pathname.endsWith(String(row.id)))
        return new Response(null, { status: 204 })
      }
      return Response.json(
        {
          ...client(9),
          client_secret: 'secret-value',
          redirect_uri: 'https://r.example.test/cb',
          authorization_url: 'https://a.example.test',
          token_url: 'https://t.example.test'
        },
        { status: 201 }
      )
    })
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('every page the API has is read, and the list shows 50 rows at a time', async () => {
  clients = Array.from({ length: 130 }, (_, index) => client(index))
  render(<Panel org="org-a" />)
  await screen.findByText('Client 0')
  expect(requests.filter((request) => request.includes('oauth-clients'))).toEqual([
    'GET /api/orgs/org-a/oauth-clients?limit=100',
    'GET /api/orgs/org-a/oauth-clients?limit=100&cursor=100'
  ])
  expect(screen.getAllByRole('button', { name: /^Delete OAuth client:/ })).toHaveLength(50)
  expect(screen.getByText('1–50 of 130')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('Client 50')).toBeDefined()
})

test('access is a list in words and a single project is not "1 projects"', async () => {
  clients = [client(1)]
  grants = [grant(['project-1'])]
  render(<Panel org="org-a" />)
  expect(await screen.findByText('1 project')).toBeDefined()
  expect(screen.getAllByText('Read and Draft').length).toBeGreaterThan(0)
})

test('creating a client with no name says what to enter, focuses the field and sends nothing', async () => {
  render(<Panel org="org-a" />)
  const name = (await screen.findByLabelText('Client name')) as HTMLInputElement
  expect(name.placeholder).toBe('Gemini Enterprise…')
  fireEvent.submit(name.closest('form')!)
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a client name.')
  expect(document.activeElement).toBe(name)
  expect(requests.some((request) => request.startsWith('POST'))).toBe(false)
})

test('a client secret that cannot be copied says so and tells the user what to do', async () => {
  render(<Panel org="org-a" />)
  const name = (await screen.findByLabelText('Client name')) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Gemini' } })
  fireEvent.submit(name.closest('form')!)
  fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))
  expect(await screen.findByText('Could not copy. Select the secret and copy it with your keyboard.')).toBeDefined()
})

test('revoking a grant puts focus on the grants heading, where the button was', async () => {
  clients = [client(1)]
  grants = [grant('all')]
  render(<Panel org="org-a" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke: Client 1' }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: /^Revoke “Client 1”/ }))
  await waitFor(() => expect(requests).toContain('DELETE /api/orgs/org-a/oauth-grants/grant-1'))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Connected grants' })))
})
