// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import '../../features/members/i18n'
import { InvitePanel } from '../../features/members/invite-panel'

function mockToken(state: string, kind = 'invitation', extras: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin)
      if (url.pathname === '/api/invite/example-token' && init?.method !== 'POST') {
        return Response.json({ kind, state, ...extras })
      }
      if (url.pathname === '/api/invite/example-token' && init?.method === 'POST') {
        return new Response(JSON.stringify({ type: 'wrong-email', masked_email: 'a***@example.test' }), {
          status: 403,
          headers: { 'Content-Type': 'application/problem+json' }
        })
      }
      return new Response(null, { status: 204 })
    })
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test.each([
  ['withdrawn', 'This invite was withdrawn. Ask an Admin of your organisation for a new invite.'],
  ['expired', 'This invite has expired. Ask an Admin of your organisation for a new one.'],
  ['used', 'This invite has already been used. Ask an Admin of your organisation for a new invite.']
])('invite token state %s is rendered', async (state, expected) => {
  mockToken(state)
  render(<InvitePanel token="example-token" locale="en" signedIn={false} />)

  expect(await screen.findByText(expected)).toBeDefined()
})

test('signed-out invite visitors get sign-in and create-account links back to this token', async () => {
  mockToken('valid', 'invitation', { org_name: 'Kuala Lumpur Co-op', role: 'approver' })
  render(<InvitePanel token="example-token" locale="en" signedIn={false} />)

  expect(await screen.findByRole('heading', { name: 'Invite for Kuala Lumpur Co-op' })).toBeDefined()
  expect(screen.getByText('Role: Approver')).toBeDefined()
  expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
    '/sign-in?next=%2Finvite%2Fexample-token'
  )
  expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
    '/sign-up?next=%2Finvite%2Fexample-token'
  )
})

test('wrong-email acceptance shows only the masked address returned by the API', async () => {
  mockToken('valid', 'invitation', { org_name: 'Kuala Lumpur Co-op', role: 'approver' })
  render(<InvitePanel token="example-token" locale="en" signedIn />)

  fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }))
  expect((await screen.findByRole('alert')).textContent).toContain(
    'This invite is for a***@example.test. Sign in with that address.'
  )
})

test('a Malay reader with no organisation name reads it in Malay, not English', async () => {
  mockToken('expired')
  render(<InvitePanel token="example-token" locale="ms" signedIn={false} />)
  expect(await screen.findByText(/organisasi anda/)).toBeDefined()
  expect(screen.queryByText(/your organisation/)).toBeNull()
})

test('after accepting, focus moves from the vanished button to the sentence that says so', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? Response.json(
            {
              id: 'membership-1',
              org_id: 'org-1',
              account_id: 'account-1',
              role: 'editor',
              reads_malay: false,
              org_name: 'Northstar',
              org_slug: 'northstar'
            },
            { status: 201 }
          )
        : Response.json({
            kind: 'invitation',
            state: 'valid',
            org_name: 'Northstar',
            org_slug: 'northstar',
            role: 'editor'
          })
    )
  )
  render(<InvitePanel token="example-token" locale="en" signedIn />)
  fireEvent.click(await screen.findByRole('button', { name: /accept/i }))
  const result = await screen.findByText(/Northstar/, { selector: 'p[role="status"]' })
  await waitFor(() => expect(document.activeElement).toBe(result))
})
