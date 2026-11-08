import { and, eq, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { member, organization } from '../schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #93's `MembershipLookup`: the organisation named by slug or ID, and `accountId`'s `auth.member` role in it (null
 * when the account isn't a member, or when no account is asked about), in one query.
 */
export async function findMembership(
  tx: Tx<SystemPrincipal>,
  ref: string,
  accountId: string | null
): Promise<{ id: string; slug: string; role: string | null } | null> {
  const joined =
    accountId && UUID.test(accountId)
      ? and(eq(member.organizationId, organization.id), eq(member.userId, accountId))
      : sql`false`
  const [row] = await tx
    .select({ id: organization.id, slug: organization.slug, role: member.role })
    .from(organization)
    .leftJoin(member, joined)
    .where(UUID.test(ref) ? eq(organization.id, ref) : eq(organization.slug, ref))
    .limit(1)
  return row ?? null
}
