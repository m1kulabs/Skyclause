import type { Source, SourceAdapter } from '../contract'
import { SchemaError } from '../errors'
import { jpsRainIndicators } from '../indicators'
import { discoverJpsStations } from './jps-discovery'
import type { JpsDiscoveryOptions } from './jps-discovery'
import { parseJpsRainfall } from './jps-parser'

export type { JpsDiscoveryOptions } from './jps-discovery'

export function jpsGraphUrl(source: Source): string {
  const id = source.meta.jps_id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new SchemaError('Expected positive safe-integer JPS jps_id')
  }
  return `https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/${id}`
}

function oneSource(sources: Source[]): Source {
  if (sources.length !== 1) throw new SchemaError('JPS requires exactly one bound source')
  return sources[0]!
}

export function createJpsRainAdapter(options: JpsDiscoveryOptions = {}): SourceAdapter<unknown> {
  const adapter: SourceAdapter<unknown> = {
    kind: 'jps_rain',
    cadence: 300,
    freshness: 'observed',
    batch: 'per_source',
    licence: { id: null, label: 'No published terms found (5 Nov 2026)' },
    indicators: jpsRainIndicators,
    async fetch(sources, ctx) {
      const response = await ctx.http(jpsGraphUrl(oneSource(sources)), { headers: { Accept: 'application/json' } })
      return response.json()
    },
    parse: (raw, sources) => parseJpsRainfall(raw, oneSource(sources)),
    backfill: (source, ctx) => adapter.fetch([source], ctx),
    discover: () => discoverJpsStations(options)
  }
  return adapter
}

export const jpsRain = createJpsRainAdapter()
