import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { adapters, HttpError, NetworkError, RateLimitedError, SchemaError } from '@skyclause/sources'
import { createMetForecastAdapter } from '../../../packages/sources/src/adapters/met-forecast'
import { metWarning } from '../../../packages/sources/src/adapters/met-warning'
import { forecastSource, warningSource } from '../../../packages/sources/test/met-support'
import { createPollContext } from '../src/sources/http'
import { configureMetDiscovery } from '../src/sources/met'
import { createSourceJobs } from '../src/sources/jobs'
import { decodeObject, encodeObject } from '../src/sources/storage'
import { MemoryStore, TestClock, flush } from './support/source-adapter'

const catalogue = readFileSync(
  new URL('../../../packages/sources/test/fixtures/weather-forecast-all-20261111T140148Z.json', import.meta.url)
)
const ports = () => {
  const store = new MemoryStore(),
    clock = new TestClock()
  let sequence = 0
  return {
    store,
    scratch: store,
    clock,
    id: () => `met-${++sequence}`,
    userAgent: 'Skyclause/test',
    log: vi.fn(),
    http: vi.fn(async () => new Response(catalogue, { headers: { 'content-type': 'application/json' } }))
  }
}

test('discovery_shares_weather_budget_with_both_adapters_and_probes', async () => {
  const p = ports()
  const make = (sources = [forecastSource]) =>
    createPollContext({
      kind: sources[0]?.kind ?? 'met_forecast',
      family: 'datagovmy-weather',
      sources,
      storage: { get: async () => null, put: async () => {} },
      budget: p.store,
      http: p.http,
      userAgent: p.userAgent,
      periods: async () => [],
      log: p.log,
      clock: p.clock,
      requestId: p.id
    })
  const warning = make([warningSource])
  await metWarning.fetch([warningSource], warning.ctx)
  const forecast = make()
  await createMetForecastAdapter().fetch([forecastSource], forecast.ctx)
  const configured = configureMetDiscovery(adapters, p)
  const discovery = configured.find((adapter) => adapter.kind === 'met_forecast')!
  await discovery.discover!()
  const sid = '00000000-0000-7000-8000-000000000001'
  await p.store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: p.clock.now().toISOString(),
      periods: [],
      sources: [
        {
          source: { ...forecastSource, id: sid },
          bindings: [{ orgId: sid, projectId: sid }],
          previousPollDigest: null,
          previousBackfillDigest: null
        }
      ]
    }),
    '0'
  )
  const publish = vi.fn()
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('database forbidden')
    }),
    catalogue: vi.fn(async () => {
      throw new Error('database forbidden')
    })
  }
  const jobs = createSourceJobs({ ...p, adapters: [discovery], database, publish })
  await jobs.adapterContracts()
  expect(p.log).toHaveBeenCalledWith('source.contract.passed', { adapter: 'met_forecast' })
  expect(publish).not.toHaveBeenCalled()
  expect(database.snapshot).not.toHaveBeenCalled()
  expect(database.catalogue).not.toHaveBeenCalled()
  const claims = () =>
    decodeObject<{ requests: { requestId: string; startedAt: number }[] }>(
      p.store.objects.get('control/budgets/datagovmy-weather.json')!.body
    ).requests
  expect(claims()).toHaveLength(4)
  expect(new Set(claims().map((claim) => claim.requestId)).size).toBe(4)
  expect(claims().every((claim) => claim.startedAt === p.clock.now().getTime())).toBe(true)
  const restarted = configureMetDiscovery(adapters, p).find((adapter) => adapter.kind === 'met_forecast')!
  const denied = expect(restarted.discover!()).rejects.toBeInstanceOf(RateLimitedError)
  await flush()
  await p.clock.advance(19999)
  expect(p.http).toHaveBeenCalledTimes(4)
  await p.clock.advance(1)
  await denied
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.request',
    expect.objectContaining({
      sourceIds: [],
      httpStatus: null,
      admissionMs: 20000,
      error: { type: 'rate_limited', message: expect.any(String) }
    })
  )
  await p.clock.advance(40000)
  const stillHeld = make([])
  const held = expect(stillHeld.ctx.http('https://api.data.gov.my/weather/forecast/')).rejects.toBeInstanceOf(
    RateLimitedError
  )
  await flush()
  await p.clock.advance(20000)
  await held
  expect(p.http).toHaveBeenCalledTimes(4)
  const next = make([])
  await next.ctx.http('https://api.data.gov.my/weather/forecast/')
  expect(p.http).toHaveBeenCalledTimes(5)
  expect(claims()).toHaveLength(1)
  for (const context of [warning, forecast, stillHeld, next]) await context.closeAndDrain()
})

test.each([301, 429, 500, null])('discovery retains actual %s status with no retries', async (status) => {
  const p = ports()
  p.http = vi.fn(async () => {
    if (status === null) throw new Error('transport down')
    return new Response('provider failure', { status })
  })
  const configured = configureMetDiscovery(adapters, p)
  await expect(configured.find((adapter) => adapter.kind === 'met_forecast')!.discover!()).rejects.toBeInstanceOf(
    status === null ? NetworkError : HttpError
  )
  expect(p.http).toHaveBeenCalledTimes(1)
  expect(p.clock.sleepers).toHaveLength(0)
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.request',
    expect.objectContaining({ adapter: 'met_forecast', sourceIds: [], httpStatus: status, error: expect.any(Object) })
  )
})

test('configured discovery drains and logs captures before catalogue writes; failure preserves catalogue', async () => {
  const p = ports()
  const configured = configureMetDiscovery(adapters, p)
  for (const adapter of adapters)
    if (adapter.kind !== 'met_forecast')
      expect(configured.find((candidate) => candidate.kind === adapter.kind)).toBe(adapter)
  const forecast = configured.find((adapter) => adapter.kind === 'met_forecast')!
  expect(forecast).not.toBe(adapters.find((adapter) => adapter.kind === 'met_forecast'))
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('unexpected snapshot')
    }),
    catalogue: vi.fn(async () => {
      expect(p.log).toHaveBeenCalledWith(
        'source.discovery.request',
        expect.objectContaining({
          adapter: 'met_forecast',
          sourceIds: [],
          httpStatus: 200,
          bodySha256: '4cfd224c629aaf6f4655d613b8624f5543251659da8c414146b492b2dfeec5f1',
          bodyBytes: catalogue.byteLength
        })
      )
      expect(p.clock.sleepers).toHaveLength(0)
    })
  }
  const publish = vi.fn()
  const jobs = createSourceJobs({ ...p, adapters: [forecast], database, publish })
  await jobs.catalogueSync()
  expect(database.catalogue).toHaveBeenCalledExactlyOnceWith(
    forecast,
    expect.arrayContaining([expect.objectContaining({ externalId: 'Ds058' })])
  )
  expect(database.snapshot).not.toHaveBeenCalled()
  expect(publish).not.toHaveBeenCalled()
  p.http.mockImplementation(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))
  await expect(jobs.catalogueSync()).rejects.toBeInstanceOf(SchemaError)
  expect(database.catalogue).toHaveBeenCalledTimes(1)
  expect(p.log).toHaveBeenCalledWith(
    'source.discovery.failed',
    expect.objectContaining({ adapter: 'met_forecast', error: expect.any(String) })
  )
  const source = readFileSync(new URL('../src/sources/index.ts', import.meta.url), 'utf8')
  expect(source).toContain('configureMetDiscovery(adapters,')
  expect(source).toContain('adapters: configuredAdapters')
  expect(source).toContain('sourceIngestionDatabase(configuredAdapters)')
})
