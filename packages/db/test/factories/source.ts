import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { source } from '../../src/schema'

/** A source: a device source of the transaction's organisation under `withTenant`, a catalogue one under `withSystem`. */
export async function makeSource(tx: Tx<Principal>, overrides: Partial<typeof source.$inferInsert> = {}) {
  const [row] = await tx
    .insert(source)
    .values({
      ownerOrgId: tx.orgId,
      kind: 'jps_rain',
      externalId: randomUUID(),
      name: 'Test source',
      url: 'https://source.example.test/',
      cadenceS: 300,
      freshness: 'observed',
      staleAfterS: 1800,
      licenceId: 'test',
      licenceLabel: 'Test licence',
      ...overrides
    })
    .returning()
  return row!
}
