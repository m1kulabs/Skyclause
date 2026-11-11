import { expect, test, vi } from 'vitest'
import { adapters, getAdapter } from '../src/adapters'
import { createMetForecastAdapter, metForecast, metForecastUrl } from '../src/adapters/met-forecast'
import { metWarning } from '../src/adapters/met-warning'
import { SchemaError } from '../src/errors'
import { capture, forecastSource, response } from './met-support'

const raw = () =>
  capture(
    'weather-forecast-all-20261111T140148Z.json',
    '4cfd224c629aaf6f4655d613b8624f5543251659da8c414146b492b2dfeec5f1'
  )

test('discovery_uses_published_identities_without_coordinates', async () => {
  const body = raw()
  const http = vi.fn(async () => response(body))
  const discovered = await createMetForecastAdapter({ discoveryHttp: http }).discover!()
  const identities = new Map(
    body.map((row) => {
      const location = row.location as { location_id: string; location_name: string }
      return [location.location_id, location.location_name]
    })
  )
  expect(body).toHaveLength(3080)
  expect(identities.size).toBe(440)
  expect(discovered).toEqual(
    [...identities].map(([externalId, name]) => ({
      externalId,
      name,
      lat: null,
      lon: null,
      url: 'https://api.data.gov.my/weather/forecast/',
      meta: { location_name: name }
    }))
  )
  expect(http).toHaveBeenCalledExactlyOnceWith('https://api.data.gov.my/weather/forecast/', {
    headers: { Accept: 'application/json' }
  })
  for (const invalid of [[], {}, { data: body }, null])
    await expect(
      createMetForecastAdapter({ discoveryHttp: async () => response(invalid) }).discover!()
    ).rejects.toBeInstanceOf(SchemaError)
  for (const field of ['location_id', 'location_name']) {
    const changed = structuredClone(body)
    delete (changed[0]!.location as Record<string, unknown>)[field]
    await expect(
      createMetForecastAdapter({ discoveryHttp: async () => response(changed) }).discover!()
    ).rejects.toBeInstanceOf(SchemaError)
  }
  const conflict = structuredClone(body)
  conflict.push({
    ...conflict[0],
    location: { ...(conflict[0]!.location as object), location_name: 'conflicting published name' }
  })
  await expect(
    createMetForecastAdapter({ discoveryHttp: async () => response(conflict) }).discover!()
  ).rejects.toBeInstanceOf(SchemaError)
  const globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected HTTP'))
  try {
    await expect(createMetForecastAdapter().discover!()).rejects.toBeInstanceOf(SchemaError)
    expect(await metWarning.discover!()).toEqual([
      {
        externalId: 'met-warnings',
        name: 'MET Malaysia warnings',
        lat: null,
        lon: null,
        url: 'https://api.data.gov.my/weather/warning/',
        meta: {}
      }
    ])
    expect(globalFetch).not.toHaveBeenCalled()
  } finally {
    globalFetch.mockRestore()
  }
})

test('canonical MET registrations preserve metadata and trailing-slash name query', () => {
  for (const [kind, adapter, cadence, batch] of [
    ['met_warning', metWarning, 600, 'all_bound'],
    ['met_forecast', metForecast, 21600, 'per_source']
  ] as const) {
    expect(getAdapter(kind)).toBe(adapter)
    expect(adapters.filter((candidate) => candidate.kind === kind)).toHaveLength(1)
    expect(adapter).toMatchObject({
      cadence,
      batch,
      freshness: 'polled',
      apiFamily: 'datagovmy-weather',
      licence: { id: 'CC-BY-4.0', label: 'MET Malaysia via data.gov.my, CC BY 4.0' }
    })
  }
  const url = new URL(metForecastUrl(forecastSource))
  expect(url.pathname).toBe('/weather/forecast/')
  expect(url.searchParams.get('contains')).toBe('Kuala Lumpur@location__location_name')
  expect(url.searchParams.has('location_id')).toBe(false)
})
