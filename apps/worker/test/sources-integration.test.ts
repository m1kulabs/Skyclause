import { expect, test } from 'vitest'
import { createSourceJobs } from '../src/sources/jobs'
import { sourceConfig } from '../src/sources/index'
test('source config is checked at use, and missing source config fails explicitly', () => {
  expect(createSourceJobs).toBeTypeOf('function')
  expect(() => sourceConfig({})).toThrow('SOURCES_BUCKET')
})

import { randomUUID } from 'node:crypto'
import {
  withSystem,
  withTenant,
  systemPrincipal,
  reading,
  domainEvent,
  project,
  projectSource,
  poll
} from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { and, eq, inArray } from 'drizzle-orm'
import { sourceSnapshot, refreshSourcePlan, readSourcePlan } from '../src/sources/plan'
import { sourceIngestionDatabase, ingestSourceResult, drainSourceResults } from '../src/sources/ingest'
import { publishSourceResult, sha256, type ResultReference } from '../src/sources/pubsub'
import { MemoryStore, adapter, TestClock } from './support/source-adapter'
import type { SourceExecutionResult } from '../src/sources/types'
const principal = systemPrincipal('sources-integration')
async function fixture() {
  const sources = await withSystem('test', async (tx) => [
    await makeSource(tx),
    await makeSource(tx),
    await makeSource(tx)
  ])
  const orgs = await Promise.all([makeOrganization(), makeOrganization(), makeOrganization()])
  const projects: Awaited<ReturnType<typeof makeProject>>[] = []
  for (const org of orgs)
    projects.push(
      await withTenant({ orgId: org.id, principal }, async (tx) => {
        const p = await makeProject(tx)
        if (org !== orgs[2])
          for (const source of sources)
            await makeProjectSource(tx, { projectId: p.id, sourceId: source.id, role: 'rain_gauge' })
        return p
      })
    )
  const store = new MemoryStore(),
    clock = new TestClock(),
    a = adapter(),
    results: SourceExecutionResult[] = [],
    refs: ResultReference[] = []
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [a],
    http: async () => new Response('{}'),
    userAgent: 'Skyclause test',
    publish: async (result) => {
      results.push(result)
      await publishSourceResult(result, {
        store,
        publish: async (ref) => {
          refs.push(ref)
        }
      })
    },
    database: { snapshot: sourceSnapshot, catalogue: async () => {} },
    log: () => {}
  })
  await jobs.refreshSourcePlan(clock.now())
  await jobs.runAdapter('jps_rain', null)
  const result = results[0]!,
    ref = refs[0]!
  const receiptTime = new Date('2026-11-10T02:00:00.000Z')
  const db = sourceIngestionDatabase([a], () => receiptTime),
    published: unknown[] = []
  const deps = {
    store,
    ...db,
    publish: async (data: unknown) => {
      published.push(data)
    }
  }
  const counts = () =>
    withSystem('test', async (tx) => ({
      readings: await tx
        .select()
        .from(reading)
        .where(
          inArray(
            reading.sourceId,
            sources.map((s) => s.id)
          )
        ),
      polls: await tx
        .select()
        .from(poll)
        .where(
          and(
            eq(poll.requestId, result.requests[0]!.requestId),
            inArray(
              poll.sourceId,
              sources.map((s) => s.id)
            )
          )
        ),
      events: await tx
        .select()
        .from(domainEvent)
        .where(
          and(
            eq(domainEvent.type, 'poll.recorded'),
            inArray(
              domainEvent.projectId,
              projects.map((p) => p.id)
            )
          )
        )
    }))
  return { sources, orgs, projects, store, jobs, result, ref, db, deps, published, counts, receiptTime }
}
test('one HTTP request yields three polls and two tenant event sets; failed fanout and publish replay stable IDs before ack', async () => {
  const t = await fixture()
  let fail = true
  const acks: string[][] = []
  const ports = {
    ...t.deps,
    fanout: async (polls: Parameters<typeof t.db.fanout>[0]) => {
      if (fail) {
        fail = false
        throw new Error('fanout unavailable')
      }
      await t.db.fanout(polls)
    }
  }
  const deliver = (ackId: string) =>
    drainSourceResults({
      pull: async () => [{ ackId, data: t.ref }],
      ack: async (ids) => {
        acks.push(ids)
      },
      ingest: (data) => ingestSourceResult(data, ports)
    })
  await expect(deliver('first-message')).rejects.toThrow('fanout unavailable')
  expect(acks).toEqual([])
  const first = await t.counts()
  expect(first.polls).toHaveLength(3)
  expect(first.polls.every((p) => p.receivedAt?.getTime() === t.receiptTime.getTime())).toBe(true)
  expect(first.polls.every((p) => p.startedAt.getTime() === Date.parse(t.result.requests[0]!.startedAt))).toBe(true)
  expect(first.readings).toHaveLength(3)
  expect(first.events).toHaveLength(0)
  let publishFail = true
  ports.publish = async (data) => {
    t.published.push(data)
    if (publishFail) {
      publishFail = false
      throw new Error('publish unavailable')
    }
  }
  await expect(deliver('second-message')).rejects.toThrow('publish unavailable')
  expect(acks).toEqual([])
  expect((await t.counts()).events).toHaveLength(6)
  await deliver('third-message')
  const final = await t.counts()
  expect(final.polls.map((p) => p.id)).toEqual(first.polls.map((p) => p.id))
  expect(final.readings).toHaveLength(3)
  expect(final.readings.every((r) => r.revision === 1 && r.receivedAt.getTime() === t.receiptTime.getTime())).toBe(true)
  expect(final.events).toHaveLength(6)
  expect(final.events.some((e) => e.orgId === t.orgs[2]!.id)).toBe(false)
  expect(acks).toEqual([['third-message']])
  expect(t.published[0]).toEqual(t.published[1])
})
test('ingestion revalidates archived and removed bindings after the plan was generated', async () => {
  const t = await fixture()
  for (const p of t.projects.slice(0, 2))
    await withTenant({ orgId: p.orgId, principal }, async (tx) => {
      if (p === t.projects[0]) await tx.update(project).set({ archivedAt: new Date() }).where(eq(project.id, p.id))
      else await tx.delete(projectSource).where(eq(projectSource.projectId, p.id))
    })
  await ingestSourceResult(t.ref, t.deps)
  expect(await t.counts()).toEqual({ readings: [], polls: [], events: [] })
})
test('multi-response captures do not suppress final parsed rows using a single response hash', async () => {
  const t = await fixture(),
    first = t.result.requests[0]!
  t.result.requests.push({ ...first, requestId: randomUUID() })
  t.result.polls = t.result.polls.flatMap((p) => [
    { ...p, outcome: 'unchanged' as const, readings: [] },
    { ...p, requestId: t.result.requests[1]!.requestId }
  ])
  t.result.operationId = randomUUID()
  let ref: ResultReference | undefined
  await publishSourceResult(t.result, {
    store: t.store,
    publish: async (value) => {
      ref = value
    }
  })
  await ingestSourceResult(ref, t.deps)
  expect((await t.counts()).readings).toHaveLength(3)
  const oldIds = t.result.requests.map((request) => request.requestId)
  const changed = structuredClone(t.result)
  changed.operationId = randomUUID()
  changed.requests.forEach((request) => {
    request.requestId = randomUUID()
  })
  changed.requests[0]!.body = Buffer.from('changed earlier response')
  changed.requests[0]!.bodySha256 = sha256(changed.requests[0]!.body!)
  changed.polls = changed.polls.map((poll) => ({
    ...poll,
    requestId: changed.requests[oldIds.indexOf(poll.requestId)]!.requestId,
    readings: poll.readings.map((row) => ({ ...row, value: 9 }))
  }))
  // Only the earlier response changed; the final response still has exactly the previous hash.
  expect(changed.requests[1]!.bodySha256).toBe(t.result.requests[1]!.bodySha256)
  await publishSourceResult(changed, {
    store: t.store,
    publish: async (value) => {
      ref = value
    }
  })
  await ingestSourceResult(ref, t.deps)
  const readings = (await t.counts()).readings
  expect(readings).toHaveLength(6)
  expect(readings.filter((row) => row.revision === 2).map((row) => row.value)).toEqual([9, 9, 9])
})
test('a generation conflict refreshes from current bytes and never overwrites a newer plan', async () => {
  const store = new MemoryStore(),
    now = new Date('2026-11-10T00:00:00Z')
  const plan = { version: 1 as const, generatedAt: now.toISOString(), sources: [], periods: [] }
  await refreshSourcePlan(now, store, async () => plan)
  await refreshSourcePlan(new Date(now.getTime() - 1000), store, async () => ({
    ...plan,
    generatedAt: new Date(now.getTime() - 1000).toISOString()
  }))
  expect((await readSourcePlan(store)).generatedAt).toBe(now.toISOString())
})

