import { z } from 'zod'
import type { DiscoveredSource } from '../contract'
import { SchemaError } from '../errors'

export const APIMS_MAP_URL = 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm'

const Catalogue = z.object({
  data: z
    .array(
      z.object({
        ID: z.number().int().positive(),
        STATION_ID: z.string().refine((value) => value.trim().length > 0),
        STATION_LOCATION: z.string().refine((value) => value.trim().length > 0),
        STATE_ID: z.number().int().positive(),
        STATE_NAME: z.string().refine((value) => value.trim().length > 0),
        STATION_STATUS: z.number().int().nonnegative(),
        LATITUDE: z.number().min(-90).max(90),
        LONGITUDE: z.number().min(-180).max(180)
      })
    )
    .min(1)
})

/** Validate the complete catalogue before returning any upsert candidates. */
export function discoverApims(body: unknown): DiscoveredSource[] {
  const parsed = Catalogue.safeParse(body)
  if (!parsed.success) throw new SchemaError('Invalid APIMS catalogue', { cause: parsed.error })
  const stations = new Set<string>(),
    ids = new Set<number>()
  return parsed.data.data.map((row) => {
    if (stations.has(row.STATION_ID) || ids.has(row.ID))
      throw new SchemaError(`Duplicate APIMS station: ${row.STATION_ID}`)
    stations.add(row.STATION_ID)
    ids.add(row.ID)
    return {
      externalId: row.STATION_ID,
      name: row.STATION_LOCATION,
      lat: row.LATITUDE,
      lon: row.LONGITUDE,
      url: APIMS_MAP_URL,
      staleAfterS: 7200,
      meta: { state_id: row.STATE_ID, state_name: row.STATE_NAME, station_status: row.STATION_STATUS }
    }
  })
}
