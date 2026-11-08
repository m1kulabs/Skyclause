import { ROLES, type Role } from '@skyclause/contracts'
import { and, eq, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { member, organization } from '../schema'

const isRole = (role: string | null): role is Role => (ROLES as readonly (string | null)[]).includes(role)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #93's `MembershipLookup`: the organisation named by slug or ID, and `accountId`'s `auth.member` role in it, in one
 * query. The role is null when the account isn't a member, when no account is asked about, or when the row holds a
 * role outside §1's six (such as Better Auth's default `member`), which grants nothing.
 */
export async function findMembership(
  tx: Tx<SystemPrincipal>,
  ref: string,
  accountId: string | null
): Promise<{ id: string; slug: string; role: Role | null } | null> {
  const joined =
    accountId && UUID.test(accountId)
      ? and(eq(member.organizationId, organization.id), eq(member.userId, accountId))
      : sql`false`
  const [row] = await tx
    .select({ id: organization.id, slug: organization.slug, role: member.role })
    .from(organization)
    .leftJoin(member, joined)
    .where(UUID.test(ref) ? eq(organization.id, ref) : eq(organization.slug, ref))
    // auth.member has no unique (organization_id, user_id); the oldest membership answers.
    .orderBy(member.createdAt)
    .limit(1)
  return row ? { id: row.id, slug: row.slug, role: isRole(row.role) ? row.role : null } : null
}
