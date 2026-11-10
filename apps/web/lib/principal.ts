import { pageAccountEmail, pagePrincipal, resolvePrincipal } from '@skyclause/auth'
import type { Principal } from '@skyclause/contracts'
import { headers } from 'next/headers'

export const TEST_PRINCIPAL_COOKIE = 'skyclause_test_principal'

export function principalFromTestCookie(
  value: string | undefined,
  appEnv = process.env.APP_ENV
): Principal | null | undefined {
  if (appEnv !== 'test' || !value) return undefined

  try {
    const principal = JSON.parse(decodeURIComponent(value)) as Principal | null
    // An explicit null lets browser tests exercise signed-out gates before real sessions land.
    if (principal === null) return null
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
    if (principal !== undefined) return principal
  }

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost'
  const scheme = requestHeaders.get('x-forwarded-proto') ?? 'http'
  const request = new Request(`${scheme}://${host}/`, { headers: requestHeaders })
  return resolvePrincipal(request, { surface: 'api' })
}

/** Read only the account email used by its typed deletion confirmation; never attach it to Principal. */
export async function getAccountEmail(): Promise<string | null> {
  const requestHeaders = new Headers(await headers())
  if (
    process.env.APP_ENV === 'test' &&
    principalFromTestCookie(cookieValue(requestHeaders.get('cookie'), TEST_PRINCIPAL_COOKIE), 'test') !== undefined
  )
    return null
  return pageAccountEmail(requestHeaders)
}

/**
 * For a page under `/{org}`: the principal, a member's session filled with the URL organisation's `orgId` and `role`
 * (#94's page helper), and that organisation's ID, null when none exists. A Playwright test principal keeps its own
 * `orgId`, and the URL's name stands in for the ID.
 */
export async function getOrgPrincipal(org: string): Promise<{
  principal: Principal | null
  orgId: string | null
  organisation?: { id: string; slug: string; plan: string } | null
}> {
  const requestHeaders = new Headers(await headers())

  if (process.env.APP_ENV === 'test') {
    const principal = principalFromTestCookie(cookieValue(requestHeaders.get('cookie'), TEST_PRINCIPAL_COOKIE), 'test')
    if (principal !== undefined) return { principal, orgId: org, organisation: null }
  }

  const { principal, org: organisation } = await pagePrincipal(requestHeaders, { org })
  return { principal, orgId: organisation?.id ?? null, organisation }
}
