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
    groupedBackfill: {
      groupByMeta: 'state_id',
      requiredObservations(now) {
        const instant = Date.parse(now)
        if (!Number.isFinite(instant)) throw new SchemaError('Invalid history clock')
        const day = 86400000
        const morning = Math.floor((instant + 2 * 3600000) / day) * day - 2 * 3600000
        return [0, 1, 2].map((offset) => ({
          metric: 'api',
          observedAt: new Date(morning - offset * day).toISOString()
        }))
      },
      steps(sources, anchor) {
        const stateId = sources[0]?.meta.state_id
        if (
          typeof stateId !== 'number' ||
          !Number.isSafeInteger(stateId) ||
          stateId <= 0 ||
          sources.some((s) => s.meta.state_id !== stateId)
        )
          throw new SchemaError('Expected one positive safe-integer APIMS state_id')
        const instant = Date.parse(anchor)
        if (!Number.isFinite(instant)) throw new SchemaError('Invalid history anchor')
        return [0, 1, 2].map((offset) => {
          const through = new Date(Math.floor(instant / 3600000) * 3600000 + 8 * 3600000 - offset * 86400000)
            .toISOString()
            .slice(0, 19)
          return {
            key: through,
            async fetch(ctx) {
              const url = new URL('https://eqms.doe.gov.my/api3/publicportalapims/apitablehourly')
              url.searchParams.set('stateid', String(stateId))
              url.searchParams.set('datetime', through)
              const response = await ctx.http(url.toString(), { headers: { Accept: 'application/json' } })
              return { kind: 'history' as const, body: await response.json(), through, stateId }
            }
          }
        })
      }
    },
    parse: parseApims
  }
}
