import { ROLES, type AuditAction, type Role, type TxHandle } from '@skyclause/contracts'
import { and, desc, eq, getTableColumns, inArray, isNull, sql, type SQL } from 'drizzle-orm'
import { authDatabase } from '../auth'
import type { Tx } from '../client'
import { auditEvent } from '../schema'
import { member, user } from '../schema/auth'

// #107 a-audit-log: the audit_event reads. Writes stay in record.ts; only `retention` deletes, via #109.

// The §4 list and export filters, in API field names.
export interface AuditFilters {
  action?: AuditAction
  actorId?: string
  targetType?: string
  targetId?: string
  projectId?: string
  from?: Date
  to?: Date
}

export type AuditRow = typeof auditEvent.$inferSelect & { cursorAt: string }

/** The keyset position: the list reads `at` newest first with `id` breaking ties. */
export interface AuditCursor {
  at: Date | string
  id: string
}

function matching(f: AuditFilters): SQL | undefined {
  return and(
    f.action ? eq(auditEvent.action, f.action) : undefined,
    f.actorId ? eq(auditEvent.actorId, f.actorId) : undefined,
    f.targetType ? eq(auditEvent.targetType, f.targetType) : undefined,
    f.targetId ? eq(auditEvent.targetId, f.targetId) : undefined,
    f.projectId ? eq(auditEvent.projectId, f.projectId) : undefined,
    f.from ? sql`${auditEvent.at} >= ${f.from}` : undefined,
    f.to ? sql`${auditEvent.at} <= ${f.to}` : undefined
  )
}

// Historical rows retain PostgreSQL microseconds; Date and wire timestamps only retain milliseconds.
const cursorAt = sql<string>`to_char(${auditEvent.at} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const position = sql`(${auditEvent.at}, ${auditEvent.id})`

/** Newest first, up to `limit + 1` rows strictly below `cursor`, for `page()` and its `next_cursor`. */
export async function listAudit(
  handle: TxHandle,
  q: { filters: AuditFilters; limit: number; cursor?: AuditCursor }
): Promise<AuditRow[]> {
  const tx = handle as Tx
  return tx
    .select({ ...getTableColumns(auditEvent), cursorAt })
    .from(auditEvent)
    .where(and(matching(q.filters), q.cursor ? sql`${position} < (${q.cursor.at}, ${q.cursor.id})` : undefined))
    .orderBy(desc(auditEvent.at), desc(auditEvent.id))
    .limit(q.limit + 1)
}

/** Newest first, up to `limit` rows below `before` and at or below `upto`, one export page. */
export async function auditExportPage(
  handle: TxHandle,
  q: { filters: AuditFilters; before?: AuditCursor; upto?: AuditCursor; limit: number }
): Promise<AuditRow[]> {
  const tx = handle as Tx
  return tx
    .select({ ...getTableColumns(auditEvent), cursorAt })
    .from(auditEvent)
    .where(
      and(
        matching(q.filters),
        q.before ? sql`${position} < (${q.before.at}, ${q.before.id})` : undefined,
        q.upto ? sql`${position} <= (${q.upto.at}, ${q.upto.id})` : undefined
      )
    )
    .orderBy(desc(auditEvent.at), desc(auditEvent.id))
    .limit(q.limit)
}

/** The newest row's position, null when the log is empty; the export reads up to here. */
export async function auditHead(handle: TxHandle): Promise<AuditCursor | null> {
  const tx = handle as Tx
  const [row] = await tx
    .select({ at: cursorAt, id: auditEvent.id })
    .from(auditEvent)
    .orderBy(desc(auditEvent.at), desc(auditEvent.id))
    .limit(1)
  return row ?? null
}

/** A deleted account's display name (AUD-4): the row keeps its pseudonymous ID, never a name or email. */
export const DELETED_ACCOUNT_NAME = 'Deleted account'

export interface ActorDisplay {
  name: string | null
  role: Role | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isRole = (role: string): role is Role => (ROLES as readonly string[]).includes(role)

/**
 * Display names and current organisation roles at read time, from `auth.user` and `auth.member` (never emails).
 * Only `account` actors resolve; a missing or deleted account reads "Deleted account".
 */
export async function resolveActorDisplay(
  orgId: string,
  actors: Array<{ actorType: string; actorId: string }>
): Promise<Map<string, ActorDisplay>> {
  const ids = [
    ...new Set(actors.filter((a) => a.actorType === 'account' && UUID.test(a.actorId)).map((a) => a.actorId))
  ]
  const names = new Map<string, string>()
  const roles = new Map<string, Role>()
  if (ids.length) {
    const live = await authDatabase()
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(inArray(user.id, ids), isNull(user.deletedAt)))
    for (const row of live) names.set(row.id, row.name)
    const memberships = await authDatabase()
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), inArray(member.userId, ids), isNull(user.deletedAt)))
    for (const row of memberships) if (isRole(row.role)) roles.set(row.userId, row.role)
  }
  return new Map(
    actors.map(({ actorId, actorType }) => [
      actorId,
      actorType === 'account'
        ? { name: names.get(actorId) ?? DELETED_ACCOUNT_NAME, role: roles.get(actorId) ?? null }
        : { name: null, role: null }
    ])
  )
}
