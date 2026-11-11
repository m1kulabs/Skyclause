import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { createApimsAdapter } from '../../../packages/sources/src/adapters/apims'
import { createSourceJobs } from '../src/sources/jobs'
import { createPollContext } from '../src/sources/http'
import { runLatestSlot, readCurrentSlotCapture } from '../src/sources/slots'
import {
  publishSourceResult,
  reserveSourceResult,
  repairSourceResults,
  MAX_PENDING_RESULTS,
  SOURCE_RESERVATION_MS,
  type ResultReference
} from '../src/sources/pubsub'
import { adapterStorage, decodeObject, encodeObject } from '../src/sources/storage'
import type { SourceExecutionResult } from '../src/sources/types'
import type { Source } from '@skyclause/sources'
import { MemoryStore, TestClock } from './support/source-adapter'
import { withSystem, withTenant, systemPrincipal, poll, reading, loadStoredRequest } from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { inArray } from 'drizzle-orm'
import { sourceIngestionDatabase, ingestSourceResult } from '../src/sources/ingest'

const map = readFileSync(
  new URL('../../../packages/sources/test/fixtures/mapcaqm-20261105T1313Z.json', import.meta.url)
)
const a: Source = {
  id: 'abcdef00-0000-7000-8000-000000000001',
  kind: 'apims',
  externalId: 'CA16W',
  name: 'Cheras',
  lat: null,
  lon: null,
  url: 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm',
  meta: { state_id: 14 }
}
const b: Source = { ...a, id: 'abcdef00-0000-7000-8000-000000000002', externalId: 'CA19B', meta: { state_id: 10 } }
async function fixture(sources = [a]) {
  const store = new MemoryStore(),
    clock = new TestClock(),
    adapter = createApimsAdapter()
  const results: SourceExecutionResult[] = [],
    refs: ResultReference[] = []
  const http = vi.fn(async () => {
    await clock.advance(37)
    return new Response(map)
  })
  const ports = {
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [adapter],
    http,
    userAgent: 'Skyclause/test',
    log: vi.fn(),
    database: {
      snapshot: vi.fn(async () => {
        throw new Error('database forbidden')
      }),
      catalogue: vi.fn(async (_adapter: unknown, _entries: unknown[]) => {})
    },
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
  const plan = async (members: Source[]) => {
    const previous = await store.read('control/plan.json')
    await store.write(
      'control/plan.json',
      encodeObject({
        version: 2,
        generatedAt: clock.now().toISOString(),
        sources: members.map((source) => ({
          source,
          bindings: [{ orgId: a.id, projectId: a.id }],
          previousPollDigest: null,
          previousBackfillDigest: null
        })),
        backfillGroups: [],
        periods: []
      }),
      previous?.generation ?? '0'
    )
  }
  await plan(sources)
  const slotPorts = {
    store,
    clock,
    id: randomUUID,
    scheduledAt: null,
    publish: ports.publish,
    reserve: (operationId: string) => reserveSourceResult(store, operationId, 'apims', clock.now()),
    contextFactory: (window: { start: number; end: number }) => (members: Source[]) =>
      createPollContext({
        kind: 'apims',
        sources: members,
        transportWindow: window,
        storage: adapterStorage('apims', store, store),
        budget: store,
        http,
        userAgent: ports.userAgent,
        periods: async () => [],
        log: ports.log,
        clock,
        requestId: randomUUID
      })
  }
  return {
    store,
    clock,
    adapter,
    results,
    refs,
    http,
    ports,
    plan,
    slotPorts,
    jobs: createSourceJobs(ports),
    run: (members = sources) => runLatestSlot(adapter, members, slotPorts)
  }
}

test('scheduled, manual, catalogue and probe races share one physical map request and original metadata', async () => {
  const t = await fixture()
  await Promise.allSettled([
    t.jobs.runAdapter('apims', null),
    createSourceJobs(t.ports).runAdapter('apims', '2026-11-09T00:00:00.000Z'),
    t.jobs.catalogueSync(),
    t.jobs.adapterContracts()
  ])
  await t.jobs.runAdapter('apims', '2026-11-12T00:00:00.000Z')
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results.length).toBeGreaterThan(0)
  const original = t.results[0]!
  expect(t.results.every((r) => JSON.stringify(r) === JSON.stringify(original))).toBe(true)
  expect(original).toMatchObject({
    scheduledAt: null,
    requests: [
      {
        sourceIds: [a.id],
        httpStatus: 200,
        latencyMs: 37,
        admissionMs: 0,
        transportStartedAt: '2026-11-10T00:00:00.000Z'
      }
    ],
    polls: [{ sourceId: a.id, outcome: 'ok', readings: [{ value: 67 }] }]
  })
  expect(original.requests[0]!.bodySha256).toBe('f530883dc9ca9dcc7fe798efb613e710d0a9ec7e8bf0d694e4526d8b9d4d9a56')
  await t.clock.advance(900000 - 37)
  await t.jobs.runAdapter('apims', null)
  expect(t.http).toHaveBeenCalledTimes(2)
  expect(t.results.at(-1)!.operationId).not.toBe(original.operationId)
})

