import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  reading,
  source,
  upsertSourceCatalogue,
  withSystem,
  type CatalogueMetadata,
  type DiscoveredSourceDto
} from '../src'
import { makeReading } from './factories'

const metadata: CatalogueMetadata = {
  kind: 'jps_rain',
  cadence: 300,
  freshness: 'observed',
  licence: { id: 'test', label: 'Test licence' }
}
const discovered = (): DiscoveredSourceDto => ({
  externalId: randomUUID(),
  name: 'Station',
  lat: 3,
  lon: 101,
  url: 'https://source.example.test/',
  meta: { station: 'published' }
})

test('catalogue refresh preserves identity and readings while updating all discovery fields and nullable licence', async () => {
  const entry = discovered()
  await withSystem('test-source-catalogue', (tx) => upsertSourceCatalogue(tx, metadata, [entry]))
  const [before] = await withSystem('test-source-catalogue', (tx) =>
    tx.select().from(source).where(eq(source.externalId, entry.externalId))
  )
  const old = await withSystem('test-source-catalogue', (tx) => makeReading(tx, { sourceId: before!.id }))
  await withSystem('test-source-catalogue', (tx) =>
    upsertSourceCatalogue(
      tx,
      { ...metadata, cadence: 600, freshness: 'polled', licence: { id: null, label: 'Attribution' } },
      [
        {
          ...entry,
          name: 'Renamed',
          lat: null,
          lon: null,
          url: 'https://source.example.test/new',
          meta: { changed: true },
          staleAfterS: 70
        }
      ]
    )
  )
  const [after] = await withSystem('test-source-catalogue', (tx) =>
    tx.select().from(source).where(eq(source.id, before!.id))
  )
  expect(after).toMatchObject({
    id: before!.id,
    ownerOrgId: null,
    name: 'Renamed',
    lat: null,
    lon: null,
    url: 'https://source.example.test/new',
    meta: { changed: true },
    cadenceS: 600,
    freshness: 'polled',
    staleAfterS: 70,
    licenceId: null,
    licenceLabel: 'Attribution'
  })
  expect(
    await withSystem('test-source-catalogue', (tx) => tx.select().from(reading).where(eq(reading.id, old.id)))
  ).toHaveLength(1)
  await withSystem('test-source-catalogue', (tx) => upsertSourceCatalogue(tx, metadata, [entry]))
  // Two 300 s intervals plus two 900 s ingestion batches (D45).
  expect(
    await withSystem('test-source-catalogue', (tx) => tx.select().from(source).where(eq(source.id, before!.id)))
  ).toMatchObject([{ staleAfterS: 2400 }])
  await withSystem('test-source-catalogue', (tx) => upsertSourceCatalogue(tx, metadata, []))
  expect(
    await withSystem('test-source-catalogue', (tx) => tx.select().from(source).where(eq(source.id, before!.id)))
  ).toHaveLength(1)
})
