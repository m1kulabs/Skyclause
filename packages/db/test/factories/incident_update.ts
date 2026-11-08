import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../../src/client'
import { incidentUpdate } from '../../src/schema'
import { makeIncident } from './incident'

/** An update on `incidentId`, or on a new incident; G, written by `system`. */
export async function makeIncidentUpdate(
  tx: Tx<Principal>,
  overrides: Partial<typeof incidentUpdate.$inferInsert> = {}
) {
  const incidentId = overrides.incidentId ?? (await makeIncident(tx)).id
  const [row] = await tx
    .insert(incidentUpdate)
    .values({ status: 'investigating', body: 'Investigating.', ...overrides, incidentId })
    .returning()
  return row!
}