test('late sources are explicitly not covered and never widen the immutable physical cohort', async () => {
  const t = await fixture()
  expect((await t.run()).state).toBe('complete')
  const original = t.results[0]
  const saved = JSON.stringify([...t.store.objects])
  expect(await t.run([a, b])).toEqual({ state: 'not-covered', sourceIds: [b.id] })
  expect(t.results).toEqual([original])
  expect(JSON.stringify([...t.store.objects])).toBe(saved)
  expect(t.http).toHaveBeenCalledTimes(1)
  await t.clock.advance(900000 - 37)
  await t.run([a, b])
  expect(t.results.at(-1)!.polls.map((p) => p.sourceId)).toEqual([a.id, b.id])
  expect(t.http).toHaveBeenCalledTimes(2)
})

test('discovery-only capture has empty source IDs, no domain result and cannot be promoted after binding', async () => {
  const t = await fixture([])
  const captured = await t.run([])
  expect(captured).toMatchObject({
    state: 'complete',
    capture: { purpose: 'discovery', request: { sourceIds: [], httpStatus: 200, latencyMs: 37 } }
  })
  expect(t.results).toEqual([])
  expect(t.refs).toEqual([])
  expect(
    [...t.store.objects.keys()].some((p) => p.startsWith('control/deliveries/') || p === 'control/pending-results.json')
  ).toBe(false)
  expect(await t.run([a])).toEqual({ state: 'not-covered', sourceIds: [a.id] })
  expect(t.http).toHaveBeenCalledTimes(1)
  await t.plan([a])
  await t.jobs.catalogueSync()
  await t.jobs.adapterContracts()
  expect(t.results).toEqual([])
  expect(t.ports.database.catalogue.mock.calls[0]?.[1]).toHaveLength(68)
  await t.clock.advance(900000 - 37)
  await t.run([a])
  expect(t.results[0]!.polls).toHaveLength(1)
})

test('catalogue admits no-binding discovery once and never falls through to legacy network discovery', async () => {
  const t = await fixture([])
  const legacy = vi.fn(async () => {
    throw new Error('legacy HTTP forbidden')
  })
  const jobs = createSourceJobs({ ...t.ports, adapters: [{ ...t.adapter, discover: legacy }] })
  await jobs.catalogueSync()
  await jobs.catalogueSync()
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(legacy).not.toHaveBeenCalled()
  expect(t.ports.database.catalogue).toHaveBeenCalledTimes(2)
  expect(t.results).toEqual([])
})

test.each(['absent', 'failed', 'old', 'future'] as const)(
  '%s capture is unavailable to bound catalogue and probes without HTTP or writes',
  async (state) => {
    const t = await fixture()
    if (state === 'failed') t.http.mockImplementation(async () => new Response('unavailable', { status: 503 }))
    if (state === 'future') await t.clock.advance(100)
    if (state !== 'absent') await t.run()
    if (state === 'old') await t.clock.advance(900000)
    if (state === 'future') t.clock.time -= 100
    const count = t.http.mock.calls.length,
      saved = JSON.stringify([...t.store.objects])
    expect(await readCurrentSlotCapture(t.store, 'apims', 900, t.clock.now())).toBeNull()
    await expect(t.jobs.catalogueSync()).rejects.toThrow(/unavailable/)
    await expect(t.jobs.adapterContracts()).rejects.toThrow('Source contracts failed')
    expect(t.http).toHaveBeenCalledTimes(count)
    expect(JSON.stringify([...t.store.objects])).toBe(saved)
    expect(t.ports.database.catalogue).not.toHaveBeenCalled()
  }
)

