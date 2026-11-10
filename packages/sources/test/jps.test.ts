import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import type { PollContext, Source } from '../src/contract'
import { SOURCE_METRICS } from '../src/contract'
import { HttpError, SchemaError, TimeoutError } from '../src/errors'
import { jpsGraphUrl, jpsRain } from '../src/adapters/jps'
import { parseJpsRainfall } from '../src/adapters/jps-parser'

const bytes = readFileSync(new URL('./fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url))
const raw = JSON.parse(bytes.toString())
const source: Source = {
  id: '019a5300-0000-7000-8000-000000000001',
  kind: 'jps_rain',
  externalId: '0232901RF',
  name: 'SG. KUYOH DI LRT BUKIT JALIL',
  lat: null,
  lon: null,
  url: 'https://untrusted.example/redirect',
  meta: { jps_id: 75 }
}
const url = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
const payload = (data: unknown) => ({ stationId: source.externalId, data })
const row = { timestamp: '2026-11-02T15:00:00', rf: 9.5 }

function context() {
  const http = vi.fn<PollContext['http']>().mockResolvedValue({
    status: 200,
    headers: new Headers(),
    json: async () => raw,
    text: async () => bytes.toString(),
    arrayBuffer: async () => new ArrayBuffer(0)
  })
  const budget = { take: vi.fn<PollContext['budget']['take']>() }
  return { http, budget, ctx: { http, budget } as unknown as PollContext }
}

describe('published JPS graph', () => {
  test('preserves the capture and converts the complete five-minute window to metric readings', () => {
    expect(bytes.length).toBe(127043)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      '25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95'
    )
    const readings = parseJpsRainfall(raw, source)
    expect(readings).toHaveLength(2269)
    expect(readings[0]!.observedAt).toBe('2026-10-28T16:00:00.000Z')
    expect(readings.at(-1)!.observedAt).toBe('2026-11-05T13:00:00.000Z')
    for (const [i, reading] of readings.entries()) {
      expect(reading.sourceId).toBe(source.id)
      expect(reading.metric).toBe('rain_5m_mm')
      expect(reading.unit).toBe(SOURCE_METRICS.jps_rain.rain_5m_mm.unit)
      expect(SOURCE_METRICS.jps_rain.rain_5m_mm.value_json.parse(reading.valueJson)).toBeNull()
      if (i) expect(Date.parse(reading.observedAt) - Date.parse(readings[i - 1]!.observedAt)).toBe(300000)
    }
    expect(readings.find((r) => r.observedAt === '2026-11-02T07:00:00.000Z')!.value).toBe(9.5)
    const sum = (end: string) =>
      readings
        .filter((r) => r.observedAt > '2026-11-02T06:00:00.000Z' && r.observedAt <= end)
        .reduce((total, r) => total + r.value!, 0)
    expect(sum('2026-11-02T07:00:00.000Z')).toBe(39)
    expect(sum('2026-11-02T08:00:00.000Z')).toBe(63)
    expect(jpsRain.parse(raw, [source])).toEqual(readings)
  })

  test.each([
    null,
    [],
    'bad',
    {},
    { stationId: 'other', data: [] },
    { ...raw, data: undefined, readings: raw.data },
    payload(null),
    payload([null]),
    payload([[]]),
    payload([{}]),
    payload([{ ...row, rf: '9.5' }]),
    ...[NaN, Infinity, -Infinity].map((rf) => payload([{ ...row, rf }]))
  ])('rejects invalid graph shape or rain %#', (value) => {
    expect(() => parseJpsRainfall(value, source)).toThrow(SchemaError)
  })

  test.each([
    '2026-02-30T15:00:00',
    '2026-11-02T24:00:00',
    '2026-11-02T15:60:00',
    '2026-11-02T15:00:60',
    '2026-11-02T15:00:00Z',
    '2026-11-02T15:00:00+07:00',
    'bad',
    null
  ])('rejects invalid or unsupported timestamp %s', (timestamp) => {
    expect(() => parseJpsRainfall(payload([{ ...row, timestamp }]), source)).toThrow(SchemaError)
  })

  test('uses MYT midnight, accepts +08:00 and collapses only identical duplicates', () => {
    const midnight = { timestamp: '2026-11-02T00:00:00', rf: 0 }
    const equivalent = { ...midnight, timestamp: midnight.timestamp + '+08:00' }
    expect(parseJpsRainfall(payload([midnight, equivalent]), source)).toEqual([
      {
        sourceId: source.id,
        metric: 'rain_5m_mm',
        observedAt: '2026-11-01T16:00:00.000Z',
        value: 0,
        unit: 'mm',
        valueJson: null
      }
    ])
    expect(() => parseJpsRainfall(payload([midnight, { ...equivalent, rf: 1 }]), source)).toThrow(SchemaError)
    expect(parseJpsRainfall(payload([]), source)).toEqual([])
  })
})

describe('JPS HTTP adapter', () => {
  test('uses a fixed official URL and metadata', () => {
    expect(jpsGraphUrl(source)).toBe(url)
    expect(jpsRain).toMatchObject({
      kind: 'jps_rain',
      cadence: 300,
      freshness: 'observed',
      batch: 'per_source',
      licence: { id: null, label: 'No published terms found (5 Nov 2026)' }
    })
    expect(jpsRain).not.toHaveProperty('apiFamily')
  })

  test.each([undefined, null, '75', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity])(
    'rejects invalid station ID %s before HTTP',
    async (jps_id) => {
      const invalid = { ...source, meta: { jps_id } } as Source
      const { ctx, http } = context()
      expect(() => jpsGraphUrl(invalid)).toThrow(SchemaError)
      await expect(jpsRain.fetch([invalid], ctx)).rejects.toThrow(SchemaError)
      expect(http).not.toHaveBeenCalled()
    }
  )

  test('fetch and backfill each perform one JSON GET and consume no family budget', async () => {
    for (const operation of ['fetch', 'backfill'] as const) {
      const { ctx, http, budget } = context()
      const result = operation === 'fetch' ? await jpsRain.fetch([source], ctx) : await jpsRain.backfill!(source, ctx)
      expect(result).toBe(raw)
      expect(http).toHaveBeenCalledExactlyOnceWith(url, { headers: { Accept: 'application/json' } })
      expect(budget.take).not.toHaveBeenCalled()
    }
  })

  test.each([{ sources: [] }, { sources: [source, source] }])(
    'requires exactly one bound source %#',
    async ({ sources }) => {
      const { ctx, http } = context()
      await expect(jpsRain.fetch(sources, ctx)).rejects.toThrow(SchemaError)
      expect(() => jpsRain.parse(raw, sources)).toThrow(SchemaError)
      expect(http).not.toHaveBeenCalled()
    }
  )

  test.each([new HttpError(500, url), new TimeoutError(url)])(
    'propagates transport failure without retry %#',
    async (error) => {
      const { ctx, http } = context()
      http.mockRejectedValue(error)
      await expect(jpsRain.fetch([source], ctx)).rejects.toBe(error)
      expect(http).toHaveBeenCalledTimes(1)
    }
  )
})
