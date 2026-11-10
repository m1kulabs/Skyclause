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

test.each([false, true])('running backfills defer only their own sources (has ready peer: %s)', async (readyPeer) => {
  const store = new MemoryStore(),
    clock = new TestClock(),
    readyId = '00000000-0000-7000-8000-000000000002'
  const polled: string[][] = [],
    backfilled: string[] = [],
    published: SourceExecutionResult[] = []
  let seq = 100
  const a = adapter({
    apiFamily: undefined,
    fetch: async (sources, ctx) => {
      polled.push(sources.map((s) => s.id))
      return (await ctx.http(sources[0]!.url)).json()
    },
    backfill: async (source, ctx) => {
      backfilled.push(source.id)
      return (await ctx.http(source.url)).json()
    },
    parse: () => []
  })
  await store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: clock.now().toISOString(),
      sources: (readyPeer ? [sid, readyId] : [sid]).map((id) => ({
        source: source(id),
        bindings: [{ orgId: sid, projectId: sid }],
        previousPollDigest: null,
        previousBackfillDigest: null
      })),
      periods: []
    }),
    '0'
  )
  await store.write(
    `control/backfills/${sid}.json`,
    encodeObject({
      state: 'running',
      operationId: sid,
      owner: sid,
      leaseExpiresAt: clock.now().getTime() + 60000,
      resultPath: 'control/results/held.json',
      scheduledAt: null
    }),
    '0'
  )
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: () => `00000000-0000-7000-8000-${String(++seq).padStart(12, '0')}`,
    adapters: [a],
    http: async () => new Response('{}'),
    userAgent: 'test',
    publish: async (result) => {
      published.push(result)
    },
    database: {
      snapshot: async () => {
        throw new Error('database forbidden')
      },
      catalogue: async () => {}
    },
    log: () => {}
  })
  await jobs.runAdapter('jps_rain', null)
  expect(polled).toEqual(readyPeer ? [[readyId]] : [])
  expect(backfilled).toEqual(readyPeer ? [readyId] : [])
  expect(
    published
      .filter((result) => result.purpose === 'poll')
      .flatMap((result) => result.polls.map((poll) => poll.sourceId))
  ).toEqual(readyPeer ? [readyId] : [])
})

import { randomUUID } from 'node:crypto'
import { MAX_PENDING_RESULTS, publishSourceResult } from '../src/sources/pubsub'
async function boundedJobs(backfill = false) {
  const store = new MemoryStore(),
    clock = new TestClock(),
    published: SourceExecutionResult[] = []
  let calls = 0
  const a = adapter({
    apiFamily: undefined,
    parse: () => [],
    ...(backfill
      ? {
          backfill: async (
            source: import('@skyclause/sources').Source,
            ctx: import('@skyclause/sources').PollContext
          ) => (await ctx.http(source.url)).json()
        }
      : {})
  })
  await store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: clock.now().toISOString(),
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
  await store.write(
    'control/pending-results.json',
    encodeObject(
      Array.from({ length: MAX_PENDING_RESULTS - 1 }, () => {
        const id = randomUUID()
        return {
          operation_id: id,
          kind: 'jps_rain',
          object_path: `control/deliveries/jps_rain/${id}.json`,
          sha256: 'a'.repeat(64)
        }
      })
    ),
    '0'
  )
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [a],
    http: async () => {
      calls++
      return new Response('{}')
    },
    userAgent: 'test',
    publish: async (result) => {
      await publishSourceResult(result, { store, publish: async () => {} })
      published.push(result)
    },
    database: {
      snapshot: async () => {
        throw new Error('database forbidden')
      },
      catalogue: async () => {}
    },
    log: () => {}
  })
  return { store, jobs, published, calls: () => calls }
}
test('concurrent jobs reserve the final outbox slot before any HTTP capture', async () => {
  const t = await boundedJobs()
  const settled = await Promise.allSettled([t.jobs.runAdapter('jps_rain', null), t.jobs.runAdapter('jps_rain', null)])
  expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1)
  expect(t.calls()).toBe(1)
  expect(t.published).toHaveLength(1)
  expect([...t.store.objects.keys()].filter((path) => path.startsWith('control/deliveries/'))).toHaveLength(1)
  expect(JSON.parse(Buffer.from((await t.store.read('control/pending-results.json'))!.body).toString())).toHaveLength(
    MAX_PENDING_RESULTS
  )
})
test('backfill consuming the final slot stops subsequent polling before HTTP', async () => {
  const t = await boundedJobs(true)
  await expect(t.jobs.runAdapter('jps_rain', null)).rejects.toThrow('outbox is full')
  expect(t.calls()).toBe(1)
  expect(t.published.map((result) => result.purpose)).toEqual(['backfill'])
  expect(JSON.parse(Buffer.from((await t.store.read(`control/backfills/${sid}.json`))!.body).toString()).state).toBe(
    'complete'
  )
})