test('successful catalogue and probes reuse physical bytes without publication or domain writes', async () => {
  const t = await fixture()
  await t.run()
  const saved = JSON.stringify([...t.store.objects]),
    count = t.results.length
  const request = await readCurrentSlotCapture(t.store, 'apims', 900, t.clock.now())
  expect(request).toEqual(t.results[0]!.requests[0])
  await t.jobs.catalogueSync()
  await t.jobs.adapterContracts()
  expect(t.ports.database.catalogue.mock.calls[0]?.[1]).toHaveLength(68)
  expect(t.ports.database.snapshot).not.toHaveBeenCalled()
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results).toHaveLength(count)
  expect(JSON.stringify([...t.store.objects])).toBe(saved)
})

test.each([200, 503])('catalogue after unbinding never republishes a %s polling operation', async (status) => {
  const t = await fixture()
  if (status === 503) t.http.mockImplementation(async () => new Response('unavailable', { status }))
  await t.run()
  await t.plan([])
  const count = t.results.length,
    saved = JSON.stringify([...t.store.objects])
  if (status === 200) await t.jobs.catalogueSync()
  else await expect(t.jobs.catalogueSync()).rejects.toThrow(/unavailable/)
  expect(t.results).toHaveLength(count)
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(JSON.stringify([...t.store.objects])).toBe(saved)
})

test('crash before saving consumed bytes is lost across restart and never refetched', async () => {
  const t = await fixture(),
    write = t.store.write.bind(t.store)
  t.store.write = async (path, body, generation) => {
    if (path.startsWith('control/deliveries/')) throw new Error('capture lost')
    return write(path, body, generation)
  }
  await expect(t.run()).rejects.toThrow('capture lost')
  expect(await t.run()).toEqual({ state: 'lost' })
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results).toEqual([])
  t.store.write = write
  await t.clock.advance(900000 - 37)
  expect((await t.run()).state).toBe('complete')
  expect(t.http).toHaveBeenCalledTimes(2)
})

test('saved poll bytes repair through the existing outbox without another physical capture', async () => {
  const t = await fixture()
  await expect(
    runLatestSlot(t.adapter, [a], {
      ...t.slotPorts,
      publish: async () => {
        throw new Error('publication interrupted')
      }
    })
  ).rejects.toThrow('publication interrupted')
  expect((await t.run()).state).toBe('complete')
  await t.clock.advance(SOURCE_RESERVATION_MS + 1)
  const sent: ResultReference[] = []
  await repairSourceResults({
    store: t.store,
    now: t.clock.now,
    publish: async (ref) => {
      sent.push(ref)
    }
  })
  expect(sent).toHaveLength(1)
  const saved = await t.store.read(sent[0]!.object_path)
  expect(decodeObject<SourceExecutionResult>(saved!.body).operationId).toBe(sent[0]!.operation_id)
  expect(t.refs[0]).toEqual(sent[0])
  expect(t.http).toHaveBeenCalledTimes(1)
})

test('outbox capacity rejects before HTTP and the consumed slot cannot bypass it', async () => {
  const t = await fixture()
  await t.store.write(
    'control/pending-results.json',
    encodeObject(
      Array.from({ length: MAX_PENDING_RESULTS }, () => {
        const id = randomUUID()
        return {
          operation_id: id,
          kind: 'apims',
          object_path: `control/deliveries/apims/${id}.json`,
          sha256: 'a'.repeat(64)
        }
      })
    ),
    '0'
  )
  await expect(t.run()).rejects.toThrow('outbox is full')
  expect(t.http).not.toHaveBeenCalled()
  expect(await t.run()).toEqual({ state: 'lost' })
})

test.each(['body', 'operation', 'cohort', 'time'] as const)(
  'corrupt %s is rejected without spending another request',
  async (field) => {
    const t = await fixture()
    await t.run()
    const path = t.refs[0]!.object_path,
      saved = (await t.store.read(path))!
    const value = decodeObject<{
      operationId: string
      requests: Array<{ body: string; sourceIds: string[]; startedAt: string; transportStartedAt: string }>
      polls: Array<{ sourceId: string; readings: Array<{ sourceId: string }> }>
    }>(saved.body)
    if (field === 'body') value.requests[0]!.body = 'YQ=='
    if (field === 'operation') value.operationId = randomUUID()
    if (field === 'cohort') {
      value.requests[0]!.sourceIds = [b.id]
      value.polls[0]!.sourceId = b.id
      value.polls[0]!.readings[0]!.sourceId = b.id
    }
    if (field === 'time') {
      value.requests[0]!.startedAt = '2026-11-10T00:15:00.000Z'
      value.requests[0]!.transportStartedAt = value.requests[0]!.startedAt
    }
    await t.store.write(path, encodeObject(value), saved.generation)
    await expect(t.run()).rejects.toThrow()
    await expect(readCurrentSlotCapture(t.store, 'apims', 900, t.clock.now())).rejects.toThrow()
    expect(t.http).toHaveBeenCalledTimes(1)
  }
)

