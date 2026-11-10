import {
  approval,
  bundle,
  bundleAlert,
  call,
  crossing,
  notice,
  organization,
  poll,
  reading,
  run,
  source,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import { and, desc, eq, gte, isNotNull, lt, min, ne, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { SliReads, TimeWindow } from '.'

const JOB = 'sli'

const within = (column: Parameters<typeof gte>[0], window: TimeWindow) =>
  and(gte(column, window.from), lt(column, window.to))

const successor = alias(bundle, 'successor')

/**
 * The SLI reads from stored timestamps, as `system`: `poll`, `reading` and `source` in one `withSystem`, every T table
 * per organisation in `withTenant` with a system principal, merged. One instance per batch run lists the organisations
 * once.
 *
 * Not read yet, so their SLIs record no data: `pollSlots` and `latestPollSlots`, since `poll` stores no Scheduler slot
 * (the runner only logs it) and no adapter has a schedule (#121–#128); `evaluations`, since the snapshot's `inputs`
 * (b-evaluator, #133) don't yet say which readings it used.
 */
export function databaseReads(): SliReads {
  let organisations: Promise<string[]> | undefined
  const eachOrganisation = async <T>(read: (tx: Tx) => Promise<T[]>) => {
    organisations ??= withSystem(JOB, async (tx) =>
      (await tx.select({ id: organization.id }).from(organization)).map((o) => o.id)
    )
    const rows: T[] = []
    for (const orgId of await organisations) {
      rows.push(...(await withTenant({ orgId, principal: systemPrincipal(JOB) }, read)))
    }
    return rows
  }

  // Each bundle with its first accepted on-duty alert; an escalation's alert is a later step, not this one.
  const alerts = (tx: Tx, where: SQL | undefined) =>
    tx
      .select({
        needsReviewAt: sql<Date>`${bundle.needsReviewAt}`.mapWith(bundle.needsReviewAt),
        acceptedAt: min(bundleAlert.acceptedAt)
      })
      .from(bundle)
      .leftJoin(bundleAlert, and(eq(bundleAlert.bundleId, bundle.id), eq(bundleAlert.level, 'on_duty')))
      .where(where)
      .groupBy(bundle.id)

  return {
    storedReadings: (window) =>
      withSystem(JOB, (tx) =>
        tx
          .select({ adapter: source.kind, polledAt: poll.startedAt, storedAt: reading.receivedAt })
          .from(reading)
          .innerJoin(poll, eq(poll.id, reading.pollId))
          .innerJoin(source, eq(source.id, poll.sourceId))
          .where(and(within(reading.receivedAt, window), eq(poll.purpose, 'poll')))
      ),

    // A run serves a crossing through its own dedupe key or one coalesced into it (`runsServing`); the earliest counts.
    reviews: (window) =>
      eachOrganisation((tx) =>
        tx
          .select({
            needsReviewAt: sql<Date>`${bundle.needsReviewAt}`.mapWith(bundle.needsReviewAt),
            crossingAt: sql<Date>`min(${crossing.at})`.mapWith(crossing.at)
          })
          .from(bundle)
          .innerJoin(run, eq(run.id, bundle.runId))
          .innerJoin(
            crossing,
            sql`'crossing:' || ${crossing.id} = ANY (array_append(${run.coalescedKeys}, ${run.dedupeKey}))`
          )
          .where(within(bundle.needsReviewAt, window))
          .groupBy(bundle.id)
      ),

    approverAlerts: (window) => eachOrganisation((tx) => alerts(tx, within(bundle.needsReviewAt, window))),

    latestApproverAlerts: async (before, count) =>
      (
        await eachOrganisation((tx) =>
          alerts(tx, and(isNotNull(bundle.needsReviewAt), lt(bundle.needsReviewAt, before)))
            .orderBy(desc(bundle.needsReviewAt))
            .limit(count)
        )
      )
        .sort((a, b) => b.needsReviewAt.getTime() - a.needsReviewAt.getTime())
        .slice(0, count),

    // A suppressed recipient is never handed to the provider, by design.
    handovers: (window) =>
      eachOrganisation((tx) =>
        tx
          .select({ approvedAt: sql<Date>`${call.approvedAt}`.mapWith(call.approvedAt), acceptedAt: notice.acceptedAt })
          .from(notice)
          .innerJoin(call, eq(call.id, notice.callId))
          .where(and(eq(notice.kind, 'call'), ne(notice.status, 'suppressed'), within(call.approvedAt, window)))
      ),

    // A superseded bundle is settled when its successor was drafted, which carries its own SLA.
    slaDue: (window) =>
      eachOrganisation((tx) =>
        tx
          .select({
            dueAt: sql<Date>`${bundle.slaDueAt}`.mapWith(bundle.slaDueAt),
            decidedAt: sql<Date | null>`least(
              min(${approval.createdAt}) FILTER (WHERE ${approval.action} IN ('approve', 'edit', 'reject')),
              min(${successor.createdAt})
            )`.mapWith(approval.createdAt),
            escalatedAt:
              sql<Date | null>`min(${approval.createdAt}) FILTER (WHERE ${approval.action} = 'escalate')`.mapWith(
                approval.createdAt
              )
          })
          .from(bundle)
          .leftJoin(approval, eq(approval.bundleId, bundle.id))
          .leftJoin(successor, eq(successor.id, bundle.supersededBy))
          .where(within(bundle.slaDueAt, window))
          .groupBy(bundle.id)
      )
  }
}
