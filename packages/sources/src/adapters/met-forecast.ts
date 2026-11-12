import type { PollContext, Source, SourceAdapter } from '../contract'
import { HttpError, SchemaError } from '../errors'
import { metForecastIndicators } from '../indicators'
import { metForecastSource, parseMetForecast, parseMetForecastCatalogue } from './met-forecast-parser'

const url = 'https://api.data.gov.my/weather/forecast/'
export interface MetForecastOptions {
  discoveryHttp?: PollContext['http']
}

export function metForecastUrl(source: Source): string {
  metForecastSource([source])
  return `${url}?contains=${encodeURIComponent(source.name)}@location__location_name`
}

async function metForecastResponse(http: PollContext['http'], requestUrl: string): Promise<unknown> {
  const response = await http(requestUrl, { headers: { Accept: 'application/json' } })
  if (response.status !== 200) throw new HttpError(response.status, requestUrl)
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
    throw new SchemaError('Expected MET JSON response')
  try {
    return await response.json()
  } catch (cause) {
    throw new SchemaError('Invalid MET JSON response', { cause })
  }
}

export function createMetForecastAdapter(options: MetForecastOptions = {}): SourceAdapter<unknown> {
  return {
    kind: 'met_forecast',
    apiFamily: 'datagovmy-weather',
    cadence: 21600,
    freshness: 'polled',
    batch: 'per_source',
    licence: { id: 'CC-BY-4.0', label: 'MET Malaysia via data.gov.my, CC BY 4.0' },
    indicators: metForecastIndicators,
    async fetch(sources, ctx) {
      return metForecastResponse(ctx.http, metForecastUrl(metForecastSource(sources)))
    },
    parse: parseMetForecast,
    async discover() {
      if (!options.discoveryHttp) throw new SchemaError('MET forecast discovery requires injected budgeted HTTP')
      return parseMetForecastCatalogue(await metForecastResponse(options.discoveryHttp, url))
    }
  }
}

export const metForecast = createMetForecastAdapter()
