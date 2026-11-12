import { cookies } from 'next/headers'
import { signInMethods, type SignInMethods } from '@skyclause/auth'

export type { SignInMethods }

/** APP_ENV=test only: the methods this cookie lists (`email`, `google`, comma-separated) are switched off. */
export const TEST_METHODS_OFF_COOKIE = 'skyclause-test-sign-in-off'

/**
 * The ways in the page offers: only those the server can serve. The e2e server stands in for production, which has
 * both, so under APP_ENV=test both are on unless the test cookie switches one off.
 */
export async function offeredMethods(): Promise<SignInMethods> {
  if (process.env.APP_ENV !== 'test') return signInMethods()
  const off = new Set(((await cookies()).get(TEST_METHODS_OFF_COOKIE)?.value ?? '').split(','))
  return { email: !off.has('email'), google: !off.has('google') }
}
