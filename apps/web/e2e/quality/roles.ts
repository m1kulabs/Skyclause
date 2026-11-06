// The crawl visits every route as each role (#116). A role without a sign-in runs signed out, and the crawl
// says so in its test title and output rather than skipping it.
import type { Page } from '@playwright/test'

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

/** Sign-ins that exist on main. `signInAs(role, org)` lands with #94; until then this is empty. */
const SIGN_IN: Partial<Record<Exclude<Role, 'signed out'>, (page: Page) => Promise<void>>> = {}

export interface Session {
  role: Role
  /** Roles this session stands in for until their sign-in lands. */
  standIns: Role[]
  signIn?: (page: Page) => Promise<void>
}

/** One session per distinct sign-in: signed-out pages aren't visited eight times over. */
export function sessions(): Session[] {
  const missing = ROLES.filter((role) => role !== 'signed out' && !SIGN_IN[role])
  const signedIn = ROLES.flatMap((role) => {
    const signIn = role === 'signed out' ? undefined : SIGN_IN[role]
    return signIn ? [{ role, standIns: [], signIn }] : []
  })
  return [{ role: 'signed out', standIns: missing }, ...signedIn]
}

export const STAND_IN_REASON = 'signInAs waits on #94'

/** Explicitly signed out through #95's test-only seam; never call the unfinished #94 resolver. */
export async function signedOut(page: Page) {
  const url = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  await page
    .context()
    .addCookies([{ name: 'skyclause_test_principal', value: 'null', url, httpOnly: true, sameSite: 'Lax' }])
}
