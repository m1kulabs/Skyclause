import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { jpsRain } from '../../../packages/sources/src/adapters/jps'
import { createSourceJobs } from '../src/sources/jobs'
import { readSourcePlan } from '../src/sources/plan'
import {
  publishSourceResult,
  repairSourceResults,
  SOURCE_RESERVATION_MS,
  MAX_PENDING_RESULTS,
  type ResultReference
} from '../src/sources/pubsub'
import { decodeObject, encodeObject } from '../src/sources/storage'
import type { SourceExecutionResult } from '../src/sources/types'
import { MemoryStore, TestClock, source } from './support/source-adapter'

const sid = 'abcdef00-0000-7000-8000-000000000001'
const graph = readFileSync(
  new URL('../../../packages/sources/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url)
)
async function fixture(age = 600000) {
  const store = new MemoryStore(),
    clock = new TestClock()
  const http = vi.fn(async () => {
    await clock.advance(37)
    return new Response(graph)
  })
  const results: SourceExecutionResult[] = [],
    refs: ResultReference[] = []
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('database forbidden')
    }),
    catalogue: vi.fn(async () => {
      throw new Error('database forbidden')
    })
  }
  const ports = {
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [jpsRain],
    http,
    userAgent: 'Skyclause/test',
    database,
    log: vi.fn(),
    publish: async (result: SourceExecutionResult) => {
      results.push(result)
      await publishSourceResult(result, {
        store,
        publish: async (ref) => {
          refs.push(ref)
        }
      })
    }
  }
  await store.write(
    'control/plan.json',
    encodeObject({
      version: 1,
      generatedAt: clock.now().toISOString(),
      sources: [
        {
          source: { ...source(sid), externalId: '0232901RF', meta: { jps_id: 75 } },
          bindings: [{ orgId: sid, projectId: sid }],
          previousPollDigest: null,
          previousBackfillDigest: null
        }
      ],
      periods: []
    }),
    '0'
  )
  const plan = await readSourcePlan(store),
    jobs = createSourceJobs(ports)
  await jobs.backfill(plan.sources[0]!, plan, null)
  expect(decodeObject<{ state: string }>((await store.read(`control/backfills/${sid}.json`))!.body).state).toBe(
    'complete'
  )
  await clock.advance(age - clock.elapsed)
  http.mockClear()
  results.length = 0
  refs.length = 0
  return { store, clock, http, results, refs, ports, jobs, plan }
}

test.each([
  ['sequential', null],
  ['concurrent', null],
  ['sequential', '2026-11-10T00:10:00.000Z'],
  ['concurrent', '2026-11-10T00:10:00.000Z']
] as const)(
  'normal %s calls with scheduledAt %s start only one physical GET across runtimes',
  async (order, scheduledAt) => {
    const t = await fixture()
    const first = t.jobs.runAdapter('jps_rain', scheduledAt)
    if (order === 'sequential') await first
    await Promise.all([first, createSourceJobs(t.ports).runAdapter('jps_rain', scheduledAt)])
    expect(t.http).toHaveBeenCalledTimes(1)
    const polls = t.results.filter((r) => r.purpose === 'poll')
    expect(polls.length).toBeGreaterThan(0)
    expect(new Set(polls.map((r) => r.operationId)).size).toBe(1)
    expect(new Set(polls.flatMap((r) => r.requests.map((q) => q.requestId))).size).toBe(1)
    expect(polls[0]).toMatchObject({
      scheduledAt,
      requests: [
        {
          sourceIds: [sid],
          httpStatus: 200,
          latencyMs: 37,
          admissionMs: 0,
          transportStartedAt: '2026-11-10T00:10:00.000Z'
        }
      ]
    })
    expect(polls[0]!.requests[0]!.body).toEqual(graph)
    expect(polls[0]!.requests[0]!.bodySha256).toBe('25cae3be496cff29b9925595d23fc63b7ddf9c1a4fb29e22b806b00d4ed3bd95')
    expect(polls[0]!.polls[0]!.readings).toHaveLength(2269)
    expect(t.ports.database.snapshot).not.toHaveBeenCalled()
    expect(t.ports.database.catalogue).not.toHaveBeenCalled()
  }
)

