import { sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { source } from '../schema'
import type { CatalogueMetadata, DiscoveredSourceDto } from './types'

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
      staleAfterS: entry.staleAfterS ?? 2 * adapter.cadence,
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
