import type { Principal } from '@skyclause/contracts'
import { expect, test, vi } from 'vitest'
import { completeOAuthConsent, getOAuthConsentDetails } from '@skyclause/auth'
import { getPrincipal } from '../../lib/principal'
import OAuthConsentPage from '../../app/(auth)/oauth/consent/page'

vi.mock('@skyclause/auth', () => ({
  completeOAuthConsent: vi.fn(),
  getOAuthConsentDetails: vi.fn()
}))
vi.mock('../../lib/principal', () => ({ getPrincipal: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`)
  },
  notFound: () => {
    throw new Error('not-found')
  }
}))

const guest: Principal = {
  kind: 'session',
  via: 'cookie',
  client: 'app',
  clientName: null,
  accountId: 'guest-account',
  sessionId: 'guest-session',
  isGuest: true,
  staff: false,
  orgId: null,
  role: null,
  authenticatedAt: new Date('2026-11-10T00:00:00Z')
}

test('the consent route sends a guest to sign-up before reading a request or issuing a code', async () => {
  vi.mocked(getPrincipal).mockResolvedValue(guest)

  await expect(
    OAuthConsentPage({
      searchParams: Promise.resolve({
        response_type: 'code',
        client_id: 'skyclause-playground',
        code: 'must-not-be-read'
      })
    })
  ).rejects.toThrow('redirect:/sign-up')
  expect(getOAuthConsentDetails).not.toHaveBeenCalled()
  expect(completeOAuthConsent).not.toHaveBeenCalled()
})
