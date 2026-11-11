import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { and, eq, inArray } from 'drizzle-orm'
import { beforeEach, expect, inject, test } from 'vitest'
import { check, evaluate, snapshotAt, type IndicatorSnapshot, type ReadingHistory } from '@skyclause/clauses'
import {
  domainEvent,
  closeConnections,
  loadStoredRequest,
  poll,
  project,
  projectSource,
  previousSourceDigest,
  reading,
  sourceBackfillCoverage,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { memberOf, refusal, testDatabase } from '../../../packages/db/test/harness'
import { createDatabase, dropDatabase } from '../../../packages/db/scripts/local'
import type {} from '../../../packages/db/test/harness/global-setup'
import { createApimsAdapter } from '../../../packages/sources/src/adapters/apims'
import { apimsIndicators } from '../../../packages/sources/src/indicators/apims'
import { createSourceJobs } from '../src/sources/jobs'
import { sourceSnapshot, readSourcePlan } from '../src/sources/plan'
import { ingestSourceResult, parseSourceResult, sourceIngestionDatabase } from '../src/sources/ingest'
import { publishSourceResult, sha256, type ResultReference } from '../src/sources/pubsub'
import { decodeObject } from '../src/sources/storage'
import type { SourceExecutionResult } from '../src/sources/types'
import { MemoryStore, TestClock, flush } from './support/source-adapter'

const capture = (name: string) =>
  readFileSync(new URL(`../../../packages/sources/test/fixtures/${name}`, import.meta.url))
const map = capture('mapcaqm-20261105T1313Z.json')
const principal = systemPrincipal('apims-provenance-integration')

// Clone the harness's file-private database for each scenario, retaining real catalogue IDs
// and every production append-only trigger rather than deleting persisted domain evidence.
beforeEach(async () => {
  await closeConnections()
  await dropDatabase(testDatabase())
  await createDatabase(testDatabase(), inject('dbTemplate'))
})

async function fixture(ids = ['CA16W', 'CA17W', 'CA19B']) {
  const adapter = createApimsAdapter()
  const catalogue = adapter.latestSlot!.discover!(map)
  const sources = await withSystem(principal.job, async (tx) => {
    const rows = []
    for (const externalId of ids) {
      const actual = catalogue.find((s) => s.externalId === externalId)!
      rows.push(
        await makeSource(tx, {
          ...actual,
          kind: 'apims',
          cadenceS: adapter.cadence,
          staleAfterS: 7200,
          freshness: adapter.freshness,
          licenceId: adapter.licence.id,
          licenceLabel: adapter.licence.label
        })
      )
    }
    return rows
  })
  const orgs = await Promise.all([makeOrganization(), makeOrganization(), makeOrganization()])
  const projects: Awaited<ReturnType<typeof makeProject>>[] = []
  for (const [index, org] of orgs.entries())
    projects.push(
      await withTenant({ orgId: org.id, principal }, async (tx) => {
        const p = await makeProject(tx)
        if (index < 2)
          for (const s of sources) await makeProjectSource(tx, { projectId: p.id, sourceId: s.id, role: 'api_station' })
        return p
      })
    )
  const store = new MemoryStore(),
    clock = new TestClock(),
    results: SourceExecutionResult[] = [],
    refs: ResultReference[] = [],
    requests: Array<{ url: string; body: Uint8Array | null }> = []
  // Labelled virtual capture/ingest clocks. Literal scenes retain DOE observation times;
  // the explicitly named SIMULATED overlap scene derives its own in-memory test times.
  clock.time = Date.parse('2026-11-05T13:15:00Z')
  let receiveAt = new Date('2026-11-05T13:16:00Z')
  let transport = async (_url: string, _signal: AbortSignal | null | undefined) => {
    await clock.advance(37)
    return new Response(map)
  }
  let historyEnabled = false
  const jobs = createSourceJobs({
    store,
    scratch: store,
    clock,
    id: randomUUID,
    adapters: [adapter],
    userAgent: 'Skyclause/APIMS integration test',
    http: async (input, init) => {
      const url = String(input)
      const request = { url, body: null as Uint8Array | null }
      requests.push(request)
      const response = await transport(url, init?.signal)
      request.body = new Uint8Array(await response.clone().arrayBuffer())
      return response
    },
    database: {
      // Latest-only scenes use the actual planner without history policies. History scenes
      // enable the actual APIMS policy; domain rows, bindings and eligibility always use PG.
      snapshot: (now) => sourceSnapshot(now, historyEnabled ? [adapter] : []),
      catalogue: async () => {}
    },
    publish: async (result) => {
      results.push(result)
      await publishSourceResult(result, { store, publish: async (ref) => void refs.push(ref) })
    },
    log: () => {}
  })
  const ingest = (ref: ResultReference) => {
    // Later simulated captures cannot be received before their transport clock.
    receiveAt = new Date(Math.max(receiveAt.getTime(), clock.now().getTime() + 1000))
    return ingestSourceResult(ref, {
      store,
      ...sourceIngestionDatabase([adapter], () => receiveAt),
      publish: async () => {}
    })
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
  const snapshot = async () => {
    const stored = await rows()
    const history: ReadingHistory = {
      sources: sources.map((s) => ({ ...s, meta: s.meta as Record<string, unknown> })),
      // Backfill cannot stand in for normal polls. Its actual readings may still supply
      // observed-time freshness, as specified by this adapter's real metadata.
      polls: stored.polls
        .filter((p) => p.purpose === 'poll')
        .map((p) => ({
          ...p,
          startedAt: p.startedAt.toISOString(),
          receivedAt: p.receivedAt?.toISOString(),
          outcome: p.outcome as 'ok' | 'unchanged' | 'error'
        })),
      readings: stored.readings.map((r) => ({
        ...r,
        observedAt: r.observedAt.toISOString(),
        receivedAt: r.receivedAt.toISOString(),
        deviceTime: r.deviceTime?.toISOString() ?? null,
        itemKey: r.itemKey ?? '',
        valueJson: r.valueJson as Record<string, unknown> | null
      }))
    }
    return snapshotAt(history, apimsIndicators, projects[0]!.id, 'sky', receiveAt.toISOString())
  }
  return {
    adapter,
    sources,
    orgs,
    projects,
    store,
    clock,
    jobs,
    results,
    refs,
    requests,
    ingest,
    rows,
    snapshot,
    receive: (at: string) => {
      receiveAt = new Date(at)
    },
    transport: (fn: typeof transport) => {
      transport = fn
    },
    history: () => {
      historyEnabled = true
    }
  }
}

// A test-owned APIMS-only sheet isolates these real indicator declarations from metadata
// owned by other adapters. It does not modify or disable any default production clause.
function verdict(snapshot: IndicatorSnapshot) {
  const checked = check(
    {
      pack: 'sky',
      clauses: [
        {
          key: 'apims_mornings',
          name: 'APIMS mornings',
          enabled: true,
          scope: 'site',
          requires: ['site.api_max', 'site.api_0600_min_last3_max'],
          when: 'site.api_max >= 0 && site.api_0600_min_last3_max >= 0',
          proposes: { mode: 'outdoor_limited' },
          wording: { en: 'Observed APIMS mornings' }
        }
      ]
    },
    apimsIndicators
  )
  expect(checked.ok).toBe(true)
  expect(checked.publishable).toBe(true)
  return evaluate(checked.sheet!, snapshot, [], snapshot.tEval).site[0]!
}

test('actual map capture persists exact provenance and two tenant event sets; replay is idempotent', async () => {
  const t = await fixture()
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  expect(t.requests).toHaveLength(1)
  const result = t.results[0]!,
    request = result.requests[0]!,
    ref = t.refs[0]!
  expect(Object.keys(ref).sort()).toEqual(['kind', 'object_path', 'operation_id', 'sha256'])
  expect(request).toMatchObject({
    bodySha256: sha256(map),
    httpStatus: 200,
    latencyMs: 37,
    transportStartedAt: '2026-11-05T13:15:00.000Z',
    startedAt: '2026-11-05T13:15:00.000Z',
    error: null
  })
  expect(Buffer.from(request.body!)).toEqual(map)
  expect(result).toMatchObject({ purpose: 'poll', scheduledAt: null })
  expect(parseSourceResult(decodeObject((await t.store.read(ref.object_path))!.body))).toEqual(result)
  await t.ingest(ref)
  const first = await t.rows()
  expect(first.polls).toHaveLength(3)
  expect(first.readings).toHaveLength(3)
  for (const p of first.polls)
    expect(p).toMatchObject({
      requestId: request.requestId,
      purpose: 'poll',
      bodySha256: sha256(map),
      httpStatus: 200,
      latencyMs: 37,
      startedAt: new Date(request.startedAt),
      outcome: 'ok'
    })
  expect(first.readings.map((r) => r.value).sort()).toEqual([57, 62, 67])
  for (const r of first.readings)
    expect(r).toMatchObject({
      metric: 'api',
      unit: 'API',
      observedAt: new Date('2026-11-05T13:00:00Z'),
      receivedAt: new Date('2026-11-05T13:16:00Z'),
      revision: 1,
      valueJson: { class: 'Moderate', param: '**' }
    })
  for (const p of t.projects.slice(0, 2)) expect(first.events.filter((e) => e.projectId === p.id)).toHaveLength(3)
  expect(first.events.some((e) => e.orgId === t.orgs[2]!.id)).toBe(false)
  const snapshot = await t.snapshot()
  expect(snapshot.site['site.api_max']).toMatchObject({ value: 67, state: 'fresh' })
  expect(snapshot.site['site.api_0600_min_last3_max']).toMatchObject({ value: null, state: 'stale' })
  expect(verdict(snapshot)).toMatchObject({ mode: null, noCall: { inputs: expect.any(Array) } })
  await t.ingest(ref)
  expect(await t.rows()).toEqual(first)
})

test('missing CA19B is a local D15 error with HTTP 200; successful siblings pass the trust boundary', async () => {
  const t = await fixture()
  const body = JSON.parse(map.toString())
  body.data = body.data.filter((r: { STATION_ID: string }) => r.STATION_ID !== 'CA19B')
  const bytes = Buffer.from(JSON.stringify(body))
  t.transport(async () => {
    await t.clock.advance(19)
    return new Response(bytes)
  })
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  const result = t.results[0]!,
    wire = decodeObject<Record<string, unknown>>((await t.store.read(t.refs[0]!.object_path))!.body)
  expect(parseSourceResult(wire)).toEqual(result)
  expect(result.requests[0]).toMatchObject({ httpStatus: 200, error: null, bodySha256: sha256(bytes), latencyMs: 19 })
  expect(result.polls.find((p) => p.sourceId === t.sources[2]!.id)).toMatchObject({
    outcome: 'error',
    readings: [],
    error: { type: 'schema', message: expect.stringContaining('CA19B') }
  })
  expect(result.polls.find((p) => p.sourceId === t.sources[2]!.id)!.error!.message).toContain(t.sources[2]!.id)
  for (const field of ['error', 'httpStatus', 'bodySha256'] as const) {
    const forged = structuredClone(wire) as unknown as { requests: Array<Record<string, unknown>> }
    forged.requests[0]![field] =
      field === 'error'
        ? { type: 'schema', message: 'forged shared error' }
        : field === 'httpStatus'
          ? 503
          : '0'.repeat(64)
    expect(() => parseSourceResult(forged)).toThrow()
  }
  await t.ingest(t.refs[0]!)
  const stored = await t.rows()
  expect(stored.polls).toHaveLength(3)
  expect(stored.polls.every((p) => p.httpStatus === 200 && p.bodySha256 === sha256(bytes))).toBe(true)
  expect(stored.readings).toHaveLength(2)
  expect((await t.snapshot()).site['site.api_max']).toMatchObject({ state: 'error' })
  expect(verdict(await t.snapshot()).noCall).not.toBeNull()
})

test('real transport deadline yields three null-status timeout polls and no invented observations', async () => {
  const t = await fixture()
  t.transport(
    (_url, signal) =>
      new Promise<Response>((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
  )
  await t.jobs.refreshSourcePlan(t.clock.now())
  const run = t.jobs.runAdapter('apims', null)
  await flush()
  expect(t.requests).toHaveLength(1)
  await t.clock.advance(20_000)
  await run
  expect(t.results[0]!.requests[0]).toMatchObject({ httpStatus: null, body: null, bodySha256: null, latencyMs: 20_000 })
  await t.ingest(t.refs[0]!)
  const stored = await t.rows()
  expect(stored.polls).toHaveLength(3)
  expect(stored.polls.every((p) => p.httpStatus === null && p.errorCode === 'timeout' && p.outcome === 'error')).toBe(
    true
  )
  expect(stored.readings).toEqual([])
  expect((await t.snapshot()).site['site.api_max']).toMatchObject({ state: 'error', value: null })
  expect(verdict(await t.snapshot()).noCall).not.toBeNull()
})

test.each([{ order: [0, 1, 2] }, { order: [2, 0, 1] }])(
  'three real history children persist 73 hourly identities in order $order',
  async ({ order }) => {
    const t = await fixture(['CA16W'])
    t.clock.time = Date.parse('2026-11-03T15:30:00Z')
    t.receive('2026-11-03T15:31:00Z')
    t.history()
    t.transport(async (url) => {
      await t.clock.advance(23)
      const u = new URL(url)
      if (!u.pathname.endsWith('/apitablehourly')) return new Response(map)
      const day = u.searchParams.get('datetime')!.slice(0, 10).replaceAll('-', '')
      return new Response(capture(`apitablehourly-state14-${day}T230000-20261107T080610Z.json`))
    })
    await t.jobs.refreshSourcePlan(t.clock.now())
    const authoritative = await readSourcePlan(t.store)
    await t.jobs.backfill(authoritative.sources[0]!, authoritative, null)
    const children = t.results.filter((r) => r.purpose === 'backfill')
    expect(t.requests).toHaveLength(3)
    expect(children).toHaveLength(3)
    expect(children.map((r) => r.polls[0]!.readings.length)).toEqual([25, 25, 25])
    expect(new Set(children.map((r) => r.requests[0]!.requestId)).size).toBe(3)
    const historyRefs = children.map((r) => t.refs.find((ref) => ref.operation_id === r.operationId)!)
    for (const index of order) await t.ingest(historyRefs[index]!)
    const first = await t.rows()
    expect(first.readings).toHaveLength(73)
    expect(
      new Set(first.readings.map((r) => `${r.sourceId}|${r.metric}|${r.observedAt.toISOString()}|${r.itemKey}`)).size
    ).toBe(73)
    expect(first.readings.every((r) => r.revision === 1 && !Object.hasOwn(r.valueJson!, 'class'))).toBe(true)
    expect(first.readings.every((r) => r.receivedAt.toISOString() === '2026-11-03T15:31:00.000Z')).toBe(true)
    for (const child of children) {
      const request = child.requests[0]!,
        raw = t.requests.find((r) => r.url === request.url)!.body!
      expect(request.bodySha256).toBe(sha256(raw))
      expect(first.polls.find((p) => p.requestId === request.requestId)).toMatchObject({
        purpose: 'backfill',
        httpStatus: 200,
        bodySha256: sha256(raw),
        latencyMs: 23,
        startedAt: new Date(request.startedAt)
      })
    }
    const plan = await readSourcePlan(t.store)
    if (plan.version !== 2) throw new Error('expected v2')
    const required = plan.backfillGroups[0]!.requiredObservations
    expect(
      first.readings.filter((r) => required.some((key) => r.observedAt.toISOString() === key.observedAt))
    ).toHaveLength(3)
    expect(
      await withSystem(principal.job, (tx) =>
        sourceBackfillCoverage(tx, {
          kind: 'apims',
          groupByMeta: 'state_id',
          groupValue: 14,
          sourceIds: [t.sources[0]!.id],
          required: required.map((r) => ({ ...r, observedAt: new Date(r.observedAt) }))
        })
      )
    ).toEqual({ hasBackfillPoll: true, missingSourceIds: [] })
    const snapshot = await t.snapshot()
    expect(snapshot.site['site.api_0600_min_last3_max']).toMatchObject({ value: 65, state: 'fresh' })
    const morningRows = first.readings.filter((r) =>
      snapshot.site['site.api_0600_min_last3_max']!.readingIds.includes(r.id)
    )
    expect(morningRows.map((r) => r.value).sort((a, b) => a! - b!)).toEqual([65, 81, 83])
    // Fresh actual observations remain usable for this observed-freshness source, but no
    // history child is recorded or reusable as a successful normal poll.
    expect(first.polls.every((p) => p.purpose === 'backfill')).toBe(true)
    expect(await withSystem(principal.job, (tx) => previousSourceDigest(tx, t.sources[0]!.id, 'poll'))).toBeNull()
    expect(verdict(snapshot)).toMatchObject({ mode: 'outdoor_limited', noCall: null })
    for (const ref of [...historyRefs].reverse()) await t.ingest(ref)
    expect(await t.rows()).toEqual(first)
  }
)

test.each(['history-first', 'history-late'] as const)(
  'SIMULATED shared history/latest identity deduplicates equal payloads and fences older capture (%s)',
  async (order) => {
    const t = await fixture(['CA16W'])
    t.clock.time = Date.parse('2026-11-05T15:30:00Z')
    t.receive('2026-11-05T16:30:00Z')
    t.history()
    const generated = new Map<string, Uint8Array>()
    t.transport(async (url) => {
      await t.clock.advance(31)
      const u = new URL(url)
      if (!u.pathname.endsWith('/apitablehourly')) return new Response(map)
      // SIMULATION ONLY: the literal archives do not overlap. Shift each real history
      // window forward two days, and re-publish the archived map measurement/metadata
      // at its shared hour. These generated bytes are not a claimed provider capture.
      const day = Number(u.searchParams.get('datetime')!.slice(8, 10)) - 2
      const body = JSON.parse(capture(`apitablehourly-state14-2026110${day}T230000-20261107T080610Z.json`).toString())
      for (const row of body.api_table_hourly) {
        row.DATETIME = new Date(Date.parse(`${row.DATETIME}Z`) + 2 * 86400_000).toISOString().slice(0, 19)
        if (row.STATION_ID === 'CA16W' && row.DATETIME === '2026-11-05T21:00:00') {
          const actual = JSON.parse(map.toString()).data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA16W')
          row.API = actual.API
          row.CLASS = actual.CLASS
          row.PARAM_SYMBOL = actual.PARAM_SYMBOL
        }
      }
      const bytes = Buffer.from(JSON.stringify(body))
      generated.set(url, bytes)
      return new Response(bytes)
    })
    await t.jobs.refreshSourcePlan(t.clock.now())
    const plan = await readSourcePlan(t.store)
    await t.jobs.backfill(plan.sources[0]!, plan, null)
    expect(t.results).toHaveLength(3)
    const history = t.refs[0]!
    for (const result of t.results) {
      const request = result.requests[0]!
      expect(request.bodySha256).toBe(sha256(generated.get(request.url!)!))
      expect(result.purpose).toBe('backfill')
    }
    if (order === 'history-first') await t.ingest(history)
    t.transport(async () => {
      await t.clock.advance(37)
      return new Response(map)
    })
    await t.clock.advance(900_000)
    await t.jobs.runAdapter('apims', null)
    const latestA = t.refs.at(-1)!
    await t.ingest(latestA)
    const shared = async () =>
      (await t.rows()).readings
        .filter((r) => r.observedAt.toISOString() === '2026-11-05T13:00:00.000Z')
        .sort((a, b) => a.revision - b.revision)
    expect((await shared()).map((r) => r.value)).toEqual([67])
    const changed = JSON.parse(map.toString())
    changed.data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA16W').API = 68
    const changedBytes = Buffer.from(JSON.stringify(changed))
    t.transport(async () => {
      await t.clock.advance(37)
      return new Response(changedBytes)
    })
    await t.clock.advance(900_000)
    await t.jobs.runAdapter('apims', null)
    const latestB = t.refs.at(-1)!
    expect(t.results.at(-1)!.requests[0]!.bodySha256).toBe(sha256(changedBytes))
    await t.ingest(latestB)
    if (order === 'history-late') await t.ingest(history)
    const first = await t.rows()
    expect((await shared()).map((r) => [r.revision, r.value])).toEqual([
      [1, 67],
      [2, 68]
    ])
    expect(first.polls.filter((p) => p.purpose === 'backfill')).toHaveLength(1)
    expect(first.polls.filter((p) => p.purpose === 'poll')).toHaveLength(2)
    for (const ref of [history, latestA, latestB]) await t.ingest(ref)
    expect(await t.rows()).toEqual(first)
  }
)

test.each(['ordered', 'late-old'] as const)(
  'captured value A to B to A respects append-only revisions and capture fences (%s)',
  async (order) => {
    const t = await fixture(['CA16W'])
    await t.jobs.refreshSourcePlan(t.clock.now())
    await t.jobs.runAdapter('apims', null)
    await t.ingest(t.refs[0]!)
    // Mutate only an in-memory copy of a genuine captured value. The runner creates all identities/clocks.
    const changed = JSON.parse(map.toString())
    changed.data.find((r: { STATION_ID: string }) => r.STATION_ID === 'CA16W').API = 68
    t.transport(async () => {
      await t.clock.advance(37)
      return new Response(JSON.stringify(changed))
    })
    await t.clock.advance(900_000)
    await t.jobs.runAdapter('apims', null)
    t.transport(async () => {
      await t.clock.advance(37)
      return new Response(map)
    })
    await t.clock.advance(900_000)
    await t.jobs.runAdapter('apims', null)
    for (const index of order === 'ordered' ? [1, 2] : [2, 1]) await t.ingest(t.refs[index]!)
    const stored = await t.rows()
    expect(stored.polls).toHaveLength(3)
    expect(stored.readings.sort((a, b) => a.revision - b.revision).map((r) => r.value)).toEqual(
      order === 'ordered' ? [67, 68, 67] : [67]
    )
    await t.ingest(t.refs[1]!)
    await t.ingest(t.refs[0]!)
    expect((await t.rows()).readings).toHaveLength(stored.readings.length)
  }
)

test('a captured A+B cohort cannot widen a global receipt after B is unbound before first ingestion', async () => {
  const t = await fixture(['CA16W', 'CA19B'])
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  const original = (await t.store.read(t.refs[0]!.object_path))!.body
  for (const p of t.projects.slice(0, 2))
    await withTenant({ orgId: p.orgId, principal }, (tx) =>
      tx
        .delete(projectSource)
        .where(and(eq(projectSource.projectId, p.id), eq(projectSource.sourceId, t.sources[1]!.id)))
    )
  await t.ingest(t.refs[0]!)
  const first = await t.rows(),
    requestId = t.results[0]!.requests[0]!.requestId
  expect(first.polls.map((p) => p.sourceId)).toEqual([t.sources[0]!.id])
  expect(first.readings).toHaveLength(1)
  expect(first.events).toHaveLength(2)
  const receipt = await withSystem(principal.job, (tx) => loadStoredRequest(tx, requestId))
  for (const p of t.projects.slice(0, 2))
    await withTenant({ orgId: p.orgId, principal }, (tx) =>
      makeProjectSource(tx, { projectId: p.id, sourceId: t.sources[1]!.id, role: 'api_station' })
    )
  await t.ingest(t.refs[0]!)
  expect(await t.rows()).toEqual(first)
  expect(await withSystem(principal.job, (tx) => loadStoredRequest(tx, requestId))).toEqual(receipt)
  expect((await t.store.read(t.refs[0]!.object_path))!.body).toEqual(original)
  const bInputs = (await t.snapshot()).inputs.filter((i) => i.sourceId === t.sources[1]!.id)
  expect(bInputs.length).toBeGreaterThan(0)
  expect(bInputs.every((i) => i.state !== 'fresh')).toBe(true)
  await t.clock.advance(900_000)
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  expect(t.requests).toHaveLength(2)
  expect(t.results.at(-1)!.requests[0]!.requestId).not.toBe(requestId)
  t.receive('2026-11-05T13:32:00Z')
  await t.ingest(t.refs.at(-1)!)
  const after = await t.rows()
  expect(after.polls.filter((p) => p.sourceId === t.sources[1]!.id)).toHaveLength(1)
  expect(after.readings.filter((r) => r.sourceId === t.sources[1]!.id)).toHaveLength(1)
})

test('archived/unbound projects get no fanout and stored receipts survive removal; actual rows reject mutation', async () => {
  const t = await fixture()
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  await withTenant({ orgId: t.orgs[0]!.id, principal }, (tx) =>
    tx.update(project).set({ archivedAt: t.clock.now() }).where(eq(project.id, t.projects[0]!.id))
  )
  await withTenant({ orgId: t.orgs[1]!.id, principal }, (tx) =>
    tx.delete(projectSource).where(eq(projectSource.projectId, t.projects[1]!.id))
  )
  await t.ingest(t.refs[0]!)
  expect(await t.rows()).toEqual({ polls: [], readings: [], events: [] })
  await withTenant({ orgId: t.orgs[1]!.id, principal }, async (tx) => {
    for (const s of t.sources)
      await makeProjectSource(tx, { projectId: t.projects[1]!.id, sourceId: s.id, role: 'api_station' })
  })
  await t.clock.advance(900_000)
  await t.jobs.refreshSourcePlan(t.clock.now())
  await t.jobs.runAdapter('apims', null)
  await t.ingest(t.refs.at(-1)!)
  const first = await t.rows()
  expect(first.polls).toHaveLength(3)
  expect(first.events).toHaveLength(3)
  const requestId = t.results.at(-1)!.requests[0]!.requestId
  const receipt = await withSystem(principal.job, (tx) => loadStoredRequest(tx, requestId))
  for (const table of [poll, reading]) {
    const id = table === poll ? first.polls[0]!.id : first.readings[0]!.id
    for (const action of ['update', 'delete'] as const) {
      const message = await refusal(
        withTenant({ orgId: t.orgs[1]!.id, principal }, (tx) =>
          action === 'update'
            ? tx.update(table).set({ id }).where(eq(table.id, id))
            : tx.delete(table).where(eq(table.id, id))
        )
      )
      expect(message).toMatch(/permission denied|append.only/)
    }
  }
  expect(
    await withTenant({ orgId: t.orgs[2]!.id, principal: memberOf(t.orgs[2]!.id) }, (tx) =>
      tx
        .select()
        .from(domainEvent)
        .where(
          inArray(
            domainEvent.projectId,
            t.projects.slice(0, 2).map((p) => p.id)
          )
        )
    )
  ).toEqual([])
  await withTenant({ orgId: t.orgs[1]!.id, principal }, (tx) =>
    tx.delete(projectSource).where(eq(projectSource.projectId, t.projects[1]!.id))
  )
  await t.ingest(t.refs.at(-1)!)
  expect(await t.rows()).toEqual(first)
  expect(await withSystem(principal.job, (tx) => loadStoredRequest(tx, requestId))).toEqual(receipt)
})
