import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import {
  domainEvent,
  poll,
  reading,
  source,
  systemPrincipal,
  upsertSourceCatalogue,
  withSystem,
  withTenant
} from '@skyclause/db'
import { adapters, getAdapter } from '@skyclause/sources'
import { jpsRain, createJpsRainAdapter } from '../../../packages/sources/src/adapters/jps'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { createSourceJobs } from '../src/sources/jobs'
import { sourceSnapshot, readSourcePlan } from '../src/sources/plan'
import { ingestSourceResult, sourceIngestionDatabase } from '../src/sources/ingest'
import { publishSourceResult, type ResultReference } from '../src/sources/pubsub'
import { encodeObject } from '../src/sources/storage'
import type { SourceExecutionResult } from '../src/sources/types'
import { MemoryStore, TestClock } from './support/source-adapter'

const graph = readFileSync(
  new URL('../../../packages/sources/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url),
  'utf8'
)
const html = readFileSync(
  new URL('../../../packages/sources/test/fixtures/rainfall-latest-data-all-20261110T1215Z.html', import.meta.url),
  'utf8'
)
const principal = systemPrincipal('test:jps')

async function fixture() {
  const gauge = await withSystem('test:jps', async (tx) => {
    // Retained append-only history from earlier cases needs a distinct catalogue identity.
    await tx.update(source).set({ externalId: randomUUID() }).where(eq(source.externalId, '0232901RF'))
    return makeSource(tx, { externalId: '0232901RF', meta: { jps_id: 75 }, ownerOrgId: null })
  })
  const projects: Awaited<ReturnType<typeof makeProject>>[] = []
  for (let i = 0; i < 2; i++) {
    const org = await makeOrganization()
    projects.push(
      await withTenant({ orgId: org.id, principal }, async (tx) => {
        const project = await makeProject(tx)
        await makeProjectSource(tx, { projectId: project.id, sourceId: gauge.id, role: 'rain_gauge' })
        return project
      })
    )
  }
  const store = new MemoryStore(),
    clock = new TestClock()
  let body = graph,
    status = 200
  const http = vi.fn(async (url: Parameters<typeof fetch>[0]) => {
    expect(String(url)).toBe('https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75')
    await clock.advance(37)
    return new Response(body, { status })
  })
  const results: SourceExecutionResult[] = [],
    refs: ResultReference[] = []
  const database = {
    snapshot: vi.fn(async () => {
      throw new Error('database forbidden during capture')
    }),
    catalogue: vi.fn(async () => {
      throw new Error('database forbidden during capture')
    })
  }
  const ports = {
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [getAdapter('jps_rain')],
    http,
    userAgent: 'Skyclause/test',
    database,
    log: () => {},
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
  const jobs = createSourceJobs(ports)
  const snapshot = await sourceSnapshot(clock.now())
  await store.write(
    'control/plan.json',
    encodeObject({ ...snapshot, sources: snapshot.sources.filter((s) => s.source.id === gauge.id) }),
    '0'
  )
  const plan = await readSourcePlan(store)
  expect(plan.sources[0]!.bindings).toHaveLength(2)
  const published: unknown[] = []
  const ingest = async (ref = refs.at(-1)!) => {
    const started = performance.now()
    await ingestSourceResult(ref, {
      store,
      ...sourceIngestionDatabase(adapters, clock.now),
      publish: async (event) => {
        published.push(event)
      }
    })
    console.info(
      'jps.ingest',
      JSON.stringify({
        operationId: ref.operation_id,
        purpose: results.find((result) => result.operationId === ref.operation_id)?.purpose,
        milliseconds: Math.round(performance.now() - started)
      })
    )
  }
  const rows = () =>
    withSystem('test:jps', async (tx) => ({
      readings: await tx.select().from(reading).where(eq(reading.sourceId, gauge.id)),
      polls: await tx.select().from(poll).where(eq(poll.sourceId, gauge.id)).orderBy(poll.startedAt),
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
  return {
    gauge,
    projects,
    store,
    clock,
    http,
    results,
    refs,
    jobs,
    plan,
    database,
    ingest,
    rows,
    published,
    ports,
    setBody: (value: string) => {
      body = value
    },
    setStatus: (value: number) => {
      status = value
    }
  }
}

test('canonical JPS registration and production job use the five-minute MYT schedule without retries', () => {
  expect(getAdapter('jps_rain')).toBe(jpsRain)
  const config = readFileSync(new URL('../../../infra/environments/production/jps-rain.tf', import.meta.url), 'utf8')
  for (const text of [
    'module "jps_rain"',
    'name                      = "adapter-jps-rain"',
    'args                      = ["job", "adapter", "jps_rain"]',
    'schedule                  = "*/5 * * * *"',
    'time_zone                 = "Asia/Kuala_Lumpur"',
    'max_retries               = 0'
  ])
    expect(config).toContain(text)
})

test('real backfill and later polls share one request across tenants and append only a changed observation', async () => {
  const t = await fixture()
  await t.jobs.backfill(t.plan.sources[0]!, t.plan, null)
  expect(t.http).toHaveBeenCalledTimes(1)
  expect(await t.rows()).toEqual({ readings: [], polls: [], events: [] })
  expect(t.database.snapshot).not.toHaveBeenCalled()
  expect(t.database.catalogue).not.toHaveBeenCalled()
  expect(t.results[0]).toMatchObject({
    purpose: 'backfill',
    scheduledAt: null,
    requests: [{ httpStatus: 200, latencyMs: 37 }]
  })
  await t.ingest()
  const first = await t.rows()
  expect(first.readings).toHaveLength(2269)
  expect(first.readings.every((row) => row.revision === 1)).toBe(true)
  expect(first.polls).toHaveLength(1)
  expect(first.events).toHaveLength(2)
  expect(first.events.map((event) => event.projectId).sort()).toEqual(t.projects.map((project) => project.id).sort())
  for (const event of first.events) expect(event.data).toMatchObject({ source_id: t.gauge.id, new_rows: 2269 })
  await t.clock.advance(300000)
  await t.jobs.runAdapter('jps_rain', null)
  expect(t.results.at(-1)).toMatchObject({ purpose: 'poll', scheduledAt: null })
  await t.ingest()
  expect(t.http).toHaveBeenCalledTimes(2)
  const unchanged = await t.rows()
  expect(unchanged.readings).toHaveLength(2269)
  expect(unchanged.polls.at(-1)).toMatchObject({
    outcome: 'unchanged',
    purpose: 'poll',
    httpStatus: 200,
    latencyMs: 37
  })
  const changed = JSON.parse(graph)
  changed.data[0].rf += 1
  t.setBody(JSON.stringify(changed))
  await t.clock.advance(300000)
  await t.jobs.runAdapter('jps_rain', null)
  await t.ingest()
  const final = await t.rows()
  expect(final.readings).toHaveLength(2270)
  expect(final.readings.filter((row) => row.revision === 2)).toHaveLength(1)
  const correction = final.readings.find((row) => row.revision === 2)!
  const original = first.readings.find((row) => row.observedAt.getTime() === correction.observedAt.getTime())!
  expect(correction.value).toBe(original.value! + 1)
  expect(final.readings.filter((row) => row.revision === 1)).toHaveLength(2269)
  expect(final.readings.filter((row) => row.revision === 1)).toEqual(first.readings)
  expect(final.polls).toHaveLength(3)
  expect(final.events).toHaveLength(6)
  expect(t.published).toHaveLength(2)
  expect(t.http).toHaveBeenCalledTimes(3)
}, 60000)

test.each(['job-first', 'event-first', 'concurrent'] as const)(
  'fresh per-source backfill satisfies immediate %s polling without claiming live freshness',
  async (order) => {
    const t = await fixture()
    const event = () => t.jobs.backfill(t.plan.sources[0]!, t.plan, null)
    if (order === 'event-first') await event()
    if (order === 'concurrent') await Promise.all([event(), t.jobs.runAdapter('jps_rain', null)])
    else await t.jobs.runAdapter('jps_rain', null)
    await event()
    // A new runtime must reuse the durable capture too, without a process cache.
    await createSourceJobs(t.ports).runAdapter('jps_rain', null)
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results.every((result) => result.purpose === 'backfill' && result.scheduledAt === null)).toBe(true)
    for (const ref of t.refs) await t.ingest(ref)
    let rows = await t.rows()
    expect(rows.polls).toHaveLength(1)
    expect(rows.polls[0]!.purpose).toBe('backfill')
    expect(rows.readings).toHaveLength(2269)
    expect(rows.events).toHaveLength(2)
    await createSourceJobs(t.ports).runAdapter('jps_rain', null)
    expect(t.http).toHaveBeenCalledTimes(1)
    await t.clock.advance(300000)
    await t.jobs.runAdapter('jps_rain', null)
    await t.ingest()
    rows = await t.rows()
    expect(t.http).toHaveBeenCalledTimes(2)
    expect(rows.polls).toHaveLength(2)
    expect(rows.polls[1]!.purpose).toBe('poll')
  },
  60000
)

test.each(['data', 'rf', 'stationId'] as const)(
  'real runner persists one schema-error poll for mutated %s without falling back to populated history',
  async (mutation) => {
    const t = await fixture()
    await t.jobs.backfill(t.plan.sources[0]!, t.plan, null)
    await t.ingest()
    const invalid = JSON.parse(graph)
    if (mutation === 'data') {
      invalid.renamed = invalid.data
      delete invalid.data
    }
    if (mutation === 'rf') invalid.data[0].rf = '0'
    if (mutation === 'stationId') invalid.stationId = 76
    t.setBody(JSON.stringify(invalid))
    await t.clock.advance(300000)
    await t.jobs.runAdapter('jps_rain', null)
    expect(t.results.at(-1)!.polls).toMatchObject([{ outcome: 'error', error: { type: 'schema' }, readings: [] }])
    await t.ingest()
    const rows = await t.rows()
    expect(t.http).toHaveBeenCalledTimes(2)
    expect(rows.readings).toHaveLength(2269)
    expect(rows.polls).toHaveLength(2)
    expect(rows.polls[1]).toMatchObject({ outcome: 'error', errorCode: 'schema', httpStatus: 200, latencyMs: 37 })
    expect(rows.events).toHaveLength(4)
  },
  60000
)

test('real discovery catalogue transaction retains metadata and preserves all rows on malformed discovery', async () => {
  let body = html
  const adapter = createJpsRainAdapter({ userAgent: 'Skyclause/test', discoveryHttp: async () => new Response(body) })
  const store = new MemoryStore()
  const catalogue = vi.fn(
    async (a: typeof adapter, entries: Awaited<ReturnType<NonNullable<typeof adapter.discover>>>) => {
      await withSystem('test:jps-catalogue', (tx) => upsertSourceCatalogue(tx, a, entries))
    }
  )
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock: new TestClock(),
    id: randomUUID,
    adapters: [adapter],
    http: fetch,
    userAgent: 'Skyclause/test',
    publish: async () => {},
    database: { snapshot: sourceSnapshot, catalogue },
    log: () => {}
  })
  await jobs.catalogueSync()
  const catalogueRows = () =>
    withSystem('test:jps-catalogue', (tx) =>
      tx.select().from(source).where(eq(source.kind, 'jps_rain')).orderBy(source.id)
    )
  const before = await catalogueRows()
  expect(before.filter((row) => row.licenceLabel === jpsRain.licence.label)).toHaveLength(49)
  expect(before.find((row) => row.externalId === '0232901RF')).toMatchObject({
    ownerOrgId: null,
    meta: { jps_id: 75 },
    lat: null,
    lon: null,
    cadenceS: 300,
    staleAfterS: 600,
    licenceId: null
  })
  body = html.replace('id="Online-rainfalldata"', 'id="renamed-table"')
  if (body === html) body = html.replace('<tbody', '<renamed')
  await expect(jobs.catalogueSync()).rejects.toThrow()
  expect(catalogue).toHaveBeenCalledTimes(1)
  expect(await catalogueRows()).toEqual(before)
})

test.each(['schema', 'http'] as const)(
  'fresh %s error backfill is retained and immediately shared without another GET',
  async (failure) => {
    const t = await fixture()
    if (failure === 'schema') t.setBody(JSON.stringify({ ...JSON.parse(graph), data: 'renamed' }))
    else t.setStatus(500)
    await t.jobs.runAdapter('jps_rain', null)
    await t.ingest()
    await Promise.all([
      t.jobs.backfill(t.plan.sources[0]!, t.plan, null),
      createSourceJobs(t.ports).runAdapter('jps_rain', null)
    ])
    expect(t.http).toHaveBeenCalledTimes(1)
    expect(t.results.every((result) => result.purpose === 'backfill')).toBe(true)
    const rows = await t.rows()
    expect(rows.polls).toHaveLength(1)
    expect(rows.polls[0]).toMatchObject({
      purpose: 'backfill',
      outcome: 'error',
      errorCode: failure,
      httpStatus: failure === 'schema' ? 200 : 500,
      latencyMs: 37
    })
    expect(rows.readings).toEqual([])
    expect(rows.events).toHaveLength(2)
  }
)

test('saved fresh backfill bytes survive claim-completion interruption and satisfy the immediate poll', async () => {
  const t = await fixture(),
    write = t.store.write.bind(t.store)
  let interrupted = false
  t.store.write = async (path, body, generation) => {
    if (
      path.startsWith('control/backfills/') &&
      JSON.parse(Buffer.from(body).toString()).state === 'complete' &&
      !interrupted
    ) {
      interrupted = true
      throw new Error('interrupted after durable save')
    }
    return write(path, body, generation)
  }
  await expect(t.jobs.backfill(t.plan.sources[0]!, t.plan, null)).rejects.toThrow('interrupted after durable save')
  expect(t.refs).toHaveLength(0)
  await t.clock.advance(60001)
  await createSourceJobs(t.ports).runAdapter('jps_rain', null)
  expect(t.http).toHaveBeenCalledTimes(1)
  await t.ingest()
  const rows = await t.rows()
  expect(rows.readings).toHaveLength(2269)
  expect(rows.polls).toHaveLength(1)
  expect(rows.polls[0]!.purpose).toBe('backfill')
  expect(rows.events).toHaveLength(2)
}, 60000)
