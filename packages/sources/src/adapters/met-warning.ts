import type { PollContext, SourceAdapter } from '../contract'
import { HttpError, SchemaError } from '../errors'
import { metWarningIndicators } from '../indicators'
import { parseMetWarnings, validateMetWarningSources } from './met-warning-parser'

const url = 'https://api.data.gov.my/weather/warning/'

export function createMetWarningAdapter(): SourceAdapter<unknown> {
  return {
    kind: 'met_warning',
    apiFamily: 'datagovmy-weather',
    cadence: 600,
    freshness: 'polled',
    batch: 'all_bound',
    licence: { id: 'CC-BY-4.0', label: 'MET Malaysia via data.gov.my, CC BY 4.0' },
    indicators: metWarningIndicators,
    async fetch(sources, ctx) {
      validateMetWarningSources(sources)
      return metWarningResponse(ctx.http)
    },
    parse: parseMetWarnings,
    async discover() {
      return [{ externalId: 'met-warnings', name: 'MET Malaysia warnings', lat: null, lon: null, url, meta: {} }]
    }
  }
}

async function metWarningResponse(http: PollContext['http']): Promise<unknown> {
  const response = await http(url, { headers: { Accept: 'application/json' } })
  if (response.status !== 200) throw new HttpError(response.status, url)
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? ''))
    throw new SchemaError('Expected MET JSON response')
  try {
    return await response.json()
  } catch (cause) {
    throw new SchemaError('Invalid MET JSON response', { cause })
  }
}

export const metWarning = createMetWarningAdapter()