test.each(['poll', 'discovery'] as const)(
  'real receipt and late binding preserve the frozen %s cohort until next slot',
  async (purpose) => {
    const principal = systemPrincipal('apims-slot-test'),
      org = await makeOrganization()
    const sources: Source[] = []
    for (const original of purpose === 'poll'
      ? [a, b]
      : [
          { ...a, externalId: 'CA01R', meta: { state_id: 9 } },
          { ...b, externalId: 'CA02K', meta: { state_id: 2 } }
        ]) {
      const row = await withSystem(principal.job, (tx) =>
        makeSource(tx, { kind: 'apims', externalId: original.externalId, meta: original.meta, url: original.url })
      )
      sources.push({ ...original, id: row.id })
    }
    const project = await withTenant({ orgId: org.id, principal }, (tx) => makeProject(tx))
    const bind = (source: Source) =>
      withTenant({ orgId: org.id, principal }, (tx) =>
        makeProjectSource(tx, { projectId: project.id, sourceId: source.id, role: 'api_station' })
      )
    if (purpose === 'poll') await bind(sources[0]!)
    const t = await fixture(purpose === 'poll' ? [sources[0]!] : [])
    await t.run()
    const ingest = (ref: ResultReference) =>
      ingestSourceResult(ref, {
        store: t.store,
        ...sourceIngestionDatabase([t.adapter], t.clock.now),
        publish: async () => {}
      })
    if (purpose === 'poll') await ingest(t.refs[0]!)
    const original = t.results[0],
      originalBytes = t.refs[0] ? (await t.store.read(t.refs[0].object_path))!.body : null
    const receipt = original
      ? await withSystem(principal.job, (tx) => loadStoredRequest(tx, original.requests[0]!.requestId))
      : []
    if (purpose === 'discovery') await bind(sources[0]!)
    await bind(sources[1]!)
    await t.plan(sources)
    expect(await t.run(sources)).toEqual({
      state: 'not-covered',
      sourceIds: purpose === 'poll' ? [sources[1]!.id] : sources.map((s) => s.id)
    })
    await t.jobs.catalogueSync()
    await t.jobs.adapterContracts()
    if (purpose === 'poll') {
      await ingest(t.refs[0]!)
      expect(await withSystem(principal.job, (tx) => loadStoredRequest(tx, original!.requests[0]!.requestId))).toEqual(
        receipt
      )
      expect((await t.store.read(t.refs[0]!.object_path))!.body).toEqual(originalBytes)
    }
    const rows = () =>
      withSystem(principal.job, async (tx) => ({
        polls: await tx
          .select()
          .from(poll)
          .where(
            inArray(
              poll.sourceId,
              sources.map((s) => s.id)
            )
          ),
        readings: await tx
          .select()
          .from(reading)
          .where(
            inArray(
              reading.sourceId,
              sources.map((s) => s.id)
            )
          )
      }))
    const before = await rows()
    expect(before.polls.map((p) => p.sourceId)).toEqual(purpose === 'poll' ? [sources[0]!.id] : [])
    expect(before.readings.map((r) => r.sourceId)).toEqual(purpose === 'poll' ? [sources[0]!.id] : [])
    expect(t.http).toHaveBeenCalledTimes(1)
    await t.clock.advance(900000 - 37)
    await t.run(sources)
    await ingest(t.refs.at(-1)!)
    const after = await rows()
    expect(after.polls.filter((p) => p.sourceId === sources[1]!.id)).toHaveLength(1)
    expect(after.readings.filter((r) => r.sourceId === sources[1]!.id).map((r) => r.value)).toEqual([
      purpose === 'poll' ? 57 : 24
    ])
    expect(t.http).toHaveBeenCalledTimes(2)
  }
)

