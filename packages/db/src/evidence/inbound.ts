import type { TxHandle } from '@skyclause/contracts'
import { and, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { member, organization, project, subscriber, user } from '../schema'

// #159 c-evidence, email intake (D7, LED-3): who `{org}.{project}@…` names and who wrote.

/** The project an inbound address names, read under `withSystem` (all organisations' projects, read-only). */
export async function inboundProject(handle: TxHandle, orgSlug: string, projectSlug: string) {
  const tx = handle as Tx
  const [row] = await tx
    .select({ orgId: project.orgId, projectId: project.id, timeZone: project.timeZone })
    .from(project)
    .innerJoin(organization, eq(organization.id, project.orgId))
    .where(and(eq(organization.slug, orgSlug), eq(project.slug, projectSlug)))
  return row ?? null
}

export type InboundSender = { kind: 'subscriber'; subscriberId: string } | { kind: 'member'; accountId: string }

/**
 * The sender, in the project's organisation: a confirmed, still subscribed subscriber of the project first (the reply goes by email,
 * after approval), else a member's verified account address (the reply stays in-app); addresses compare without case.
 */
export async function inboundSender(
  handle: TxHandle,
  q: { orgId: string; projectId: string; address: string }
): Promise<InboundSender | null> {
  const tx = handle as Tx
  const address = q.address.trim().toLowerCase()
  const [subscribed] = await tx
    .select({ id: subscriber.id })
    .from(subscriber)
    .where(
      and(
        eq(subscriber.projectId, q.projectId),
        isNotNull(subscriber.confirmedAt),
        isNull(subscriber.unsubscribedAt),
        eq(sql`lower(${subscriber.email})`, address)
      )
    )
  if (subscribed) return { kind: 'subscriber', subscriberId: subscribed.id }
  const [account] = await tx
    .select({ id: user.id })
    .from(user)
    .innerJoin(member, eq(member.userId, user.id))
    .where(
      and(
        eq(sql`lower(${user.email})`, address),
        eq(user.emailVerified, true),
        isNull(user.deletedAt),
        eq(member.organizationId, q.orgId),
        ne(member.role, 'guest')
      )
    )
  return account ? { kind: 'member', accountId: account.id } : null
}
