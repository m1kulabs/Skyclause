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

  // Each bundle with its first accepted on-duty alert; an escalation's alert is a later step, not this one. A bundle
  // leaves Needs review when approved (`approved_at`) or for a final state (superseded, expired, closed), whose
  // transition is its last `updated_at`.
  const alerts = (tx: Tx, where: SQL | undefined, dueS: number) =>
    tx
      .select({
        needsReviewAt: sql<Date>`${bundle.needsReviewAt}`.mapWith(bundle.needsReviewAt),
        acceptedAt: min(bundleAlert.acceptedAt)
      })
      .from(bundle)
      .leftJoin(bundleAlert, and(eq(bundleAlert.bundleId, bundle.id), eq(bundleAlert.level, 'on_duty')))
      .where(where)
      .groupBy(bundle.id)
      .having(
        sql`${min(bundleAlert.acceptedAt)} IS NOT NULL OR ${bundle.state} IN ('needs_review', 'reconfirm')
          OR coalesce(${bundle.approvedAt}, ${bundle.updatedAt}) >= ${bundle.needsReviewAt} + make_interval(secs => ${dueS})`
      )

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
    // Each key that is `crossing:` and a canonical UUID, the text of a crossing's ID, is cast to that ID (no other key
    // is, so none fails the cast), for the primary key to find. OFFSET 0 keeps the cast in its own subquery: inlined
    // into the join, it is a leaky function of the key, which RLS won't let an index condition on `crossing` use.
    reviews: (window) =>
      eachOrganisation((tx) =>
        tx
          .select({
            needsReviewAt: sql<Date>`${bundle.needsReviewAt}`.mapWith(bundle.needsReviewAt),
            crossingAt: sql<Date>`min(${crossing.at})`.mapWith(crossing.at)
          })
          .from(bundle)
          .innerJoin(run, eq(run.id, bundle.runId))
          .innerJoinLateral(
            sql`(SELECT substr(k, 10)::uuid AS id FROM unnest(array_append(${run.coalescedKeys}, ${run.dedupeKey})) AS k
              WHERE k ~ '^crossing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OFFSET 0) AS served`,
            sql`true`
          )
          .innerJoin(crossing, sql`${crossing.id} = served.id`)
          .where(within(bundle.needsReviewAt, window))
          .groupBy(bundle.id)
      ),

    approverAlerts: (window, dueS) => eachOrganisation((tx) => alerts(tx, within(bundle.needsReviewAt, window), dueS)),

    latestApproverAlerts: async (before, count, dueS) =>
      (
        await eachOrganisation((tx) =>
          alerts(tx, and(isNotNull(bundle.needsReviewAt), lt(bundle.needsReviewAt, before)), dueS)
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
