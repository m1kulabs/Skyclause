import { and, eq } from 'drizzle-orm'
import type { Tx } from '../client'
import { icsFeed } from '../schema'
import { windowTenant } from '../windows/repository'

export type IcsFeedRow = typeof icsFeed.$inferSelect
export type IcsFeedInsert = Omit<typeof icsFeed.$inferInsert, 'orgId'>

/** Incoming feed resource; authorization and projection belong to the service. */
export async function getIcsFeedRecord(tx: Tx, id: string): Promise<IcsFeedRow | null> {
  const [row] = await tx
    .select()
    .from(icsFeed)
    .where(and(eq(icsFeed.orgId, windowTenant(tx)), eq(icsFeed.id, id)))
  return row ?? null
}

/** The transaction owns tenancy; the existing composite project FK prevents foreign project references. */
export async function insertIcsFeedRecord(tx: Tx, values: IcsFeedInsert): Promise<IcsFeedRow> {
  const [row] = await tx
    .insert(icsFeed)
    .values({ ...values, orgId: windowTenant(tx) })
    .returning()
  return row!
}
