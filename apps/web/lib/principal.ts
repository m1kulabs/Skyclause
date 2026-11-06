import { resolvePrincipal } from '@skyclause/auth'
import type { Principal } from '@skyclause/contracts'
import { headers } from 'next/headers'

export const TEST_PRINCIPAL_COOKIE = 'skyclause_test_principal'

export function principalFromTestCookie(
  value: string | undefined,
  appEnv = process.env.APP_ENV
): Principal | undefined {
  if (appEnv !== 'test' || !value) return undefined

  try {
    const principal = JSON.parse(decodeURIComponent(value)) as Principal
    if (principal.kind === 'session' && typeof principal.authenticatedAt === 'string') {
      return { ...principal, authenticatedAt: new Date(principal.authenticatedAt) }
    }
    return principal
  } catch {
    return undefined
  }
}

function cookieValue(cookieHeader: string | null, name: string): string | undefined {
  const cookie = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return cookie?.slice(name.length + 1)
}

/** Resolve the request principal, accepting the Playwright principal only in the test runtime. */
export async function getPrincipal(): Promise<Principal | null> {
  const requestHeaders = new Headers(await headers())

  if (process.env.APP_ENV === 'test') {
    const principal = principalFromTestCookie(cookieValue(requestHeaders.get('cookie'), TEST_PRINCIPAL_COOKIE), 'test')
    if (principal) return principal
  }

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const scheme = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const request = new Request(`${scheme}://${host}/`, { headers: requestHeaders })
  return resolvePrincipal(request, { surface: 'api' })
}
