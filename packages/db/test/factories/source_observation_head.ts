import type { Tx } from '../../src/client'
import { sourceObservationHead } from '../../src/schema'
import { makeSource } from './source'
export async function makeSourceObservationHead(
  tx: Tx,
  overrides: Partial<typeof sourceObservationHead.$inferInsert> = {}
) {
  const sourceId = overrides.sourceId ?? (await makeSource(tx)).id
  const [row] = await tx
    .insert(sourceObservationHead)
    .values({
      sourceId,
      metric: 'rain_5m_mm',
      observedAt: new Date('2026-11-10T00:00:00Z'),
      capturedAt: new Date('2026-11-10T00:01:00Z'),
      ...overrides
    })
    .returning()
  return row!
}
