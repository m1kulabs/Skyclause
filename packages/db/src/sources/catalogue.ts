import { sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { source } from '../schema'
import type { CatalogueMetadata, DiscoveredSourceDto } from './types'

/**
 * D45: polled results reach Postgres only in the 15-minute batch. Catalogued observed and polled sources default to two
 * source cadences plus two batches; JPS (300 s) therefore goes stale after 2400 s. Device sources ingest directly and
 * keep their own thresholds; an explicit `staleAfterS` (APIMS) overrides the default. This is a tolerance around the
 * stored freshness clock, not a bound on provider publication lag.
 */
export const SOURCE_INGEST_BATCH_S = 900

/** Refresh discovered catalogue metadata without deleting sources or their append-only history. */
export async function upsertSourceCatalogue(
  tx: Tx<SystemPrincipal>,
  adapter: CatalogueMetadata,
  entries: DiscoveredSourceDto[]
): Promise<void> {
  for (const entry of entries) {
    const metadata = {
      name: entry.name,
      lat: entry.lat,
      lon: entry.lon,
      url: entry.url,
      meta: entry.meta,
      cadenceS: adapter.cadence,
      freshness: adapter.freshness,
      staleAfterS: entry.staleAfterS ?? 2 * adapter.cadence + 2 * SOURCE_INGEST_BATCH_S,
      licenceId: adapter.licence.id,
      licenceLabel: adapter.licence.label
    }
    await tx
      .insert(source)
      .values({ ownerOrgId: null, kind: adapter.kind, externalId: entry.externalId, ...metadata })
      .onConflictDoUpdate({
        target: [source.ownerOrgId, source.kind, source.externalId],
        set: { ...metadata, updatedAt: sql`now()` }
      })
  }
}
