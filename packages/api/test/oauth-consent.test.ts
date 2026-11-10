import { expect, test, vi } from 'vitest'
import { createOAuthConsentHandler } from '../src/routes/oauth/consent'
import { asOAuth, asSession, TEST_APP_ORIGIN } from './harness'

function consentRequest(origin = TEST_APP_ORIGIN) {
  return new Request(`${TEST_APP_ORIGIN}/api/auth/oauth/consent`, {
    method: 'POST',
    headers: { Origin: origin },
    body: new URLSearchParams([
      ['oauth_query', 'signed-request'],
      ['org_id', '019a5bc8-3578-7000-8000-000000000001'],
      ['project_ids', '019a5bc8-3578-7000-8000-000000000002'],
      ['scopes', 'read'],
      ['accept', 'true']
    ])
  })
}

test('the consent Hono route forwards selected projects and redirects after the shared service completes', async () => {
  const completeConsent = vi.fn().mockResolvedValue({ url: 'https://client.example/callback?code=issued' })
  const handle = createOAuthConsentHandler({
    resolvePrincipal: vi.fn().mockResolvedValue(asSession({ org: 'consent-route', role: 'editor' })),
    appOrigin: () => TEST_APP_ORIGIN,
    completeConsent
  })
  const response = await handle(consentRequest())
  expect(response.status).toBe(303)
  expect(response.headers.get('Location')).toBe('https://client.example/callback?code=issued')
  expect(completeConsent).toHaveBeenCalledWith({
    headers: expect.any(Headers),
    oauthQuery: 'signed-request',
    orgId: '019a5bc8-3578-7000-8000-000000000001',
    projectIds: ['019a5bc8-3578-7000-8000-000000000002'],
    scopes: ['read'],
    accept: true
  })
})

test('consent refuses cross-origin cookie writes before invoking the service', async () => {
  const completeConsent = vi.fn()
  const handle = createOAuthConsentHandler({
    resolvePrincipal: vi.fn().mockResolvedValue(asSession({ org: 'consent-route', role: 'editor' })),
    appOrigin: () => TEST_APP_ORIGIN,
    completeConsent
  })
  expect((await handle(consentRequest('https://attacker.example'))).status).toBe(403)
  expect(completeConsent).not.toHaveBeenCalled()
})

test.each([
  [null, 303, '/sign-in'],
  [asSession({ org: 'consent-route', role: 'guest', guest: true }), 303, '/sign-up'],
  [asOAuth({ org: 'consent-route', role: 'editor' }), 403, null]
])('consent checks the session before processing the form (%#)', async (principal, status, destination) => {
  const completeConsent = vi.fn()
  const handle = createOAuthConsentHandler({
    resolvePrincipal: vi.fn().mockResolvedValue(principal),
    appOrigin: () => TEST_APP_ORIGIN,
    completeConsent
  })
  const response = await handle(consentRequest())
  expect(response.status).toBe(status)
  expect(response.headers.get('Location')).toBe(destination)
  expect(completeConsent).not.toHaveBeenCalled()
})
