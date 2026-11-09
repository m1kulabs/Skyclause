import { and, arrayContains, desc, eq, getTableColumns, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { consentRecord, notice, subscriber, suppression, window } from '../schema'

// #157 (c-subscribers): the reads behind the subscribers list, counts and the sign-up page (NTC-13, NTC-8).

export const SUBSCRIBER_STATUSES = [
  'confirmed',
  'unconfirmed',
  'bounced',
  'complained',
  'suppressed',
  'unsubscribed'
] as const
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number]

/**
 * A row's status, first match wins: its own unsubscribe, then a complaint or bounce on its address, then an
 * organisation-wide unsubscribe suppression from another project's row (`suppressed`), then confirmation.
 */
const status = sql<SubscriberStatus>`CASE
  WHEN ${subscriber.unsubscribedAt} IS NOT NULL THEN 'unsubscribed'
  WHEN ${suppression.reason} = 'complaint' THEN 'complained'
  WHEN ${suppression.reason} = 'bounce' THEN 'bounced'
  WHEN ${suppression.reason} IS NOT NULL THEN 'suppressed'
  WHEN ${subscriber.confirmedAt} IS NOT NULL THEN 'confirmed'
  ELSE 'unconfirmed' END`

const onSuppression = and(eq(suppression.orgId, subscriber.orgId), eq(suppression.emailHash, subscriber.emailHash))

/** One page of a project's subscribers by ID, `limit + 1` rows, each with status and latest consent record. */
export async function listSubscriberRows(
  tx: Tx,
  q: {
    projectId: string
    limit: number
    /** One subscriber's row. */
    id?: string
    afterId?: string
    windowId?: string
    channel?: string
    status?: SubscriberStatus
  }
) {
  const lastNoticeAt = sql<Date | null>`(SELECT max(${notice.acceptedAt}) FROM ${notice}
    WHERE ${notice.subscriberId} = ${subscriber.id} AND ${notice.kind} = 'call')`.mapWith(notice.acceptedAt)
  const rows = await tx
    .select({
      ...getTableColumns(subscriber),
      status,
      suppressed: sql<boolean>`${suppression.id} IS NOT NULL`,
      lastNoticeAt
    })
    .from(subscriber)
    .leftJoin(suppression, onSuppression)
    .where(
      and(
        eq(subscriber.projectId, q.projectId),
        q.id ? eq(subscriber.id, q.id) : undefined,
        q.afterId ? gt(subscriber.id, q.afterId) : undefined,
        q.windowId ? arrayContains(subscriber.windowIds, [q.windowId]) : undefined,
        q.channel ? arrayContains(subscriber.channels, [q.channel]) : undefined,
        q.status ? sql`${status} = ${q.status}` : undefined
      )
    )
    .orderBy(subscriber.id)
    .limit(q.limit + 1)
  const ids = rows.map((row) => row.id)
  const consents = ids.length
    ? await tx
        .selectDistinctOn([consentRecord.subscriberId])
        .from(consentRecord)
        .where(inArray(consentRecord.subscriberId, ids))
        .orderBy(consentRecord.subscriberId, desc(consentRecord.at), desc(consentRecord.id))
    : []
  const latest = new Map(consents.map((consent) => [consent.subscriberId, consent]))
  return rows.map((row) => ({ ...row, consent: latest.get(row.id) ?? null }))
}

/**
 * A project's subscribers by status (each row counted once, so they sum to `total`), and the confirmed ones, who are
 * the reachable ones, by window and by channel.
 */
export async function countSubscribers(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ status, windowIds: subscriber.windowIds, channels: subscriber.channels })
    .from(subscriber)
    .leftJoin(suppression, onSuppression)
    .where(eq(subscriber.projectId, projectId))
  const byStatus = Object.fromEntries(SUBSCRIBER_STATUSES.map((name) => [name, 0])) as Record<SubscriberStatus, number>
  const byWindow = new Map<string, number>()
  const byChannel = new Map<string, number>()
  for (const row of rows) {
    byStatus[row.status] += 1
    if (row.status !== 'confirmed') continue
    for (const id of row.windowIds) byWindow.set(id, (byWindow.get(id) ?? 0) + 1)
    for (const channel of row.channels) byChannel.set(channel, (byChannel.get(channel) ?? 0) + 1)
  }
  return { total: rows.length, ...byStatus, byWindow, byChannel }
}

/** A window a subscriber may hold: the project's own, not a guest window (GST-5), not cancelled, not hidden. */
const pickable = (projectId: string) =>
  and(
    eq(window.projectId, projectId),
    eq(window.guest, false),
    isNull(window.cancelledAt),
    eq(window.moderation, 'visible')
  )

/** The pickable windows the sign-up page offers: those not yet ended. */
export function openWindows(tx: Tx, projectId: string) {
  return tx
    .select()
    .from(window)
    .where(and(pickable(projectId), gt(window.endsAt, sql`now()`)))
    .orderBy(window.startsAt, window.id)
}

/** Which of `ids` are pickable windows of the project (an ended one stays pickable, so a kept choice still saves). */
export async function pickableWindowIds(tx: Tx, projectId: string, ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  const rows = await tx
    .select({ id: window.id })
    .from(window)
    .where(and(pickable(projectId), inArray(window.id, ids)))
  return new Set(rows.map((row) => row.id))
}

/** Whether a `confirmation` or `preference_link` went to the subscriber in the last 10 minutes (abuse throttle). */
export async function recentSubscriberEmail(tx: Tx, subscriberId: string, kind: 'confirmation' | 'preference_link') {
  const [row] = await tx
    .select({ id: notice.id })
    .from(notice)
    .where(
      and(
        eq(notice.subscriberId, subscriberId),
        eq(notice.kind, kind),
        gt(notice.createdAt, sql`now() - interval '10 minutes'`)
      )
    )
    .limit(1)
  return row !== undefined
}