import { sourceBoundConsumer } from '../src/sources/index'
import { emitEvent, shareSystemConnection } from '@skyclause/db'
test('source.bound stores intent in its tenant transaction, then executes outside it; a missed execution repairs from the plan', async () => {
  const org = await makeOrganization(),
    store = new MemoryStore(),
    clock = new TestClock()
  const s = await withSystem('test', (tx) => makeSource(tx))
  const event = await withTenant({ orgId: org.id, principal }, async (tx) => {
    const p = await makeProject(tx)
    await makeProjectSource(tx, { projectId: p.id, sourceId: s.id, role: 'rain_gauge' })
    return emitEvent(tx, { projectId: p.id, type: 'source.bound', data: { source_id: s.id, role: 'rain_gauge' } })
  })
  const envelope = await withSystem(
    'test',
    async (tx) => (await tx.select().from(domainEvent).where(eq(domainEvent.id, event.id)))[0]!
  )
  const a = adapter({ backfill: async (s, ctx) => (await ctx.http(s.url)).json() })
  let calls = 0
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [a],
    http: async () => {
      // This withSystem would fail if HTTP ran inside the tenant scope on the shared connection.
      await withSystem('test:outside', async () => {})
      calls++
      return new Response('{}')
    },
    userAgent: 'test',
    publish: async () => {},
    database: { snapshot: sourceSnapshot, catalogue: async () => {} },
    log: () => {}
  })
  let miss = true
  const runtime = () => ({
    jobs: {
      ...jobs,
      backfill: async (...args: Parameters<typeof jobs.backfill>) => {
        if (miss) {
          miss = false
          throw new Error('execution interrupted')
        }
        return jobs.backfill(...args)
      }
    },
    store,
    repair: async () => {},
    subscription: { pullSourceResults: async () => [], ackSourceResults: async () => {} },
    ingest: async () => {}
  })
  const consumer = sourceBoundConsumer(runtime)
  const raw = {
    id: envelope.id,
    type: envelope.type,
    org_id: envelope.orgId,
    project_id: envelope.projectId,
    data: envelope.data,
    seq: envelope.seq,
    created_at: envelope.createdAt.toISOString()
  }
  await expect(shareSystemConnection(() => consumer.handler(raw))).rejects.toThrow('execution interrupted')
  expect(calls).toBe(0)
  expect(await store.read(`control/intents/${s.id}.json`)).not.toBeNull()
  // handleOnce already committed, so event redelivery doesn't run an untracked fetch.
  await shareSystemConnection(() => consumer.handler(raw))
  expect(calls).toBe(0)
  await jobs.refreshSourcePlan(clock.now())
  // Limit the repair plan to this binding to isolate other tests' retained fixtures.
  const saved = (await store.read('control/plan.json'))!,
    plan = await readSourcePlan(store)
  await store.write(
    'control/plan.json',
    Buffer.from(JSON.stringify({ ...plan, sources: plan.sources.filter((entry) => entry.source.id === s.id) })),
    saved.generation
  )
  await shareSystemConnection(() => jobs.runAdapter('jps_rain', null))
  expect(calls).toBe(2)
  const claim = JSON.parse(Buffer.from((await store.read(`control/backfills/${s.id}.json`))!.body).toString())
  expect(claim.state).toBe('complete')
  const fresh = await withSystem('test', (tx) => makeSource(tx))
  const nextEvent = await withTenant({ orgId: org.id, principal }, async (tx) => {
    await makeProjectSource(tx, { projectId: envelope.projectId, sourceId: fresh.id, role: 'rain_gauge' })
    return emitEvent(tx, {
      projectId: envelope.projectId,
      type: 'source.bound',
      data: { source_id: fresh.id, role: 'rain_gauge' }
    })
  })
  await shareSystemConnection(() =>
    consumer.handler({ ...raw, id: nextEvent.id, data: { source_id: fresh.id, role: 'rain_gauge' } })
  )
  // A successful event-triggered fetch also runs after its tenant transaction has fully returned.
  expect(calls).toBe(3)
})

