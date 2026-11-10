import type { Principal } from '@skyclause/contracts'
import { asc } from 'drizzle-orm'
import type { Tx } from '../client'
import { bundlesPastSla, signalHealth, weeklyApprovers } from '../schema'

// #111 (a-analytics): PRODUCT product-health readers over migration 0015's views. The views are granted to `system`
// only, so call these inside `withTenant` as a system principal; any other login is refused at the grant.

/** Distinct approving members per organisation per ISO week, with the week's storm/surge rota slots. */
export function readWeeklyApprovers(tx: Tx<Principal | null>) {
  return tx.select().from(weeklyApprovers).orderBy(asc(weeklyApprovers.orgId), asc(weeklyApprovers.weekStart))
}

/** Bundles past their SLA: escalated, or expired with no escalation logged. */
export function readBundlesPastSla(tx: Tx<Principal | null>) {
  return tx.select().from(bundlesPastSla).orderBy(asc(bundlesPastSla.bundleId))
}

/** Per-source hour shares fresh, stale and erroring, with the current `source_state`. */
export function readSignalHealth(tx: Tx<Principal | null>) {
  return tx.select().from(signalHealth).orderBy(asc(signalHealth.sourceId))
}