test.each(['claim', 'outbox', 'adapter'] as const)(
  'a delayed %s cannot start HTTP at the claimed slot end',
  async (delayAt) => {
    const t = await fixture(),
      write = t.store.write.bind(t.store)
    let delayed = false
    t.store.write = async (path, body, generation) => {
      const result = await write(path, body, generation)
      if (
        !delayed &&
        ((delayAt === 'claim' && path.startsWith('control/slots/')) ||
          (delayAt === 'outbox' &&
            path === 'control/pending-results.json' &&
            decodeObject<Array<{ reserved_until?: string; backfill_source_id?: string }>>(body).some(
              (entry) => entry.reserved_until && !entry.backfill_source_id
            )))
      ) {
        delayed = true
        await t.clock.advance(300000)
      }
      return result
    }
    const a =
      delayAt === 'adapter'
        ? {
            ...jpsRain,
            fetch: async (...args: Parameters<typeof jpsRain.fetch>) => {
              await t.clock.advance(300000)
              return jpsRain.fetch(...args)
            }
          }
        : jpsRain
    await createSourceJobs({ ...t.ports, adapters: [a] }).runAdapter('jps_rain', null)
    expect(t.http).not.toHaveBeenCalled()
    expect(t.results.find((r) => r.purpose === 'poll')).toMatchObject({
      scheduledAt: null,
      requests: [
        {
          httpStatus: null,
          body: null,
          bodySha256: null,
          transportStartedAt: null,
          error: { type: 'schema', message: 'Source slot expired or already consumed before transport' }
        }
      ],
      polls: [{ outcome: 'error', readings: [] }]
    })
    // This is a separate invocation at the exact next boundary, with its own actual slot.
    await createSourceJobs(t.ports).runAdapter('jps_rain', null)
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results.filter((r) => r.purpose === 'poll').at(-1)!.requests[0]!.transportStartedAt).toBe(
      '2026-11-10T00:15:00.000Z'
    )
  }
)

test('crash before durable save consumes the slot across restart and allows the next bucket', async () => {
  const t = await fixture(),
    write = t.store.write.bind(t.store)
  let crash = true
  t.store.write = async (path, body, generation) => {
    if (
      crash &&
      path.startsWith('control/deliveries/') &&
      decodeObject<SourceExecutionResult>(body).purpose === 'poll'
    ) {
      crash = false
      throw new Error('crash before durable save')
    }
    return write(path, body, generation)
  }
  await expect(t.jobs.runAdapter('jps_rain', null)).rejects.toThrow('crash before durable save')
  await createSourceJobs(t.ports).runAdapter('jps_rain', null)
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results.filter((r) => r.purpose === 'poll')).toEqual([])
  expect(t.ports.log).toHaveBeenCalledWith('source.slot.unavailable', expect.objectContaining({ state: 'running' }))
  await t.clock.advance(300000 - 37)
  await createSourceJobs(t.ports).runAdapter('jps_rain', null)
  expect(t.http).toHaveBeenCalledTimes(2)
  expect(t.results.filter((r) => r.purpose === 'poll')).toHaveLength(1)
})

test.each(['before-publish', 'publisher'] as const)(
  'saved bytes survive %s failure and outbox repair without a refetch',
  async (crashAt) => {
    const t = await fixture()
    const jobs = createSourceJobs({
      ...t.ports,
      publish: async (result) => {
        if (result.purpose !== 'poll') return t.ports.publish(result)
        if (crashAt === 'before-publish') throw new Error('publication interrupted')
        await publishSourceResult(result, {
          store: t.store,
          publish: async () => {
            throw new Error('publication interrupted')
          }
        })
      }
    })
    await expect(jobs.runAdapter('jps_rain', '2026-11-10T00:10:00.000Z')).rejects.toThrow('publication interrupted')
    const saved = [...t.store.objects.entries()].find(
      ([path, object]) =>
        path.startsWith('control/deliveries/') && decodeObject<SourceExecutionResult>(object.body).purpose === 'poll'
    )!
    const original = saved[1].body.slice()
    const sent: ResultReference[] = []
    await t.clock.advance(SOURCE_RESERVATION_MS + 1)
    await repairSourceResults({
      store: t.store,
      now: t.clock.now,
      publish: async (ref) => {
        sent.push(ref)
      }
    })
    const result = decodeObject<SourceExecutionResult>(original)
    expect(sent.find((ref) => ref.operation_id === result.operationId)).toMatchObject({ object_path: saved[0] })
    expect(t.http).toHaveBeenCalledTimes(1)
    expect((await t.store.read(saved[0]))!.body).toEqual(original)
  }
)

