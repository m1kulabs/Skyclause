import type { Principal } from '@skyclause/contracts'
import { deviceCode, member, organization, verification } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { and, asc, eq, gt, or } from 'drizzle-orm'
import { getAuth } from './instance'
import { currentRole, resolvePrincipal } from './principal'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findOrganisation(ref: string) {
  const [row] = await authDatabase()
    .select({ id: organization.id, slug: organization.slug, plan: organization.plan })
    .from(organization)
    .where(UUID.test(ref) ? or(eq(organization.id, ref), eq(organization.slug, ref)) : eq(organization.slug, ref))
    .limit(1)
  return row ?? null
}

export interface DeviceAuthorizationPageData {
  state: 'ready' | 'expired' | 'unknown' | 'done' | 'denied'
  userAgent: string | null
  memberships: Array<{ organization: string; role: string }>
}

function deviceMetadata(value: string) {
  try {
    const data = JSON.parse(value) as { userAgent?: unknown; status?: unknown }
    if (typeof data.userAgent === 'string') {
      return { userAgent: data.userAgent, status: typeof data.status === 'string' ? data.status : undefined }
    }
  } catch {
    // The first record keeps the request's raw user agent until the token is issued.
  }
  return { userAgent: value, status: undefined }
}

/** The account-scoped fields `/device` may show before it claims a pending code through Better Auth. */
export async function deviceAuthorizationPageData(
  userCode: string,
  accountId: string,
  now = new Date()
): Promise<DeviceAuthorizationPageData> {
  const normalized = userCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const database = authDatabase()
  const [record] = normalized
    ? await database.select().from(deviceCode).where(eq(deviceCode.userCode, normalized)).limit(1)
    : []

  let state: DeviceAuthorizationPageData['state'] = 'unknown'
  let userAgent: string | null = null
  if (record) {
    if (record.userId && record.userId !== accountId) return { state, userAgent, memberships: [] }
    const [metadata] = await database
      .select({ value: verification.value })
      .from(verification)
      .where(and(eq(verification.identifier, `device-user-code:${record.userCode}`), gt(verification.expiresAt, now)))
      .limit(1)
    if (metadata) userAgent = deviceMetadata(metadata.value).userAgent

    if (record.expiresAt <= now) state = 'expired'
    else if (record.clientId !== 'skyclause-cli') state = 'unknown'
    else if (record.status === 'denied') state = 'denied'
    else if (record.status === 'approved') state = 'done'
    else if (record.status === 'pending' && (!record.userId || record.userId === accountId)) state = 'ready'
  } else if (normalized) {
    const [metadata] = await database
      .select({ value: verification.value })
      .from(verification)
      .where(and(eq(verification.identifier, `device-user-code:${normalized}`), gt(verification.expiresAt, now)))
      .limit(1)
    if (metadata) {
      const saved = deviceMetadata(metadata.value)
      userAgent = saved.userAgent
      if (saved.status === 'done') state = 'done'
      if (saved.status === 'denied') state = 'denied'
    }
  }

  const memberships =
    state === 'ready' || state === 'done'
      ? await database
          .select({ organization: organization.name, role: member.role })
          .from(member)
          .innerJoin(organization, eq(organization.id, member.organizationId))
          .where(eq(member.userId, accountId))
          .orderBy(asc(organization.name))
      : []
  return { state, userAgent, memberships }
}

/** The URL of the in-process request a page resolves its principal from: never the request's own host. */
export const IN_PROCESS_URL = 'https://in-process.invalid/'

/**
 * For a server component: the request's principal (as on `/api`, from its cookies) and the URL's organisation by slug
 * or ID, null when none exists. A member's session gets that organisation's `orgId` and `role`, as `requireOrg` fills
 * them for a route; anyone else's session keeps none. Other principals keep their own organisation.
 */
export async function pagePrincipal(
  headers: Headers,
  o: { org?: string } = {}
): Promise<{ principal: Principal | null; org: { id: string; slug: string; plan: string } | null }> {
  // The principal is read from the headers alone; a fixed URL means a malformed forwarded host can't break the request.
  const principal = await resolvePrincipal(new Request(IN_PROCESS_URL, { headers }), { surface: 'api' })
  const org = o.org ? await findOrganisation(o.org) : null
  if (principal?.kind !== 'session' || !org) return { principal, org }
  const role = await currentRole(principal.accountId, org.id)
  return { principal: role ? { ...principal, orgId: org.id, role } : principal, org }
}

/** Email for the signed-in account's data-rights confirmation, kept out of Principal and other domain contexts. */
export async function pageAccountEmail(headers: Headers): Promise<string | null> {
  if (!headers.has('cookie')) return null
  const found = await getAuth().auth.api.getSession({ headers, query: { disableRefresh: true } })
  return found?.user.email ?? null
}

/**
 * Until when an emailed sign-in link works, for the page it opens, read without consuming it. Better Auth's magic-link
 * plugin keeps the token as `magic-link:<token>` (stored plain), the key the sign-in plugin confirms it by. Null when
 * the link is unknown, already used or past its end. It says nothing about whose link it is.
 */
export async function signInLinkUntil(token: string, now = new Date()): Promise<Date | null> {
  if (!token || token.length > 512) return null
  const [row] = await authDatabase()
    .select({ expiresAt: verification.expiresAt })
    .from(verification)
    .where(and(eq(verification.identifier, `magic-link:${token}`), gt(verification.expiresAt, now)))
    .limit(1)
  return row?.expiresAt ?? null
}
