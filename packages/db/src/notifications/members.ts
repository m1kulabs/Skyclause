import { ROLES, type Role } from '@skyclause/contracts'
import { asc, eq } from 'drizzle-orm'
import type { Tx } from '../client'
import { member, project } from '../schema'

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

/** The transaction's organisation's project IDs, for the stream's hub filter. */
export async function orgProjectIds(tx: Tx): Promise<string[]> {
  return (await tx.select({ id: project.id }).from(project)).map(({ id }) => id)
}
