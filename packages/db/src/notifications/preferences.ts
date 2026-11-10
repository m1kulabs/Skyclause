import { NOTIFICATION_KINDS, type NotificationPreference } from '@skyclause/contracts'
import { eq, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { notificationPreference } from '../schema'

// #156: an account's switch per notification kind in the transaction's organisation; a kind without a row is on.

/** Every kind, in §1's order, with the account's stored switch or the default (on). */
export async function notificationPreferences(tx: Tx, accountId: string): Promise<NotificationPreference[]> {
  const rows = await tx
    .select({ kind: notificationPreference.kind, enabled: notificationPreference.enabled })
    .from(notificationPreference)
    .where(eq(notificationPreference.accountId, accountId))
  const stored = new Map(rows.map((row) => [row.kind, row.enabled]))
  return NOTIFICATION_KINDS.map((kind) => ({ kind, enabled: stored.get(kind) ?? true }))
}

/** Upserts the account's switch for each given kind; the last entry for a kind wins. Other accounts' rows stay. */
export async function setNotificationPreferences(tx: Tx, accountId: string, preferences: NotificationPreference[]) {
  const orgId = tx.orgId
  if (!orgId) throw new Error('setNotificationPreferences needs a withTenant transaction')
  const byKind = new Map(preferences.map((p) => [p.kind, p.enabled]))
  if (!byKind.size) return
  await tx
    .insert(notificationPreference)
    .values([...byKind].map(([kind, enabled]) => ({ orgId, accountId, kind, enabled })))
    .onConflictDoUpdate({
      target: [notificationPreference.orgId, notificationPreference.accountId, notificationPreference.kind],
      set: { enabled: sql`excluded.enabled`, updatedAt: sql`now()` }
    })
}
