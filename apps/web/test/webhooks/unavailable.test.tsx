// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Principal, Role } from '@skyclause/contracts'
import { WebhookFeature } from '../../features/webhooks'
import { ApiProblem } from '../../lib/api-fetch'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/campus/settings/webhooks',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}))

let listAnswer: () => Promise<unknown> = async () => ({ data: [], next_cursor: null })
const apiFetchMock = vi.hoisted(() => vi.fn())
vi.mock('../../features/webhooks/operations', async (original) => {
  const actual = await original<typeof import('../../features/webhooks/operations')>()
  return { ...actual, apiFetch: apiFetchMock }
})
apiFetchMock.mockImplementation(async (operationId: string) => {
  if (operationId === 'listWebhooks') return listAnswer()
  if (operationId === 'listProjects') return { data: [], next_cursor: null }
  throw new Error(`unexpected operation ${operationId}`)
})

/** A real session as a page under `/{org}` resolves it: the organisation's ID and the member's role filled in. */
function session(role: Role | null, orgId: string | null): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'account-1',
    sessionId: 'session-1',
    authenticatedAt: new Date('2026-11-13T01:00:00Z'),
    orgId,
    role,
    isGuest: false,
    staff: false
  }
}
const orgId = '019a55b0-0000-7000-8000-000000000002'

afterEach(() => {
  cleanup()
  apiFetchMock.mockClear()
  listAnswer = async () => ({ data: [], next_cursor: null })
})

test('an Owner of the page’s organisation, on a real session, reaches webhooks, not “need an Admin”', async () => {
  listAnswer = async () => {
    throw new ApiProblem(501, { title: 'Not built' })
  }
  render(WebhookFeature({ principal: session('owner', orgId), settings: true }))
  expect(await screen.findByText('Webhooks are not available yet.')).toBeDefined()
  expect(apiFetchMock).toHaveBeenCalledWith('listWebhooks', expect.objectContaining({ org: orgId }))
  expect(document.body.textContent).not.toContain('need an Admin')
  // Not built is not an error: no retry, no "Couldn’t read".
  expect(screen.queryByRole('button')).toBeNull()
  expect(document.body.textContent).not.toMatch(/Couldn’t read|501/)
})

test('a webhook list that really failed still says so and offers Try again', async () => {
  listAnswer = async () => {
    throw new ApiProblem(503, { title: 'Unavailable' })
  }
  render(WebhookFeature({ principal: session('admin', orgId), settings: true }))
  const retry = await screen.findByRole('button', { name: 'Try again' })
  expect(document.body.textContent).toContain('Couldn’t read')
  fireEvent.click(retry)
  await waitFor(() => expect(apiFetchMock.mock.calls.filter(([id]) => id === 'listWebhooks')).toHaveLength(2))
})

test('the inspector, which a real session reaches with no organisation, says webhooks are not available', () => {
  render(WebhookFeature({ principal: session(null, null) }))
  expect(screen.getByText('Webhooks are not available yet.')).toBeDefined()
  expect(document.body.textContent).not.toContain('need an Admin')
  expect(apiFetchMock).not.toHaveBeenCalled()
})

test('a Viewer of the organisation is still told webhooks need an Admin, and nothing is read', () => {
  render(WebhookFeature({ principal: session('viewer', orgId), settings: true }))
  expect(screen.getByText('Webhooks need an Admin of your organisation')).toBeDefined()
  expect(apiFetchMock).not.toHaveBeenCalled()
})
