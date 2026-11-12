import { eq, sql } from 'drizzle-orm'
import { shareSystemConnection, systemPrincipal, withSystem, withTenant } from './client'
import { verifyLedger, type LedgerVerdict } from './ledger'
import { analyticsEvent, domainEvent, project } from './schema'

const JOB = 'restore-drill'

// Columns the database stamps with now(), the writing transaction's start on its own clock: no writer sets them, nothing
// changes them, and withSystem reads every organisation's rows. Neon cuts a branch at a timestamp by commit time on that
// clock, so a transaction that starts at or before the point and commits after it counts on production but isn't on the
// branch, and `rpo_s` comes out too high. Left out: `ledger_entry.at` and `reading.received_at` (the
// application's clock), `audit_event` (T, invisible to withSystem) and `handled_*` (a whole handler's transaction).
const STAMPED = [
  [domainEvent, domainEvent.createdAt],
  [analyticsEvent, analyticsEvent.at]
] as const

const reads = {
  /** Every project, across organisations. */
  async projectIds(): Promise<string[]> {
    const rows = await withSystem(JOB, (tx) => tx.select({ id: project.id }).from(project).orderBy(project.id))
    return rows.map(({ id }) => id)
  },

  /** #146's walk, in the project's organisation: `ledger_entry` is T, so withSystem alone sees none of it. */
  async verifyLedger(projectId: string): Promise<LedgerVerdict> {
    const [found] = await withSystem(JOB, (tx) =>
      tx.select({ orgId: project.orgId }).from(project).where(eq(project.id, projectId))
    )
    if (!found) throw new Error(`restore drill: no project ${projectId}`)
    return withTenant({ orgId: found.orgId, principal: systemPrincipal(JOB) }, (tx) => verifyLedger(tx, projectId))
  },

  /** When the newest stamped row written at or before `at` was written, or null when there is none. */
  async newestWrite(at: Date): Promise<Date | null> {
    const until = sql`${at.toISOString()}::timestamptz`
    const newest = STAMPED.map(
      ([table, column]) => sql`(SELECT max(${column}) FROM ${table} WHERE ${column} <= ${until})`
    )
    const { rows } = await withSystem(JOB, (tx) =>
      tx.execute<{ newest: Date | string | null }>(sql`SELECT greatest(${sql.join(newest, sql`, `)}) AS newest`)
    )
    const found = rows[0]!.newest
    return found === null || found instanceof Date ? found : new Date(found)
  }
}

/**
 * The restore drill's database port (apps/worker/src/restore-drill/drill.ts): `fn` reads as `system` on the branch
 * compute at `host`, or on production when `host` is null, over one connection.
 */
export const drillDatabase = {
  read<T>(host: string | null, fn: (db: typeof reads) => Promise<T>): Promise<T> {
    return shareSystemConnection(() => fn(reads), host ?? undefined)
  }
}
