import { expect, test } from 'vitest'
import { parseMetForecast, parseMetForecastCatalogue } from '../src/adapters/met-forecast-parser'
import { createMetForecastAdapter, metForecastUrl } from '../src/adapters/met-forecast'
import { glossMetForecastPhrase } from '../src/adapters/met-forecast-gloss'
import { HttpError, RateLimitedError, SchemaError } from '../src/errors'
import { capture, context, forecastSource, response } from './met-support'

const raw = () =>
  capture(
    'weather-forecast-kl-20261108T014413Z.json',
    '1a4ec347805b28a3a5492513e922bd91fc177b3b8715c2efcab355d766487877'
  )
const parse = (body: unknown) => parseMetForecast(body, [forecastSource])

test('explicit phrase glosses case-fold without translating unknown or English phrases', () => {
  expect(glossMetForecastPhrase('MENDUNG')).toBe('Cloudy')
  expect(glossMetForecastPhrase('Hujan di kebanyakan tempat')).toBe('Rain in most places')
  expect(glossMetForecastPhrase('Petang dan Malam')).toBe('Afternoon and night')
  for (const phrase of ['unknown provider phrase', 'Cloudy', 'constructor', 'toString'])
    expect(glossMetForecastPhrase(phrase)).toBeUndefined()
})

test('DESIGN standalone menyeluruh gloss is case-insensitive without composing whole-phrase translations', () => {
  for (const phrase of ['menyeluruh', 'MENYELURUH', 'Menyeluruh'])
    expect(glossMetForecastPhrase(phrase)).toBe('Widespread')
  for (const phrase of ['Hujan menyeluruh', 'Ribut petir menyeluruh', 'Menyeluruh di tempat baharu'])
    expect(glossMetForecastPhrase(phrase)).toBeUndefined()
  for (const phrase of ['MENYELURUH', 'Hujan menyeluruh']) {
    // Isolated mutations of the archived provider body keep the raw Malay field verbatim.
    const body = raw()
    body[0]!.afternoon_forecast = phrase
    const original = structuredClone(body)
    const row = parse(body)[0]!
    expect(row.valueText).toBe(phrase)
    expect(row.valueJson.afternoon_forecast).toBe(phrase)
    expect(row.value).toBe(0)
    if (phrase === 'MENYELURUH') expect(row.valueJson.gloss_en.afternoon_forecast).toBe('Widespread')
    else expect(row.valueJson.gloss_en).not.toHaveProperty('afternoon_forecast')
    expect(body).toEqual(original)
  }
})

test('forecast_filters_exact_bound_id_and_preserves_days', () => {
  const body = raw()
  const originalBody = structuredClone(body)
  const rows = parse(body)
  expect(rows).toHaveLength(7)
  expect(rows.map((row) => row.itemKey).sort()).toEqual(
    Array.from({ length: 7 }, (_, i) => `2026-11-${String(i + 8).padStart(2, '0')}`)
  )
  rows.forEach((row, i) => {
    const { gloss_en, ...original } = row.valueJson
    expect(original).toEqual(originalBody[i])
    expect(row.itemKey).toBe(body[i]!.date)
    expect(row.valueText).toBe(body[i]!.afternoon_forecast)
    expect(row.value).toBe(1)
    expect(row.unit).toBeNull()
    expect(gloss_en.afternoon_forecast).toMatch(/^Thunderstorms in (some|most) places$/)
  })
  expect(rows.find((row) => row.itemKey === '2026-11-08')!.observedAt).toBe('2026-11-07T16:00:00.000Z')
  expect(body).toEqual(originalBody)
  // Fault injection uses copies of a real provider body, never runtime fallback data.
  for (const phrase of ['Tiada Hujan', 'unpublished phrase', 'Cloudy']) {
    const changed = raw()
    changed[0]!.afternoon_forecast = phrase
    const row = parse(changed)[0]!
    expect(row.value).toBe(0)
    expect(row.valueText).toBe(phrase)
    if (phrase !== 'Tiada Hujan') expect(row.valueJson.gloss_en).not.toHaveProperty('afternoon_forecast')
  }
  const upper = raw()
  upper[0]!.afternoon_forecast = 'RIBUT PETIR'
  expect(parse(upper)[0]!.value).toBe(1)
  expect(parse(upper)[0]!.valueJson.gloss_en.afternoon_forecast).toBe('Thunderstorms')
})

test('forecast_missing_bound_fields_and_identity_fail', () => {
  for (const field of Object.keys(raw()[0]!)) {
    const body = [raw()[0]!]
    delete body[0]![field]
    expect(() => parse(body), field).toThrow(SchemaError)
  }
  for (const field of ['min_temp', 'max_temp'])
    for (const value of ['23', null, Infinity, NaN, 23.5]) {
      const body = raw()
      body[0]![field] = value
      expect(() => parse(body)).toThrow(SchemaError)
    }
  for (const field of ['location_id', 'location_name']) {
    const body = [raw()[0]!]
    delete (body[0]!.location as Record<string, unknown>)[field]
    expect(() => parse(body)).toThrow(SchemaError)
  }
  for (const field of ['location', 'location_id', 'location_name']) {
    const body = raw()
    if (field === 'location') delete body[0]!.location
    else delete (body[0]!.location as Record<string, unknown>)[field]
    expect(() => parse(body), `ambiguous bound identity ${field}`).toThrow(SchemaError)
  }
  const impossible = raw()
  impossible[0]!.date = '2026-02-30'
  expect(() => parse(impossible)).toThrow(SchemaError)
  expect(() => parse(raw().slice(7))).toThrow(SchemaError)
  expect(() => parse([])).toThrow(SchemaError)
  for (const body of [{ error: 'failure' }, '<html>', null]) expect(() => parse(body)).toThrow(SchemaError)
  const conflict = raw()
  conflict.push({ ...conflict[0], max_temp: 99 })
  expect(() => parse(conflict)).toThrow(SchemaError)
  expect(parse([...raw(), raw()[0]])).toHaveLength(7)
  const other = raw()
  delete other[7]!.date
  delete other[8]!.morning_forecast
  expect(parse(other)).toHaveLength(7)
  expect(parse(raw().slice(1))).toHaveLength(6)
  const extras = raw()
  extras[0]!.extra = { unchanged: true }
  expect(parse(extras)[0]!.valueJson).toMatchObject(extras[0]!)
  for (const sources of [[], [forecastSource, forecastSource], [{ ...forecastSource, kind: 'met_warning' as const }]]) {
    expect(() => parseMetForecast(raw(), sources)).toThrow(SchemaError)
  }
})

