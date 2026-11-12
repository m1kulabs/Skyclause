import { afterEach, expect, test, vi } from 'vitest'
import { signInMethods } from '../src/sign-in-methods'
import { SIGN_IN_LINK_EXPIRY_S } from '../src/sign-in-link'

afterEach(() => vi.unstubAllEnvs())

test('Google is offered only with its OAuth client set, as the provider is built', () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', undefined)
  vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined)
  expect(signInMethods().google).toBe(false)
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com')
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret')
  expect(signInMethods().google).toBe(true)
})

test('the email link is offered only while mail is on', () => {
  for (const name of ['RESEND_SENDING_API_KEY', 'EMAIL_FROM_AUTH', 'EMAIL_FROM_NOTICES']) vi.stubEnv(name, undefined)
  expect(signInMethods().email).toBe(false)
})

test('a sign-in link works for fifteen minutes', () => {
  expect(SIGN_IN_LINK_EXPIRY_S).toBe(15 * 60)
})
