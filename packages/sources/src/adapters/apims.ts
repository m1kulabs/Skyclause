import type { SourceAdapter } from '../contract'
import { SchemaError } from '../errors'
import { apimsIndicators } from '../indicators/apims'
import { APIMS_MAP_URL, discoverApims } from './apims-discovery'
import { parseApims, type ApimsRaw } from './apims-parser'

export type { ApimsRaw } from './apims-parser'

function decode(body: Uint8Array): ApimsRaw {
  try {
    return { kind: 'latest', body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
  } catch (cause) {
    throw new SchemaError('Invalid APIMS JSON bytes', { cause })
  }
}

export function createApimsAdapter(): SourceAdapter<ApimsRaw> {
  return {
    kind: 'apims',
    cadence: 3600,
    freshness: 'observed',
    batch: 'all_bound',
    parseMode: 'per_source',
    licence: { id: null, label: 'No published terms found (5 Nov 2026)' },
    indicators: apimsIndicators,
    latestSlot: { seconds: 900, decode, discover: (body) => discoverApims(decode(body).body) },
    async fetch(_sources, ctx) {
      const response = await ctx.http(APIMS_MAP_URL, { headers: { Accept: 'application/json' } })
      return { kind: 'latest', body: await response.json() }
    },
    parse: parseApims
  }
}
