import { ROLES, type Role } from '@skyclause/contracts'
import { asc, eq } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { member, organization, project } from '../schema'

// #156: who an item can reach, and where an account's items live. `auth.member` roles outside §1's six (such as
// Better Auth's default `member`) grant nothing, so those rows don't count.

const isRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role)

/** The members of the transaction's organisation, one entry per account (its oldest membership). */
export async function orgMembers(tx: Tx): Promise<Array<{ accountId: string; role: Role }>> {
  if (!tx.orgId) throw new Error('orgMembers needs a withTenant transaction')
  const rows = await tx
    .select({ accountId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, tx.orgId))
    .orderBy(asc(member.createdAt))
  const members = new Map<string, Role>()
  for (const { accountId, role } of rows) if (isRole(role) && !members.has(accountId)) members.set(accountId, role)
  return [...members].map(([accountId, role]) => ({ accountId, role }))
}

/** The organisations `accountId` is a member of, with its role in each, read across organisations. */
export async function accountMemberships(
  tx: Tx<SystemPrincipal>,
  accountId: string
): Promise<Array<{ orgId: string; slug: string; role: Role }>> {
  const rows = await tx
    .select({ orgId: organization.id, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, accountId))
    .orderBy(asc(member.createdAt))
  const orgs = new Map<string, { orgId: string; slug: string; role: Role }>()
  for (const row of rows) if (isRole(row.role) && !orgs.has(row.orgId)) orgs.set(row.orgId, { ...row, role: row.role })
  return [...orgs.values()]
}

/** The transaction's organisation's project IDs, for the stream's hub filter. */
export async function orgProjectIds(tx: Tx): Promise<string[]> {
  return (await tx.select({ id: project.id }).from(project)).map(({ id }) => id)
}
