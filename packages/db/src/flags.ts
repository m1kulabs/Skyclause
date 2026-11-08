import type { Principal } from '@skyclause/contracts'
import { and, eq, isNull, or } from 'drizzle-orm'
import type { Tx } from './client'
import { featureFlag } from './schema'

/**
 * Whether a #79 §6 flag is on: the organisation's row when `orgId` is given and has one, else the global row; a flag
 * with neither is off. RLS shows a tenant transaction only the global rows and its own organisation's.
 */
export async function isFlagEnabled(tx: Tx<Principal | null>, key: string, orgId?: string): Promise<boolean> {
  const scope = orgId ? or(isNull(featureFlag.orgId), eq(featureFlag.orgId, orgId)) : isNull(featureFlag.orgId)
  const rows = await tx
    .select({ orgId: featureFlag.orgId, enabled: featureFlag.enabled })
    .from(featureFlag)
    .where(and(eq(featureFlag.key, key), scope))
  return (rows.find((row) => row.orgId !== null) ?? rows[0])?.enabled ?? false
}