test('catalogue derives only published identities and rejects invalid or conflicting rows', () => {
  const discovered = parseMetForecastCatalogue(raw())
  expect(discovered.map((row) => row.externalId)).toEqual(['Ds058', 'St009', 'Tn079'])
  for (const source of discovered)
    expect(source).toMatchObject({ lat: null, lon: null, meta: { location_name: source.name } })
  for (const body of [[], {}, '<html>']) expect(() => parseMetForecastCatalogue(body)).toThrow(SchemaError)
  const bad = raw()
  delete bad[7]!.date
  expect(() => parseMetForecastCatalogue(bad)).toThrow(SchemaError)
  const conflict = raw()
  ;(conflict[1]!.location as Record<string, unknown>).location_name = 'conflicting name'
  expect(() => parseMetForecastCatalogue(conflict)).toThrow(SchemaError)
})

test.each(['location_id', 'location_name'])(
  'catalogue rejects whitespace-only %s before returning sources',
  async (field) => {
    // Fault injection changes copies of the genuine archive, including a mixed catalogue.
    // One day per distinct ID avoids a conflicting-name rejection hiding this regression.
    for (const body of [[raw()[0]!], [raw()[0]!, raw()[7]!, raw()[14]!]]) {
      const badRow = body.at(-1)!
      ;(badRow.location as Record<string, unknown>)[field] = '   '
      expect(() => parseMetForecastCatalogue(body)).toThrow(SchemaError)
      const adapter = createMetForecastAdapter({ discoveryHttp: async () => response(body) })
      await expect(adapter.discover!()).rejects.toBeInstanceOf(SchemaError)
    }
  }
)

test('catalogue preserves nonblank published identity bytes without trimming', () => {
  const body = [raw()[0]!]
  // Isolated mutation proves validation does not normalize valid surrounding whitespace.
  const location = body[0]!.location as Record<string, unknown>
  const publishedId = ' Ds058 '
  const publishedName = '\tKuala Lumpur  '
  location.location_id = publishedId
  location.location_name = publishedName
  const original = structuredClone(body)
  const [source] = parseMetForecastCatalogue(body)
  expect(Buffer.from(source!.externalId)).toEqual(Buffer.from(publishedId))
  expect(Buffer.from(source!.name)).toEqual(Buffer.from(publishedName))
  const [reading] = parseMetForecast(body, [{ ...forecastSource, ...source! }])
  expect(reading!.valueJson.location).toEqual(original[0]!.location)
  expect(body).toEqual(original)
})

test('forecast factory requires injected discovery HTTP and polls through context once', async () => {
  await expect(createMetForecastAdapter().discover!()).rejects.toBeInstanceOf(SchemaError)
  let discoveryCalls = 0
  const adapter = createMetForecastAdapter({
    discoveryHttp: async (url) => {
      discoveryCalls++
      expect(url).toBe('https://api.data.gov.my/weather/forecast/')
      return response(raw())
    }
  })
  expect(await adapter.discover!()).toHaveLength(3)
  expect(discoveryCalls).toBe(1)
  expect(metForecastUrl(forecastSource)).toBe(
    'https://api.data.gov.my/weather/forecast/?contains=Kuala%20Lumpur@location__location_name'
  )
  let calls = 0
  const body = raw()
  expect(
    await adapter.fetch(
      [forecastSource],
      context(async (url) => {
        calls++
        expect(url).toBe(metForecastUrl(forecastSource))
        return response(body)
      })
    )
  ).toBe(body)
  expect(calls).toBe(1)
  expect(adapter.backfill).toBeUndefined()
  for (const status of [302, 429, 500])
    await expect(
      adapter.fetch(
        [forecastSource],
        context(async () => response(body, status))
      )
    ).rejects.toBeInstanceOf(HttpError)
  await expect(
    adapter.fetch(
      [forecastSource],
      context(async () => response('<html>', 200, 'text/html'))
    )
  ).rejects.toBeInstanceOf(SchemaError)
  const failure = new RateLimitedError('datagovmy-weather')
  await expect(
    adapter.fetch(
      [forecastSource],
      context(async () => {
        throw failure
      })
    )
  ).rejects.toBe(failure)
  await expect(
    adapter.fetch(
      [],
      context(async () => {
        throw new Error('must not request')
      })
    )
  ).rejects.toBeInstanceOf(SchemaError)
  expect(adapter).toMatchObject({
    kind: 'met_forecast',
    cadence: 21600,
    apiFamily: 'datagovmy-weather',
    freshness: 'polled',
    batch: 'per_source',
    licence: { id: 'CC-BY-4.0', label: 'MET Malaysia via data.gov.my, CC BY 4.0' }
  })
})
