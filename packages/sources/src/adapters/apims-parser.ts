import type { ReadingInput, Source } from '../contract'
import { SchemaError } from '../errors'

export type ApimsRaw =
  { kind: 'latest'; body: unknown } | { kind: 'history'; body: unknown; through: string; stateId: number }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mytTimestamp(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw))
    throw new SchemaError('Expected offset-less MYT timestamp')
  const ms = Date.parse(`${raw}+08:00`)
  if (!Number.isFinite(ms) || new Date(ms + 8 * 3600_000).toISOString().slice(0, 19) !== raw)
    throw new SchemaError(`Invalid MYT calendar timestamp: ${raw}`)
  return new Date(ms).toISOString()
}

/** Pure, station-local validation: malformed unbound rows do not affect bound sources. */
export function parseApims(raw: ApimsRaw, sources: Source[]): ReadingInput<'apims'>[] {
  return sources.flatMap((source) => {
    try {
      const stateId = source.meta.state_id
      if (
        source.kind !== 'apims' ||
        !source.externalId ||
        typeof stateId !== 'number' ||
        !Number.isSafeInteger(stateId) ||
        stateId <= 0
      )
        throw new SchemaError('Expected APIMS station and positive safe-integer state_id')
      if (!raw || (raw.kind !== 'latest' && raw.kind !== 'history') || !record(raw.body))
        throw new SchemaError('Expected APIMS response object')
      const data = raw.kind === 'latest' ? raw.body.data : raw.body.api_table_hourly
      if (!Array.isArray(data)) throw new SchemaError('Expected APIMS readings array')
      const rows = data.filter(
        (row): row is Record<string, unknown> => record(row) && row.STATION_ID === source.externalId
      )
      if (!rows.length || (raw.kind === 'latest' && rows.length !== 1))
        throw new SchemaError('Expected unique bound station data')
      const through = raw.kind === 'history' ? Date.parse(mytTimestamp(raw.through)) : null
      if (raw.kind === 'history' && (raw.stateId !== stateId || !raw.through.endsWith(':00:00')))
        throw new SchemaError('History anchor or state differs from the bound source')
      const seen = new Set<string>()
      return rows.map((row) => {
        if (
          row.STATE_ID !== stateId ||
          typeof row.API !== 'number' ||
          !Number.isSafeInteger(row.API) ||
          row.API < 0 ||
          typeof row.PARAM_SYMBOL !== 'string' ||
          (raw.kind === 'latest'
            ? typeof row.CLASS !== 'string'
            : Object.hasOwn(row, 'CLASS') && typeof row.CLASS !== 'string')
        )
          throw new SchemaError('Invalid APIMS station/state, API, class or parameter')
        const observedAt = mytTimestamp(raw.kind === 'latest' ? row.RECORD_DT : row.DATETIME)
        if (through !== null && (Date.parse(observedAt) > through || Date.parse(observedAt) < through - 24 * 3600_000))
          throw new SchemaError('History timestamp outside requested inclusive 25-hour window')
        if (seen.has(observedAt)) throw new SchemaError(`Duplicate station-hour: ${observedAt}`)
        seen.add(observedAt)
        return {
          sourceId: source.id,
          metric: 'api',
          observedAt,
          value: row.API,
          unit: 'API',
          valueJson: { param: row.PARAM_SYMBOL, ...(typeof row.CLASS === 'string' ? { class: row.CLASS } : {}) }
        }
      })
    } catch (cause) {
      if (!(cause instanceof SchemaError)) throw cause
      throw new SchemaError(`APIMS ${source.externalId} (${source.id}): ${cause.message}`, { cause })
    }
  })
}