test('same-slot replay preserves bytes, identities and supplied scheduledAt despite later invocation metadata', async () => {
  const t = await fixture()
  await t.jobs.runAdapter('jps_rain', null)
  const original = t.results.find((r) => r.purpose === 'poll')!
  await t.clock.advance(1000)
  await createSourceJobs(t.ports).runAdapter('jps_rain', '2026-11-10T00:11:00.000Z')
  const replay = t.results.filter((r) => r.purpose === 'poll').at(-1)!
  expect(replay).toEqual(original)
  expect(t.http).toHaveBeenCalledTimes(1)
})

test('successful current-slot probe decodes and parses saved bytes without HTTP or writes', async () => {
  const t = await fixture()
  await t.jobs.runAdapter('jps_rain', null)
  const decode = vi.fn(jpsRain.latestSlot!.decode),
    parse = vi.fn(jpsRain.parse)
  const before = JSON.stringify([...t.store.objects]),
    count = t.results.length
  await createSourceJobs({
    ...t.ports,
    adapters: [{ ...jpsRain, latestSlot: { seconds: 300, decode }, parse }]
  }).adapterContracts()
  expect(decode).toHaveBeenCalledOnce()
  expect(decode.mock.calls[0]![0]).toEqual(graph)
  expect(parse).toHaveBeenCalledOnce()
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(JSON.stringify([...t.store.objects])).toBe(before)
  expect(t.results).toHaveLength(count)
  expect(t.ports.database.snapshot).not.toHaveBeenCalled()
  expect(t.ports.database.catalogue).not.toHaveBeenCalled()
})

test.each(['absent', 'failed', 'old', 'future'] as const)(
  '%s capture makes the probe explicitly unavailable without fallback HTTP',
  async (state) => {
    const t = await fixture()
    if (state === 'failed') t.http.mockImplementation(async () => new Response('unavailable', { status: 503 }))
    if (state !== 'absent') await t.jobs.runAdapter('jps_rain', null)
    if (state === 'old') await t.clock.advance(300000)
    if (state === 'future') t.clock.time -= 100
    const count = t.http.mock.calls.length,
      before = JSON.stringify([...t.store.objects])
    await expect(t.jobs.adapterContracts()).rejects.toThrow('Source contracts failed')
    expect(t.ports.log).toHaveBeenCalledWith(
      'source.contract.failed',
      expect.objectContaining({ error: expect.stringContaining('unavailable') })
    )
    expect(t.http).toHaveBeenCalledTimes(count)
    expect(JSON.stringify([...t.store.objects])).toBe(before)
  }
)

test('first-bind successful capture is available to probes without converting its backfill purpose', async () => {
  const t = await fixture(37)
  await t.jobs.adapterContracts()
  expect(t.http).not.toHaveBeenCalled()
  expect(t.results).toEqual([])
  await t.jobs.runAdapter('jps_rain', null)
  expect(t.http).not.toHaveBeenCalled()
  await t.clock.advance(300000)
  await t.jobs.runAdapter('jps_rain', null)
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results.filter((r) => r.purpose === 'poll')).toHaveLength(1)
})

