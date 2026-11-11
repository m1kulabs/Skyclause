// The crawl visits every route as each role (#116): signed out, and signed in as each of the others (#94).
import type { Page } from '@playwright/test'
import type { Role as MemberRole } from '@skyclause/contracts'
import { makeOrg, openShareLink, signInAs, type TestOrg } from '../harness/sign-in-as'

export const ROLES = [
  'Owner',
  'Admin',
  'Approver',
  'Editor',
  'Viewer',
  'guest',
  'share-link reviewer',
  'signed out'
] as const
export type Role = (typeof ROLES)[number]

/** A real session (#94) for a new account holding `role` in a new organisation. */
const member = (role: MemberRole) => async (page: Page) => {
  const org = await makeOrg()
  await signInAs(page, role, org)
  return org
}

/** Each role's sign-in: a real session, or a share link's `sc_share` cookie for the reviewer. */
const SIGN_IN: Record<Exclude<Role, 'signed out'>, (page: Page) => Promise<TestOrg>> = {
  Owner: member('owner'),
  Admin: member('admin'),
  Approver: member('approver'),
  Editor: member('editor'),
  Viewer: member('viewer'),
  guest: member('guest'),
  'share-link reviewer': async (page) => {
    const org = await makeOrg()
    await openShareLink(page, org)
    return org
  }
}

export interface Session {
  role: Role
  signIn?: (page: Page) => Promise<TestOrg>
}

export function sessions(): Session[] {
  return ROLES.map((role) => (role === 'signed out' ? { role } : { role, signIn: SIGN_IN[role] }))
}

/** Explicitly signed out through #95's test-only seam: no credential reaches the resolver. */
export async function signedOut(page: Page) {
  const url = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
  await page
    .context()
    .addCookies([{ name: 'skyclause_test_principal', value: 'null', url, httpOnly: true, sameSite: 'Lax' }])
}