test.each([
  ['ordered', false],
  ['reordered', false],
  ['ordered', true],
  ['reordered', true]
] as const)(
  'a cached A plan preserves A to B to A corrections with %s delivery (aggregate: %s)',
  async (order, aggregate) => {
    const org = await makeOrganization(),
      s = await withSystem('test', (tx) => makeSource(tx)),
      store = new MemoryStore(),
      clock = new TestClock()
    await withTenant({ orgId: org.id, principal }, async (tx) => {
      const project = await makeProject(tx)
      await makeProjectSource(tx, { projectId: project.id, sourceId: s.id, role: 'rain_gauge' })
    })
    let value = 1,
      parseCalls = 0
    const refs: ResultReference[] = [],
      results: SourceExecutionResult[] = []
    const a = adapter({
      apiFamily: undefined,
      fetch: async (sources, ctx) => {
        if (aggregate) await ctx.http(sources[0]!.url + 'first')
        return (await ctx.http(sources[0]!.url)).json()
      },
      parse: (raw, sources) => {
        parseCalls++
        return sources.map((source) => ({
          sourceId: source.id,
          metric: 'rain_5m_mm',
          observedAt: '2026-11-10T00:00:00.000Z',
          value: (raw as { value: number }).value,
          unit: 'mm',
          valueJson: null
        }))
      }
    })
    const jobs = createSourceJobs({
      store,
      scratch: store,
      clock,
      id: randomUUID,
      adapters: [a],
      http: async () => new Response(JSON.stringify({ value })),
      userAgent: 'test',
      publish: async (result) => {
        results.push(result)
        await publishSourceResult(result, {
          store,
          publish: async (ref) => {
            refs.push(ref)
          }
        })
      },
      database: {
        snapshot: async (now) => {
          const plan = await sourceSnapshot(now)
          return { ...plan, sources: plan.sources.filter((entry) => entry.source.id === s.id) }
        },
        catalogue: async () => {}
      },
      log: () => {}
    })
    const ingest = (ref: ResultReference) =>
      ingestSourceResult(ref, { store, ...sourceIngestionDatabase([a]), publish: async () => {} })
    await jobs.refreshSourcePlan(clock.now())
    await jobs.runAdapter('jps_rain', null)
    await ingest(refs[0]!)
    await jobs.refreshSourcePlan(clock.now())
    const planBytes = (await store.read('control/plan.json'))!
    value = 2
    await clock.advance(1000)
    await jobs.runAdapter('jps_rain', null)
    value = 1
    await clock.advance(1000)
    await jobs.runAdapter('jps_rain', null)
    expect(await store.read('control/plan.json')).toEqual(planBytes)
    expect(results.map((result) => result.polls.flatMap((poll) => poll.readings.map((row) => row.value)))).toEqual([
      [1],
      [2],
      [1]
    ])
    expect(parseCalls).toBe(3)
    for (const index of order === 'ordered' ? [1, 2] : [2, 1]) await ingest(refs[index]!)
    const rows = await withSystem('test', (tx) => tx.select().from(reading).where(eq(reading.sourceId, s.id)))
    const values = rows.sort((a, b) => a.revision - b.revision).map((row) => row.value)
    expect(values).toEqual(order === 'ordered' ? [1, 2, 1] : [1])
  }
)
