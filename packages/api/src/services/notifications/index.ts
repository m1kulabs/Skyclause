import type { Notification, NotificationPreference } from '@skyclause/contracts'
import {
  markNotificationRead as markRead,
  notificationPreferences,
  notificationRows,
  orgProjectIds,
  setNotificationPreferences,
  unreadCount,
  type NotificationRow,
  type Tx
} from '@skyclause/db'
import { toWire } from '../../serialize'
import type { ServiceContext } from '../../tenancy'

// #156 (c-notifications): the signed-in account's in-app items and switches in one organisation, the `tx`'s. The
// routes run these once per organisation the account belongs to (`/api` carries no organisation for them).

const account = (ctx: ServiceContext) => {
  if (ctx.principal.kind !== 'session') throw new Error('notifications belong to a signed-in session')
  return { tx: ctx.tx as unknown as Tx, accountId: ctx.principal.accountId }
}

const toNotification = (row: NotificationRow) => toWire(row) as Notification

/** The account's items, newest first: up to `limit` before `beforeId`, or every one created after `createdAfter`. */
export async function listNotifications(
  ctx: ServiceContext,
  input: { limit?: number; beforeId?: string; createdAfter?: Date }
): Promise<Notification[]> {
  const { tx, accountId } = account(ctx)
  return (await notificationRows(tx, { accountId, ...input })).map(toNotification)
}

/** The organisation's project IDs: every member may view every project, so the stream listens to them all. */
export async function streamProjectIds(ctx: ServiceContext): Promise<string[]> {
  return orgProjectIds(account(ctx).tx)
}

export async function countUnread(ctx: ServiceContext): Promise<number> {
  const { tx, accountId } = account(ctx)
  return unreadCount(tx, accountId)
}

/** Sets `read_at` once on the account's item; null when the item isn't the account's here. */
export async function markNotificationRead(
  ctx: ServiceContext,
  input: { id: string; now: Date }
): Promise<Notification | null> {
  const { tx, accountId } = account(ctx)
  const row = await markRead(tx, { accountId, ...input })
  return row && toNotification(row)
}

export async function getNotificationPreferences(ctx: ServiceContext): Promise<NotificationPreference[]> {
  const { tx, accountId } = account(ctx)
  return notificationPreferences(tx, accountId)
}

export async function updateNotificationPreferences(
  ctx: ServiceContext,
  input: { preferences: NotificationPreference[] }
): Promise<void> {
  const { tx, accountId } = account(ctx)
  await setNotificationPreferences(tx, accountId, input.preferences)
}