test('normalized source UUID and actual clock bucket coalesce changed scheduler metadata', async () => {
  const t = await fixture()
  // No backfill on this test adapter: the normal admission key is the seam under test.
  const a = { ...jpsRain, backfill: undefined }
  await createSourceJobs({ ...t.ports, adapters: [a] }).runAdapter('jps_rain', '2026-11-09T00:00:00.000Z')
  const plan = {
    ...t.plan,
    sources: t.plan.sources.map((entry) => ({ ...entry, source: { ...entry.source, id: sid.toUpperCase() } }))
  }
  await t.store.write('control/plan.json', encodeObject(plan), (await t.store.read('control/plan.json'))!.generation)
  await createSourceJobs({ ...t.ports, adapters: [a] }).runAdapter('jps_rain', '2026-11-11T00:00:00.000Z')
  expect(t.http).toHaveBeenCalledTimes(1)
  const polls = t.results.filter((r) => r.purpose === 'poll')
  expect(polls[1]).toEqual(polls[0])
  expect(polls[1]!.requests[0]!.sourceIds).toEqual([sid])
})

test('outbox hard cap blocks an opted-in source before physical admission', async () => {
  const t = await fixture()
  const entries = Array.from({ length: MAX_PENDING_RESULTS }, () => {
    const id = randomUUID()
    return {
      operation_id: id,
      kind: 'jps_rain',
      object_path: `control/deliveries/jps_rain/${id}.json`,
      sha256: 'a'.repeat(64)
    }
  })
  await t.store.write(
    'control/pending-results.json',
    encodeObject(entries),
    (await t.store.read('control/pending-results.json'))!.generation
  )
  await expect(
    createSourceJobs({ ...t.ports, adapters: [{ ...jpsRain, backfill: undefined }] }).runAdapter('jps_rain', null)
  ).rejects.toThrow('outbox is full')
  expect(t.http).not.toHaveBeenCalled()
})

test('family admission delayed past the slot end retains truthful no-response timing', async () => {
  const t = await fixture(),
    write = t.store.write.bind(t.store)
  t.store.write = async (path, body, generation) => {
    const result = await write(path, body, generation)
    if (path.startsWith('control/budgets/')) await t.clock.advance(300000)
    return result
  }
  await createSourceJobs({ ...t.ports, adapters: [{ ...jpsRain, apiFamily: 'datagovmy-weather' }] }).runAdapter(
    'jps_rain',
    null
  )
  expect(t.http).not.toHaveBeenCalled()
  expect(t.results.find((r) => r.purpose === 'poll')).toMatchObject({
    requests: [
      {
        transportStartedAt: null,
        httpStatus: null,
        body: null,
        bodySha256: null,
        admissionMs: 300000,
        latencyMs: 300000,
        error: { type: 'rate_limited' }
      }
    ]
  })
})

test('a future capture after clock rollback is neither reused nor fetched again in that bucket', async () => {
  const t = await fixture()
  await t.clock.advance(10000)
  await t.jobs.runAdapter('jps_rain', null)
  const count = t.results.filter((r) => r.purpose === 'poll').length
  t.clock.time -= 5000
  await t.jobs.runAdapter('jps_rain', null)
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results.filter((r) => r.purpose === 'poll')).toHaveLength(count)
  await expect(t.jobs.adapterContracts()).rejects.toThrow('Source contracts failed')
})

test.each(['body-hash', 'operation', 'source'] as const)(
  'same-slot replay rejects corrupt %s without refetch',
  async (corruption) => {
    const t = await fixture()
    await t.jobs.runAdapter('jps_rain', null)
    const saved = [...t.store.objects.entries()].find(
      ([path, object]) =>
        path.startsWith('control/deliveries/') && decodeObject<SourceExecutionResult>(object.body).purpose === 'poll'
    )!
    const result = decodeObject<{
      operationId: string
      requests: Array<{ body: string; sourceIds: string[] }>
      polls: Array<{ sourceId: string; readings: Array<{ sourceId: string }> }>
    }>(saved[1].body)
    if (corruption === 'body-hash') result.requests[0]!.body = 'YQ=='
    if (corruption === 'operation') result.operationId = randomUUID()
    if (corruption === 'source') {
      const id = randomUUID()
      result.requests[0]!.sourceIds = [id]
      result.polls[0]!.sourceId = id
      result.polls[0]!.readings.forEach((r) => {
        r.sourceId = id
      })
    }
    await t.store.write(saved[0], encodeObject(result), saved[1].generation)
    await expect(createSourceJobs(t.ports).runAdapter('jps_rain', null)).rejects.toThrow()
    expect(t.http).toHaveBeenCalledTimes(1)
  }
)
