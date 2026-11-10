import { expect, test, vi } from 'vitest'
import { createSourceJobs } from '../src/sources/jobs'
import { MemoryStore, TestClock, adapter, source } from './support/source-adapter'
import { encodeObject } from '../src/sources/storage'
import type { SourceExecutionResult } from '../src/sources/types'
import { registry } from '../src/registry'

const sid = '00000000-0000-7000-8000-000000000001'
function setup() {
  const store = new MemoryStore(),
    clock = new TestClock()
  let seq = 10
  const publish = vi.fn(async (_result: SourceExecutionResult) => {}),
    http = vi.fn(async () => new Response('{}'))
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('database forbidden')
    }),
    catalogue: vi.fn(async () => {})
  }
  const a = adapter({ parse: () => [] })
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    adapters: [a],
    http,
    userAgent: 'Skyclause test',
    publish,
    database,
    log: vi.fn()
  })
  return { jobs, store, clock, publish, http, database }
}
async function plan(t: ReturnType<typeof setup>) {
  await t.store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: t.clock.now().toISOString(),
      sources: [
        {
          source: source(sid),
          bindings: [{ orgId: sid, projectId: sid }],
          previousPollDigest: null,
          previousBackfillDigest: null
        }
      ],
      periods: []
    }),
    '0'
  )
}
test('real registry dispatches sources jobs and only batch ingestion is registered', () => {
  expect(registry.jobs.adapter).toBeTypeOf('function')
  expect(registry.jobs['catalogue-sync']).toBeTypeOf('function')
  expect(registry.jobs['adapter-contracts']).toBeTypeOf('function')
  expect(registry.batch['sources-ingest']).toBeTypeOf('function')
  expect(registry.topics['poll-results']).toBeUndefined()
})
test('minute execution uses only durable plan, HTTP and publish; scheduled slot is retained', async () => {
  const t = setup()
  await plan(t)
  await t.jobs.runAdapter('jps_rain', '2026-11-09T23:59:00.000Z')
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.database.snapshot).not.toHaveBeenCalled()
  expect(t.publish.mock.calls[0]?.[0]).toMatchObject({ scheduledAt: '2026-11-09T23:59:00.000Z' })
})
test('missing plan and unknown adapter fail before HTTP; manual slots are null', async () => {
  const t = setup()
  await expect(t.jobs.runAdapter('jps_rain', null)).rejects.toThrow('plan')
  await expect(t.jobs.runAdapter('pi', null)).rejects.toThrow('unregistered')
  await plan(t)
  await t.jobs.runAdapter('jps_rain', null)
  expect(t.publish.mock.calls[0]?.[0]).toMatchObject({ scheduledAt: null })
})

import { activePeriods, readSourcePlan } from '../src/sources/plan'
import { runJob } from '../src/server'
test('registry rejects invalid adapter CLI and missing runtime config without credentials', async () => {
  await expect(runJob(registry, 'adapter', [])).rejects.toThrow('usage')
  await expect(runJob(registry, 'adapter', ['jps_rain', '--scheduled-at', 'bad'])).rejects.toThrow()
  await expect(runJob(registry, 'catalogue-sync', [])).rejects.toThrow('SOURCES_BUCKET')
})
test('a period opening between refreshes uses current half-open interval time', () => {
  const period = {
    id: sid,
    projectId: sid,
    state: 'upcoming' as const,
    arrivalStart: '2026-11-10T00:05:00Z',
    arrivalEnd: '2026-11-10T00:10:00Z',
    exitStart: null,
    exitEnd: null
  }
  expect(activePeriods([period], new Date('2026-11-10T00:00:00Z'))).toEqual([])
  expect(activePeriods([period], new Date('2026-11-10T00:05:00Z'))).toEqual([period])
  expect(activePeriods([period], new Date('2026-11-10T00:10:00Z'))).toEqual([])
})
test('schema-invalid plans fail before HTTP', async () => {
  const t = setup()
  await t.store.write('control/plan.json', encodeObject({ version: 8, sources: [] }), '0')
  await expect(readSourcePlan(t.store)).rejects.toThrow()
  expect(t.http).not.toHaveBeenCalled()
})
test('catalogue discovery failure never calls a database writer', async () => {
  const store = new MemoryStore(),
    catalogue = vi.fn(async () => {}),
    log = vi.fn()
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock: new TestClock(),
    id: () => sid,
    adapters: [
      adapter({
        discover: async () => {
          throw new Error('provider unavailable')
        }
      })
    ],
    http: fetch,
    userAgent: 'test',
    publish: async () => {},
    database: {
      snapshot: async () => {
        throw new Error('not used')
      },
      catalogue
    },
    log
  })
  await expect(jobs.catalogueSync()).rejects.toThrow('provider unavailable')
  expect(catalogue).not.toHaveBeenCalled()
})
test('empty registry reports zero contracts and discoveries; failed probes log and reject', async () => {
  const store = new MemoryStore(),
    log = vi.fn(),
    clock = new TestClock()
  const ports = {
    store,
    scratch: store,
    clock,
    id: () => sid,
    adapters: [],
    http: async () => new Response('bad', { status: 500 }),
    userAgent: 'test',
    publish: async () => {},
    database: {
      snapshot: async () => {
        throw new Error('not used')
      },
      catalogue: async () => {}
    },
    log
  }
  const empty = createSourceJobs(ports)
  await empty.catalogueSync()
  await empty.adapterContracts()
  expect(log).toHaveBeenCalledWith('source.contracts.complete', { adapters: 0 })
  const t = setup()
  await plan(t)
  const bytes = (await t.store.read('control/plan.json'))!.body
  await store.write('control/plan.json', bytes, '0')
  const jobs = createSourceJobs({ ...ports, adapters: [adapter()] })
  await expect(jobs.adapterContracts()).rejects.toThrow('Source contracts failed')
  expect(log).toHaveBeenCalledWith('source.contract.failed', expect.objectContaining({ adapter: 'jps_rain' }))
})

import { sourcePart } from '../src/sources/index'
import { defineRegistry } from '../src/server'
test('source WorkerPart dispatches real adapter arguments through runJob', async () => {
  const t = setup()
  await plan(t)
  const part = sourcePart(() => ({
    jobs: t.jobs,
    store: t.store,
    repair: async () => {},
    subscription: { pullSourceResults: async () => [], ackSourceResults: async () => {} },
    ingest: async () => {}
  }))
  await runJob(defineRegistry([part]), 'adapter', ['jps_rain', '--scheduled-at', '2026-11-09T23:59:00.000Z'])
  expect(t.publish.mock.calls[0]?.[0]).toMatchObject({ scheduledAt: '2026-11-09T23:59:00.000Z' })
})
