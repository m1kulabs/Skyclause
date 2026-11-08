import { sql } from 'drizzle-orm'
import { withSystem } from './client'

/**
 * pg_partman's maintenance for `poll` and `reading` (TRD partitions): premakes the next months and keeps the default
 * partition. The worker's batch calls it hourly (D45: no pg_cron); `partition_maintenance()` runs it as owner.
 */
export async function maintainPartitions() {
  await withSystem('partition-maintenance', (tx) => tx.execute(sql`SELECT partition_maintenance()`))
}
