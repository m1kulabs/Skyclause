import type { Principal } from '@skyclause/contracts'
import { organization } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { eq, or } from 'drizzle-orm'
import { currentRole, resolvePrincipal } from './principal'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function findOrganisation(ref: string) {
  const [row] = await authDatabase()
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(UUID.test(ref) ? or(eq(organization.id, ref), eq(organization.slug, ref)) : eq(organization.slug, ref))
    .limit(1)
  return row ?? null
}

/**
 * For a server component: the request's principal (as on `/api`, from its cookies) and the URL's organisation by slug
 * or ID, null when none exists. A member's session gets that organisation's `orgId` and `role`, as `requireOrg` fills
 * them for a route; anyone else's session keeps none. Other principals keep their own organisation.
 */
export async function pagePrincipal(
  headers: Headers,
  o: { org?: string } = {}
): Promise<{ principal: Principal | null; org: { id: string; slug: string } | null }> {
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost'
  const scheme = headers.get('x-forwarded-proto') ?? 'https'
  const principal = await resolvePrincipal(new Request(`${scheme}://${host}/`, { headers }), { surface: 'api' })
  const org = o.org ? await findOrganisation(o.org) : null
  if (principal?.kind !== 'session' || !org) return { principal, org }
  const role = await currentRole(principal.accountId, org.id)
  return { principal: role ? { ...principal, orgId: org.id, role } : principal, org }
}
