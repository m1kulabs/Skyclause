import { sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { source } from '../schema'
import type { CatalogueMetadata, DiscoveredSourceDto } from './types'

/**
 * D45: polled results reach Postgres only in the 15-minute batch. Between batches, a healthy source's newest stored
 * reading ages by up to one batch, on top of the poll's phase and the provider's own publishing lag (JPS posts a slot
 * about 5 minutes late), which together stay under another batch: about 29 minutes for JPS, measured 13 November 2026.
 * "Stale after two missed intervals" (TRD freshness) counts the source's intervals, so the default adds two batches:
 * JPS (300 s) goes stale after 40 minutes. Device sources ingest directly and keep their own thresholds; a discovery's
 * explicit `staleAfterS` (APIMS) stands.
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
