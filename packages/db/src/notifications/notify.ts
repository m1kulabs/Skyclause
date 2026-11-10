import type { Notify } from '@skyclause/contracts'
import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '../client'
import { notification, notificationPreference } from '../schema'

/**
 * #79 §1 `notify` (#156): one unread in-app item per named account in the transaction's organisation, skipping
 * accounts that turned the kind off. An unread item with the same `(account_id, kind, ref_type, ref_id, recovered)`
 * makes it a no-op (`notification_unread_key`), so a recovery item sits beside the open one and a condition that
 * reopens after being read notifies again. Needs `withTenant`.
 */
export const notify: Notify = async (handle, n) => {
  const tx = handle as Tx
  const orgId = tx.orgId
  if (!orgId) throw new Error('notify needs a withTenant transaction')
  const accountIds = [...new Set(n.accountIds)]
  if (!accountIds.length) return
  const off = await tx
    .select({ accountId: notificationPreference.accountId })
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.kind, n.kind),
        eq(notificationPreference.enabled, false),
        inArray(notificationPreference.accountId, accountIds)
      )
    )
  const skipped = new Set(off.map(({ accountId }) => accountId))
  const to = accountIds.filter((accountId) => !skipped.has(accountId))
  if (!to.length) return
  await tx
    .insert(notification)
    .values(
      to.map((accountId) => ({
        orgId,
        accountId,
        projectId: n.projectId ?? null,
        kind: n.kind,
        refType: n.ref.type,
        refId: n.ref.id,
        recovered: n.recovered ?? false
      }))
    )
    .onConflictDoNothing()
}