test.each(['poll', 'discovery'] as const)(
  'ambiguous %s process death reports lost after deadline without reclaiming HTTP',
  async (purpose) => {
    const t = await fixture(purpose === 'poll' ? [a] : []),
      write = t.store.write.bind(t.store)
    t.store.write = async (path, body, generation) => {
      if (
        path.startsWith('control/deliveries/') ||
        path.startsWith('control/discovery-captures/') ||
        (path.startsWith('control/latest-slots/') && generation !== '0')
      )
        throw new Error('process gone')
      return write(path, body, generation)
    }
    await expect(t.run()).rejects.toThrow('process gone')
    t.store.write = write
    expect(await t.run()).toEqual({ state: 'running' })
    await t.clock.advance(60000)
    expect(await t.run()).toEqual({ state: 'lost' })
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results).toEqual([])
  }
)

test.each(['poll', 'discovery'] as const)(
  'delayed %s admission cannot spend a GET outside its claimed slot',
  async (purpose) => {
    const t = await fixture(purpose === 'poll' ? [a] : []),
      write = t.store.write.bind(t.store)
    let delayed = false
    t.store.write = async (path, body, generation) => {
      const result = await write(path, body, generation)
      if (path.startsWith('control/latest-slots/') && !delayed) {
        delayed = true
        await t.clock.advance(900000)
      }
      return result
    }
    const result = await t.run()
    expect(result.state).toBe('complete')
    expect(t.http).not.toHaveBeenCalled()
    if (result.state !== 'complete') throw new Error('expected capture')
    const request = result.capture.purpose === 'poll' ? result.capture.result.requests[0]! : result.capture.request
    expect(request).toMatchObject({ httpStatus: null, transportStartedAt: null, body: null, error: { type: 'schema' } })
    await t.run()
    expect(t.http).toHaveBeenCalledTimes(1)
  }
)

test.each(['poll', 'discovery'] as const)(
  'an in-flight %s capture permanently fences competing polling and catalogue admission',
  async (purpose) => {
    const t = await fixture(purpose === 'poll' ? [a] : [])
    let entered!: () => void, release!: () => void
    const started = new Promise<void>((resolve) => {
        entered = resolve
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    t.http.mockImplementation(async () => {
      entered()
      await gate
      return new Response(map)
    })
    const first = t.run()
    await started
    expect(await t.run([a])).toEqual(
      purpose === 'poll' ? { state: 'running' } : { state: 'not-covered', sourceIds: [a.id] }
    )
    await expect(t.jobs.catalogueSync()).rejects.toThrow(/unavailable/)
    release()
    expect((await first).state).toBe('complete')
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results).toHaveLength(purpose === 'poll' ? 1 : 0)
  }
)

test('failed discovery captures are durable but never current successful input or domain results', async () => {
  const t = await fixture([])
  t.http.mockImplementation(async () => new Response('unavailable', { status: 503 }))
  await expect(t.jobs.catalogueSync()).rejects.toThrow(/unavailable/)
  await expect(t.jobs.catalogueSync()).rejects.toThrow(/unavailable/)
  const outcome = await t.run()
  expect(outcome).toMatchObject({
    state: 'complete',
    capture: { purpose: 'discovery', request: { sourceIds: [], httpStatus: 503, body: null, error: { type: 'http' } } }
  })
  expect(await readCurrentSlotCapture(t.store, 'apims', 900, t.clock.now())).toBeNull()
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(t.results).toEqual([])
})

test.each(['body', 'operation', 'cohort', 'time', 'status', 'request-id'] as const)(
  'discovery %s corruption cannot become reusable poll or catalogue input',
  async (field) => {
    const t = await fixture([])
    await t.run()
    const [path, saved] = [...t.store.objects.entries()].find(([path]) =>
      path.startsWith('control/discovery-captures/')
    )!
    const value = decodeObject<{
      operationId: string
      request: {
        requestId: string
        body: string
        sourceIds: string[]
        startedAt: string
        transportStartedAt: string
        httpStatus: number
      }
    }>(saved.body)
    if (field === 'body') value.request.body = 'YQ=='
    if (field === 'operation') value.operationId = randomUUID()
    if (field === 'cohort') value.request.sourceIds = [a.id]
    if (field === 'time') {
      value.request.startedAt = '2026-11-10T00:15:00.000Z'
      value.request.transportStartedAt = value.request.startedAt
    }
    if (field === 'status') value.request.httpStatus = 503
    if (field === 'request-id') value.request.requestId = 'invalid'
    await t.store.write(path, encodeObject(value), saved.generation)
    await expect(t.run()).rejects.toThrow()
    await expect(readCurrentSlotCapture(t.store, 'apims', 900, t.clock.now())).rejects.toThrow()
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results).toEqual([])
  }
)
