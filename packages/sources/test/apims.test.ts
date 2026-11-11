import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import type { PollContext, Source } from '../src/contract'
import { SchemaError, TimeoutError } from '../src/errors'
import { createApimsAdapter } from '../src/adapters/apims'
import { parseApims, type ApimsRaw } from '../src/adapters/apims-parser'

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const raw = fixture('mapcaqm-20261105T1313Z.json')
const ids = ['CA16W', 'CA19B', 'CA17W']
const states = [14, 10, 16]
const sources: Source[] = ids.map((externalId, i) => ({
  id: `apims-${externalId}`,
  kind: 'apims',
  externalId,
  name: externalId,
  lat: null,
  lon: null,
  url: 'https://untrusted.example/redirect?stateid=999',
  meta: { state_id: states[i]! }
}))
const latest = (body: unknown): ApimsRaw => ({ kind: 'latest', body })
const history = (body: unknown, stateId = 14, through = '2026-11-03T23:00:00'): ApimsRaw => ({
  kind: 'history',
  body,
  stateId,
  through
})
const historyBody = () => fixture('apitablehourly-state14-20261103T230000-20261107T080610Z.json')
const stationRow = () => structuredClone(raw.data.find((r: { STATION_ID: string }) => r.STATION_ID === ids[0]))

test('map capture produces three verbatim readings', () => {
  const readings = parseApims(latest(raw), sources)
  expect(readings.map((r) => r.sourceId)).toEqual(sources.map((s) => s.id))
  expect(readings.map((r) => r.value)).toEqual([67, 57, 62])
  for (const [i, reading] of readings.entries()) {
    expect(reading).toMatchObject({
      metric: 'api',
      unit: 'API',
      observedAt: '2026-11-05T13:00:00.000Z',
      valueJson: {
        class: 'Moderate',
        param: raw.data.find((r: { STATION_ID: string }) => r.STATION_ID === ids[i]).PARAM_SYMBOL
      }
    })
  }
})

