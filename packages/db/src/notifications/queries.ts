import type { NotificationKind } from '@skyclause/contracts'
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import type { Tx } from '../client'
import { notification, organization, project } from '../schema'

// #156 (c-notifications): an account's in-app items in the transaction's organisation, newest first.

export interface NotificationRow {
  id: string
  kind: NotificationKind
  ref: { type: string; id: string }
  /** Null for an organisation-wide item; slugs for the item's link. */
  project: { id: string; slug: string; orgSlug: string } | null
  recovered: boolean
  createdAt: Date
  readAt: Date | null
}

/**
 * `accountId`'s items, newest first by ID (UUIDv7): those before `beforeId` (a cursor), created after `createdAfter`,
 * or the one `id`; at most `limit`.
 */
export async function notificationRows(
  tx: Tx,
  q: { accountId: string; beforeId?: string; createdAfter?: Date; id?: string; limit?: number }
): Promise<NotificationRow[]> {
  const query = tx
    .select({
      id: notification.id,
      kind: notification.kind,
      refType: notification.refType,
      refId: notification.refId,
      recovered: notification.recovered,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
      projectId: project.id,
      projectSlug: project.slug,
      orgSlug: organization.slug
    })
    .from(notification)
    .innerJoin(organization, eq(organization.id, notification.orgId))
    .leftJoin(project, eq(project.id, notification.projectId))
    .where(
      and(
        eq(notification.accountId, q.accountId),
        q.beforeId === undefined ? undefined : lt(notification.id, q.beforeId),
        q.createdAfter === undefined ? undefined : gt(notification.createdAt, q.createdAfter),
        q.id === undefined ? undefined : eq(notification.id, q.id)
      )
    )
    .orderBy(desc(notification.id))
  const rows = await (q.limit === undefined ? query : query.limit(q.limit))
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    ref: { type: row.refType, id: row.refId },
    project:
      row.projectId && row.projectSlug ? { id: row.projectId, slug: row.projectSlug, orgSlug: row.orgSlug } : null,
    recovered: row.recovered,
    createdAt: row.createdAt,
    readAt: row.readAt
  }))
}

/** Sets `read_at` on `accountId`'s item `id` unless it is already read; the item, or null if it isn't the account's. */
export async function markNotificationRead(
  tx: Tx,
  q: { accountId: string; id: string; now: Date }
): Promise<NotificationRow | null> {
  await tx
    .update(notification)
    .set({ readAt: q.now })
    .where(and(eq(notification.id, q.id), eq(notification.accountId, q.accountId), isNull(notification.readAt)))
  const [row] = await notificationRows(tx, { accountId: q.accountId, id: q.id })
  return row ?? null
}
