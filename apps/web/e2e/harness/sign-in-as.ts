// #79 §7's Playwright `signInAs(role, org)` (#94): a real session, minted in Playwright's own database and carried by
// its signed cookie, which the web server resolves as it resolves any sign-in. Use it where a real session matters
// (the URL's organisation, membership, the API's auth); `asPage` stays for pages whose reads `stubApi` answers.
// Accounts, organisations and sessions made here exist only in that test database (NFR-15).
import type { Page } from '@playwright/test'
import type { Role } from '@skyclause/contracts'
import { addMember, makeAccount, makeOrg, makeShareLinkFor, signIn } from '@skyclause/auth/testing'
import { e2eDatabase } from './env'

export { makeOrg }

export interface TestOrg {
  id: string
  slug: string
}

function requireDatabase() {
  // E2E_BASE_URL runs the @smoke tests against production, whose database no test may write to.
  if (!e2eDatabase()) throw new Error('signInAs needs Playwright’s own web server and database; E2E_BASE_URL has none')
}

/**
 * Signs `page` in as a new account holding `role` in `org` (a guest is an anonymous account) and returns the account.
 * The session cookie is host-only on APP_ORIGIN, the web server's own origin.
 */
export async function signInAs(page: Page, role: Role, org: TestOrg): Promise<{ accountId: string; email: string }> {
  requireDatabase()
  const account = await makeAccount({ anonymous: role === 'guest' })
  await addMember(org.id, account.id, role)
  const { cookies } = await signIn(account.id)
  await page.context().addCookies(cookies)
  return { accountId: account.id, email: account.email }
}

/** Opens a share link to a project in `org` on `page`: its `sc_share` cookie carries the link's token (#140). */
export async function openShareLink(
  page: Page,
  org: TestOrg,
  access: 'view' | 'reviewer' = 'reviewer',
  /** The project the link opens; a new one if unset. */
  projectId?: string
): Promise<{ linkId: string; projectId: string }> {
  requireDatabase()
  const link = await makeShareLinkFor({ orgId: org.id, access, projectId })
  const url = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
  await page.context().addCookies([{ name: 'sc_share', value: link.token, url, httpOnly: true, sameSite: 'Lax' }])
  return { linkId: link.id, projectId: link.projectId }
}