describe('station-local latest validation', () => {
  test.each([null, -1, '67', 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])('rejects API %s', (API) => {
    expect(() => parseApims(latest({ data: [{ ...stationRow(), API }] }), [sources[0]!])).toThrow(/CA16W.*apims-CA16W/)
  })
  test.each([undefined, null, [], {}, 'invalid'])('rejects missing global data %#', (body) => {
    for (const source of sources) expect(() => parseApims(latest(body), [source])).toThrow(SchemaError)
  })
  test.each([
    { RECORD_DT: '2026-02-30T21:00:00' },
    { RECORD_DT: '2026-11-05T24:00:00' },
    { RECORD_DT: '2026-11-05T21:60:00' },
    { RECORD_DT: '2026-11-05T21:00:60' },
    { RECORD_DT: '2026-11-05T21:00:00Z' },
    { RECORD_DT: '2026-11-05T21:00:00+08:00' },
    { RECORD_DT: null },
    { STATE_ID: 10 },
    { CLASS: undefined },
    { CLASS: null },
    { PARAM_SYMBOL: null }
  ])('rejects malformed bound row %j', (change) => {
    expect(() => parseApims(latest({ data: [{ ...stationRow(), ...change }] }), [sources[0]!])).toThrow(SchemaError)
  })
  test('missing or duplicate station fails only that source; zero and malformed unbound rows survive individually', () => {
    const body = structuredClone(raw)
    body.data = body.data.filter((r: { STATION_ID: string }) => r.STATION_ID !== ids[1])
    body.data.find((r: { STATION_ID: string }) => r.STATION_ID === ids[0]).API = 0
    body.data.push(null, {}, { STATION_ID: 'unbound', API: 'invalid' })
    expect(parseApims(latest(body), [sources[0]!])[0]!.value).toBe(0)
    expect(parseApims(latest(body), [sources[2]!])[0]!.value).toBe(62)
    expect(() => parseApims(latest(body), [sources[1]!])).toThrow(/CA19B.*apims-CA19B/)
    body.data.push(stationRow())
    expect(() => parseApims(latest(body), [sources[0]!])).toThrow(SchemaError)
    expect(parseApims(latest(body), [sources[2]!])).toHaveLength(1)
  })
  test.each([undefined, null, '14', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe bound state %s',
    (state_id) => {
      expect(() => parseApims(latest(raw), [{ ...sources[0]!, meta: { state_id } } as Source])).toThrow(SchemaError)
    }
  )
})

describe('real history', () => {
  test.each(sources.map((source, i) => [source, states[i]!] as const))(
    'preserves three real overlapping days for $externalId',
    (source, stateId) => {
      const rows = [1, 2, 3].flatMap((day) => {
        const name = `apitablehourly-state${stateId}-2026110${day}T230000-20261107T0806${stateId === 16 ? '11' : '10'}Z.json`
        const body = fixture(name)
        const result = parseApims(history(body, stateId, `2026-11-0${day}T23:00:00`), [source])
        expect(result).toHaveLength(25)
        expect(result.every((r) => !Object.hasOwn(r.valueJson, 'class'))).toBe(true)
        expect(result.map((r) => r.valueJson.param)).toEqual(
          body.api_table_hourly
            .filter((r: { STATION_ID: string }) => r.STATION_ID === source.externalId)
            .map((r: { PARAM_SYMBOL: string }) => r.PARAM_SYMBOL)
        )
        return result
      })
      expect(rows).toHaveLength(75)
      expect(new Set(rows.map((r) => r.observedAt)).size).toBe(73)
      expect(rows.filter((r) => r.observedAt.endsWith('22:00:00.000Z'))).toHaveLength(3)
    }
  )
  test.each(sources.map((source, i) => [source, states[i]!] as const))(
    'fresh recon verifies one day for $externalId',
    (source, stateId) => {
      const body = fixture(`apitablehourly-state${stateId}-20261110T141922Z.json`)
      expect(parseApims(history(body, stateId, '2026-11-10T22:00:00'), [source])).toHaveLength(25)
    }
  )
  test.each([
    { DATETIME: '2026-11-02T22:00:00' },
    { DATETIME: '2026-11-04T00:00:00' },
    { DATETIME: '2026-02-30T21:00:00' },
    { STATE_ID: 10 },
    { API: null },
    { API: -1 },
    { API: '65' },
    { API: 1.5 },
    { API: Number.MAX_SAFE_INTEGER + 1 },
    { API: Infinity },
    { PARAM_SYMBOL: undefined },
    { CLASS: null }
  ])('rejects malformed station history %j without partial rows', (change) => {
    const body = historyBody()
    Object.assign(
      body.api_table_hourly.find((r: { STATION_ID: string }) => r.STATION_ID === ids[0]),
      change
    )
    expect(() => parseApims(history(body), [sources[0]!])).toThrow(/CA16W.*apims-CA16W/)
  })
  test('requires array, bound station/state and unique hours; accepts sparse real series without inventing rows', () => {
    for (const body of [{}, { api_table_hourly: null }, { api_table_hourly: [] }])
      expect(() => parseApims(history(body), [sources[0]!])).toThrow(SchemaError)
    expect(() => parseApims(history(historyBody(), 10), [sources[0]!])).toThrow(SchemaError)
    const body = historyBody()
    const row = body.api_table_hourly.find((r: { STATION_ID: string }) => r.STATION_ID === ids[0])
    body.api_table_hourly.push(row)
    expect(() => parseApims(history(body), [sources[0]!])).toThrow(SchemaError)
    expect(
      parseApims(history({ api_table_hourly: [{ ...row, API: 0 }, null, { STATION_ID: 'unbound' }] }), [sources[0]!])
    ).toEqual([expect.objectContaining({ value: 0, valueJson: { param: '**' } })])
  })
})

test('factory fetch uses only the captured context and fixed official map URI once', async () => {
  const adapter = createApimsAdapter()
  const http = vi.fn<PollContext['http']>().mockResolvedValue({
    status: 200,
    headers: new Headers(),
    json: async () => raw,
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0)
  })
  const ctx = { http } as unknown as PollContext
  expect(await adapter.fetch(sources, ctx)).toEqual(latest(raw))
  expect(http).toHaveBeenCalledExactlyOnceWith('https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm', {
    headers: { Accept: 'application/json' }
  })
  expect(adapter).toMatchObject({
    kind: 'apims',
    batch: 'all_bound',
    parseMode: 'per_source',
    cadence: 3600,
    freshness: 'observed',
    licence: { id: null, label: 'No published terms found (5 Nov 2026)' },
    latestSlot: { seconds: 900 }
  })
  expect(adapter.indicators).toEqual([
    { name: 'site.api_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' },
    { name: 'site.api_0600_min_last3_max', celType: 'int', unit: 'API', scope: 'site', sourceKind: 'apims' }
  ])
  const error = new TimeoutError('map')
  http.mockRejectedValue(error)
  await expect(adapter.fetch([], ctx)).rejects.toBe(error)
  expect(http).toHaveBeenCalledTimes(2)
})
