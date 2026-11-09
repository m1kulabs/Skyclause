import type { TxHandle } from '@skyclause/contracts'
import { and, eq, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm'
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

/**
 * A local date's span in `timeZone` (Postgres's zone rules), the year defaulting to the latest one that puts the start
 * no later than `notAfter`; null for a day the month lacks.
 */
export async function zonedSpan(
  handle: TxHandle,
  q: {
    timeZone: string
    year: number | null
    month: number
    day: number
    start: readonly [number, number]
    end: readonly [number, number]
    notAfter: Date
  }
): Promise<{ from: Date; to: Date } | null> {
  const tx = handle as Tx
  const at = (y: SQL, [hours, minutes]: readonly [number, number]) =>
    sql`(make_timestamp(${y}, ${q.month}::int, 1, ${hours}::int, ${minutes}::int, 0) + (${q.day}::int - 1) * interval '1 day') AT TIME ZONE ${q.timeZone}`
  const received = sql`${q.notAfter.toISOString()}::timestamptz`
  const { rows } = await tx.execute<{ valid: boolean; from_ms: number; to_ms: number }>(sql`
    WITH named AS (
      SELECT coalesce(${q.year}::int, extract(year FROM ${received} AT TIME ZONE ${q.timeZone})::int) AS y
    ), chosen AS (
      SELECT CASE WHEN ${q.year}::int IS NULL AND ${at(sql`y`, q.start)} > ${received} THEN y - 1 ELSE y END AS y
      FROM named
    )
    SELECT extract(month FROM make_timestamp(y, ${q.month}::int, 1, 0, 0, 0) + (${q.day}::int - 1) * interval '1 day')
        = ${q.month} AS valid,
      extract(epoch FROM ${at(sql`y`, q.start)})::float8 * 1000 AS from_ms,
      extract(epoch FROM ${at(sql`y`, q.end)})::float8 * 1000 AS to_ms
    FROM chosen
  `)
  const [row] = rows
  return row?.valid ? { from: new Date(Number(row.from_ms)), to: new Date(Number(row.to_ms)) } : null
}
