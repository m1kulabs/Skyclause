// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { getOAuthConsentDetails } from '@skyclause/auth'
import type { Principal } from '@skyclause/contracts'
import '../../features/oauth/catalogue'
import { OAuthConsentForm } from '../../features/oauth/consent-form'
import { oauthConsentRedirect } from '../../features/oauth/guard'
import IntegrationsPanel from '../../features/settings/organisation/integrations/panel'

type Details = Awaited<ReturnType<typeof getOAuthConsentDetails>>

const details: Details = {
  clientId: 'public-test-client',
  clientName: 'Claude Desktop',
  redirectHost: 'claude.example',
  redirectUri: 'https://claude.example/callback',
  resource: 'mcp',
  requestedScopes: ['read', 'draft'],
  lockedOrgId: null,
  organisations: [
    {
      id: 'org-1',
      name: 'Bukit Jalil',
      slug: 'bukit-jalil',
      role: 'editor',
      availableScopes: ['read', 'draft'],
      projects: [{ id: 'project-1', name: 'Community centre' }]
    }
  ],
  link: null
}

async function expectNoSeriousAxeIssues() {
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } }
  } as Parameters<typeof axe.run>[1])
  expect(
    result.violations
      .filter((item) => item.impact === 'serious' || item.impact === 'critical')
      .map((item) => `${item.id}: ${item.help}`)
  ).toEqual([])
}

const session: Principal = {
  kind: 'session',
  via: 'cookie',
  client: 'app',
  clientName: null,
  accountId: 'account-1',
  sessionId: 'session-1',
  isGuest: false,
  staff: false,
  orgId: 'org-1',
  role: 'editor',
  authenticatedAt: new Date('2026-11-10T00:00:00Z')
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('guests go to sign-up before consent and only member sessions can continue', () => {
  expect(oauthConsentRedirect({ ...session, isGuest: true })).toBe('/sign-up')
  expect(oauthConsentRedirect(null)).toBe('/sign-in')
  expect(oauthConsentRedirect(session)).toBeNull()
})

test('consent identifies the request and exposes equal, keyboard-focusable native controls', async () => {
  render(<OAuthConsentForm details={details} oauthQuery="client_id=public-test-client" locale="en" />)
  expect(screen.getByText('Claude Desktop')).toBeTruthy()
  expect(screen.getByText('claude.example')).toBeTruthy()
  expect(screen.getByText('Bukit Jalil')).toBeTruthy()
  expect(screen.getByText('Community centre')).toBeTruthy()
  expect(screen.getByText('Read project information')).toBeTruthy()
  expect(screen.getByText('Create drafts')).toBeTruthy()
  expect(screen.getByText('No AI can approve a bundle or send to people')).toBeTruthy()
  const deny = screen.getByRole('button', { name: 'Deny' })
  const allow = screen.getByRole('button', { name: 'Allow' })
  expect(deny.className).toBe(allow.className)
  expect([deny, allow].every((button) => button.getAttribute('type') === 'submit')).toBe(true)
  const controls = [
    screen.getByRole('combobox', { name: 'Organisation' }),
    ...screen.getAllByRole('checkbox'),
    deny,
    allow
  ]
  expect(controls.every((control) => control.tabIndex === 0)).toBe(true)
  await expectNoSeriousAxeIssues()
})

test('the integrations table names the client in its confirmation dialog', async () => {
  const client = {
    id: 'client-row',
    client_id: 'client-1',
    client_name: 'Gemini tenant 42',
    redirect_uris: ['https://vertexaisearch.cloud.google.com/oauth-redirect'],
    scopes: ['read'],
    created_at: '2026-11-10T00:00:00.000Z'
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const data = String(input).includes('oauth-clients') ? [client] : []
      return new Response(JSON.stringify({ data, next_cursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    })
  )
  render(<IntegrationsPanel org="org-1" locale="en" />)
  await screen.findByText('Gemini tenant 42')
  await expectNoSeriousAxeIssues()
  fireEvent.click(screen.getByRole('button', { name: 'Delete OAuth client' }))
  expect(screen.getByRole('alertdialog').textContent).toContain('Gemini tenant 42')
  await expectNoSeriousAxeIssues()
})
