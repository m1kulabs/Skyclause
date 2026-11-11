import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { createJpsRainAdapter } from '../../../packages/sources/src/adapters/jps'
import { createApimsAdapter } from '../../../packages/sources/src/adapters/apims'
import { recoverLatestSlot } from '../src/sources/slots'
import type { Source } from '@skyclause/sources'
import { runGroupedBackfillOnce, type GroupedBackfillClaim } from '../src/sources/grouped-backfill'
import { executeSourceStep } from '../src/sources/execute'
import { backfillGroupKey, type PlannedBackfillGroup } from '../src/sources/plan'
import { createSourceJobs } from '../src/sources/jobs'
import { encodeObject, decodeObject } from '../src/sources/storage'
import {
  publishSourceResult,
  reserveGroupedSourceResults,
  repairSourceResults,
  type ResultReference
} from '../src/sources/pubsub'
import { recoverSavedGroupedBackfill } from '../src/sources/grouped-backfill'
import { parseSourceResult } from '../src/sources/ingest'
import { MemoryStore, TestClock, context, flush } from './support/source-adapter'
import type { BackfillPorts } from '../src/sources/backfill'
import type { SourceExecutionResult } from '../src/sources/types'

const fixture = (name: string) =>
  readFileSync(new URL(`../../../packages/sources/test/fixtures/${name}`, import.meta.url))
const sources: Source[] = ['CA16W', 'CA15W', 'CA19B'].map((externalId, i) => ({
  id: randomUUID(),
  kind: 'apims',
  externalId,
  name: externalId,
  lat: null,
  lon: null,
  url: 'https://eqms.doe.gov.my/',
  meta: { state_id: i === 2 ? 10 : 14 }
}))
function setup(state = 14) {
  const store = new MemoryStore(),
    clock = new TestClock(),
    a = createApimsAdapter(),
    published: SourceExecutionResult[] = [],
    urls: string[] = []
  clock.time = Date.parse('2026-11-03T15:30:00Z')
  const members = sources.filter((s) => s.meta.state_id === state)
  const group: PlannedBackfillGroup = {
    key: backfillGroupKey('apims', 'state_id', state),
    kind: 'apims',
    sourceIds: members.map((s) => s.id).sort(),
    anchor: clock.now().toISOString(),
    requiredObservations: a.groupedBackfill!.requiredObservations(clock.now().toISOString()),
    eligible: true
  }
  const ports: BackfillPorts = {
    store,
    clock,
    id: randomUUID,
    contextFactory: (ss) =>
      context({
        kind: 'apims',
        family: undefined,
        sources: ss,
        clock,
        requestId: randomUUID,
        http: async (url) => {
          urls.push(String(url))
          const u = new URL(String(url)),
            day = u.searchParams.get('datetime')!.slice(0, 10).replaceAll('-', '')
          return new Response(fixture(`apitablehourly-state${state}-${day}T230000-20261107T080610Z.json`))
        }
      }),
    publish: async (r) => {
      published.push(r)
    }
  }
  return { store, clock, a, published, urls, members, group, ports }
}
test('one frozen group executes three serial physical captures with two polls per request, never refetches', async () => {
  const t = setup()
  const result = await Promise.all([
    runGroupedBackfillOnce(t.a, t.group, t.members, t.ports),
    runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  ])
  expect(result.sort()).toEqual(['complete', 'running'])
  expect(t.urls).toHaveLength(3)
  expect(t.urls.map((u) => new URL(u).searchParams.get('datetime'))).toEqual([
    '2026-11-03T23:00:00',
    '2026-11-02T23:00:00',
    '2026-11-01T23:00:00'
  ])
  expect(t.published).toHaveLength(3)
  for (const r of t.published) {
    expect(r.requests).toHaveLength(1)
    expect(r.polls).toHaveLength(2)
    expect(r.polls.every((p) => p.requestId === r.requests[0]!.requestId)).toBe(true)
    expect(r.requests[0]!.httpStatus).toBe(200)
    expect(r.requests[0]!.bodySha256).toHaveLength(64)
    expect(r.polls.every((p) => p.readings.length === 25)).toBe(true)
  }
  expect(new Set(t.published.map((r) => r.requests[0]!.requestId)).size).toBe(3)
  await runGroupedBackfillOnce(
    t.a,
    { ...t.group, anchor: '2026-11-10T00:00:00.000Z' },
    [...t.members, sources[2]!],
    t.ports
  )
  expect(t.urls).toHaveLength(3)
})
test('required observations are the latest three exact MYT mornings, including the 06:00 boundary', () => {
  const a = createApimsAdapter()
  expect(a.groupedBackfill!.requiredObservations('2026-11-10T21:59:59.000Z').map((r) => r.observedAt)).toEqual([
    '2026-11-09T22:00:00.000Z',
    '2026-11-08T22:00:00.000Z',
    '2026-11-07T22:00:00.000Z'
  ])
  expect(a.groupedBackfill!.requiredObservations('2026-11-10T22:00:00.000Z')[0]!.observedAt).toBe(
    '2026-11-10T22:00:00.000Z'
  )
})
test('step two error still attempts distinct step three and retains successful siblings', async () => {
  const t = setup(),
    factory = t.ports.contextFactory
  let calls = 0
  t.ports.contextFactory = (ss, o) =>
    ++calls === 2
      ? context({
          kind: 'apims',
          family: undefined,
          sources: ss,
          clock: t.clock,
          requestId: randomUUID,
          http: async () => new Response('', { status: 500 })
        })
      : factory(ss, o)
  await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  expect(t.published.map((r) => r.polls[0]!.outcome)).toEqual(['ok', 'error', 'ok'])
  await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  expect(calls).toBe(3)
})
test('a step cannot hide multiple physical requests under one result', async () => {
  const t = setup()
  let gets = 0
  await expect(
    executeSourceStep(
      t.a,
      t.members,
      {
        key: 'bad',
        fetch: async (ctx) => {
          await ctx.http('https://example.test/1')
          await ctx.http('https://example.test/2')
          return { kind: 'latest' as const, body: {} }
        }
      },
      (ss) =>
        context({
          kind: 'apims',
          family: undefined,
          sources: ss,
          clock: t.clock,
          http: async () => {
            gets++
            return new Response('{}')
          }
        }),
      { operationId: randomUUID(), purpose: 'backfill', scheduledAt: null, clock: t.clock, requestId: randomUUID }
    )
  ).rejects.toThrow(/one physical request/)
  expect(gets).toBe(1)
})
test('v1 grouped execution is explicitly unavailable and all-bound latest keeps legacy batching', async () => {
  const t = setup()
  let gets = 0
  const jobs = createSourceJobs({
    store: t.store,
    scratch: t.store,
    clock: t.clock,
    id: randomUUID,
    adapters: [t.a],
    http: async () => {
      gets++
      return new Response(fixture('mapcaqm-20261105T1313Z.json'))
    },
    userAgent: 'test',
    publish: async () => {},
    database: {
      snapshot: async () => {
        throw new Error('scheduled DB forbidden')
      },
      catalogue: async () => {}
    },
    log: () => {}
  })
  const plan = {
    version: 1,
    generatedAt: t.clock.now().toISOString(),
    sources: t.members.map((source) => ({
      source,
      bindings: [{ orgId: randomUUID(), projectId: randomUUID() }],
      previousPollDigest: null,
      previousBackfillDigest: null
    })),
    periods: []
  }
  await t.store.write('control/plan.json', encodeObject(plan), '0')
  await expect(jobs.runAdapter('apims', null)).rejects.toThrow(/v2/)
  expect(gets).toBe(0)
  const saved = await t.store.read('control/plan.json')
  await t.store.write(
    'control/plan.json',
    encodeObject({ ...plan, version: 2, backfillGroups: [{ ...t.group, eligible: false }] }),
    saved!.generation
  )
  await jobs.runAdapter('apims', null)
  expect(gets).toBe(1)
})

test.each([0, 1, 2])('death after child %i byte save resumes identical children without refetch', async (index) => {
  const t = setup(),
    write = t.store.write.bind(t.store)
  let seen = 0,
    failed = false
  t.store.write = async (path, body, generation) => {
    const result = await write(path, body, generation)
    if (path.startsWith('control/results/grouped-backfills/') && seen++ === index && !failed) {
      failed = true
      throw new Error('death after save')
    }
    return result
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('death after save')
  const saved = [...t.store.objects.entries()]
    .filter(([path]) => path.startsWith('control/results/grouped-backfills/'))
    .map(([path, value]) => ({ path, body: Buffer.from(value.body).toString() }))
  await t.clock.advance(60001)
  await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  expect(t.urls).toHaveLength(3)
  for (const old of saved) expect(Buffer.from((await t.store.read(old.path))!.body).toString()).toBe(old.body)
  expect(new Set(t.published.map((r) => r.operationId)).size).toBe(3)
})
test('death before group completion and lost publish acknowledgement preserve all child identities', async () => {
  const t = setup(),
    write = t.store.write.bind(t.store)
  let fail = true
  t.store.write = async (path, body, generation) => {
    if (
      path.startsWith('control/grouped-backfills/') &&
      decodeObject<{ state: string }>(body).state === 'complete' &&
      fail
    ) {
      fail = false
      throw new Error('completion crash')
    }
    return write(path, body, generation)
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('completion crash')
  const originals = t.published.map((r) => structuredClone(r))
  await t.clock.advance(60001)
  await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  expect(t.urls).toHaveLength(3)
  expect(t.published.slice(3).map((r) => structuredClone(r))).toEqual(originals)
})
test('outbox admission failure happens before all provider GETs', async () => {
  const t = setup()
  t.ports.admit = async () => {
    throw new Error('outbox full')
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('outbox full')
  expect(t.urls).toHaveLength(0)
  const claim = decodeObject<{ children: unknown[] }>([...t.store.objects.values()][0]!.body)
  expect(claim.children).toHaveLength(3)
})
test('lease renewals exclude concurrent owners and a suspended expired owner cannot publish', async () => {
  const t = setup(),
    factory = t.ports.contextFactory
  let release!: () => void
  const held = new Promise<void>((r) => {
    release = r
  })
  t.ports.contextFactory = (ss, o) => {
    const c = factory(ss, o),
      http = c.ctx.http
    c.ctx.http = async (...args) => {
      await held
      return http(...args)
    }
    return c
  }
  const running = runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  await flush()
  await t.clock.advance(20000)
  expect(await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).toBe('running')
  t.clock.time += 60001
  t.clock.elapsed += 60001
  const replacement = { ...t.ports, contextFactory: factory }
  expect(await runGroupedBackfillOnce(t.a, t.group, t.members, replacement)).toBe('complete')
  release()
  expect(await running).toBe('running')
  expect(t.published).toHaveLength(3)
})
test('private group recovery repairs saved bytes and rejects changed anchor, membership or path', async () => {
  const t = setup(),
    refs: ResultReference[] = []
  t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
  t.ports.publish = async () => {
    throw new Error('publication crash')
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('publication crash')
  await t.clock.advance(60001)
  const pending = decodeObject<
    Array<{
      operation_id: string
      recovery: { type: 'group'; key: string; anchor: string; sourceIds: string[]; step: number }
    }>
  >((await t.store.read('control/pending-results.json'))!.body)
  const entry = pending[0]!
  const recover = (recovery: typeof entry.recovery) =>
    recoverSavedGroupedBackfill({
      store: t.store,
      recovery,
      operationId: entry.operation_id,
      kind: 'apims',
      now: t.clock.now(),
      validate: parseSourceResult
    })
  expect(await recover(entry.recovery)).not.toBeNull()
  await expect(recover({ ...entry.recovery, anchor: '2026-11-02T00:00:00.000Z' })).rejects.toThrow(/identity/)
  await expect(recover({ ...entry.recovery, sourceIds: [randomUUID()] })).rejects.toThrow(/identity/)
  await repairSourceResults({
    store: t.store,
    now: t.clock.now,
    publish: async (ref) => {
      refs.push(ref)
    },
    recoverGroup: (recovery, operationId, kind, now) =>
      recoverSavedGroupedBackfill({ store: t.store, recovery, operationId, kind, now, validate: parseSourceResult })
  })
  expect(refs).toHaveLength(1)
  expect(Object.keys(refs[0]!).sort()).toEqual(['kind', 'object_path', 'operation_id', 'sha256'])
  const claimPath = `control/grouped-backfills/${t.group.key}.json`,
    saved = (await t.store.read(claimPath))!,
    claim = decodeObject<{ children: Array<{ resultPath: string }> }>(saved.body)
  claim.children[0]!.resultPath = 'control/results/forged.json'
  await t.store.write(claimPath, encodeObject(claim), saved.generation)
  await expect(recover(entry.recovery)).rejects.toThrow(/identity/)
  expect(t.urls).toHaveLength(1)
})

import {
  withSystem,
  withTenant,
  systemPrincipal,
  sourceBackfillCoverage,
  reading,
  poll,
  emitEvent,
  domainEvent
} from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource } from '../../../packages/db/test/factories'
import { sourceSnapshot, readSourcePlan } from '../src/sources/plan'
import { sourceIngestionDatabase, ingestSourceResult } from '../src/sources/ingest'
import { sourceBoundConsumer } from '../src/sources/index'
import { and, eq, inArray } from 'drizzle-orm'

test('authoritative cross-tenant v2 plan, event race, six history GETs, actual morning persistence and terminal late binding', async () => {
  const t = setup(),
    principal = systemPrincipal('apims-backfill-test'),
    results: SourceExecutionResult[] = [],
    refs: ResultReference[] = []
  const publicSources: Awaited<ReturnType<typeof makeSource>>[] = []
  for (const s of sources)
    publicSources.push(
      await withSystem(principal.job, (tx) =>
        makeSource(tx, { kind: s.kind, externalId: s.externalId, meta: s.meta, url: s.url })
      )
    )
  const orgs = [await makeOrganization(), await makeOrganization()],
    projects: Awaited<ReturnType<typeof makeProject>>[] = []
  for (const org of orgs)
    projects.push(
      await withTenant({ orgId: org.id, principal }, async (tx) => {
        const project = await makeProject(tx)
        for (const source of publicSources)
          await makeProjectSource(tx, { projectId: project.id, sourceId: source.id, role: 'api_station' })
        const privateSource = await makeSource(tx, { kind: 'apims', meta: { state_id: 14 } })
        await makeProjectSource(tx, { projectId: project.id, sourceId: privateSource.id, role: 'api_station' })
        return project
      })
    )
  let dbSnapshots = 0
  const inFlight = new Map<string, number>()
  const historyUrls: string[] = []
  const jobs = createSourceJobs({
    store: t.store,
    scratch: t.store,
    clock: t.clock,
    id: randomUUID,
    adapters: [t.a],
    userAgent: 'test',
    log: () => {},
    database: {
      snapshot: (now) => {
        dbSnapshots++
        return sourceSnapshot(now, [t.a])
      },
      catalogue: async () => {}
    },
    http: async (url) => {
      const u = new URL(String(url))
      if (!u.pathname.endsWith('/apitablehourly')) return new Response(fixture('mapcaqm-20261105T1313Z.json'))
      const stateId = u.searchParams.get('stateid')!
      expect(inFlight.get(stateId) ?? 0).toBe(0)
      inFlight.set(stateId, 1)
      historyUrls.push(String(url))
      await Promise.resolve()
      inFlight.set(stateId, 0)
      const day = u.searchParams.get('datetime')!.slice(0, 10).replaceAll('-', ''),
        state = u.searchParams.get('stateid')!
      return new Response(fixture(`apitablehourly-state${state}-${day}T230000-20261107T080610Z.json`))
    },
    publish: async (result) => {
      results.push(result)
      await publishSourceResult(result, {
        store: t.store,
        publish: async (ref) => {
          refs.push(ref)
        }
      })
    }
  })
  const runtime = () => ({
    jobs,
    store: t.store,
    repair: async () => {},
    subscription: { pullSourceResults: async () => [], ackSourceResults: async () => {} },
    ingest: async () => {}
  })
  const event = await withTenant({ orgId: orgs[0]!.id, principal }, (tx) =>
    emitEvent(tx, {
      projectId: projects[0]!.id,
      type: 'source.bound',
      data: { source_id: publicSources[0]!.id, role: 'api_station' }
    })
  )
  const envelope = await withSystem(
    principal.job,
    async (tx) => (await tx.select().from(domainEvent).where(eq(domainEvent.id, event.id)))[0]!
  )
  const raw = {
    id: envelope.id,
    type: envelope.type,
    org_id: envelope.orgId,
    project_id: envelope.projectId,
    data: envelope.data,
    seq: envelope.seq,
    created_at: envelope.createdAt.toISOString()
  }
  await sourceBoundConsumer(runtime).handler(raw)
  expect(historyUrls).toHaveLength(0)
  expect(await t.store.read(`control/intents/${publicSources[0]!.id}.json`)).not.toBeNull()
  await jobs.refreshSourcePlan(t.clock.now())
  const plan = await readSourcePlan(t.store)
  expect(plan.version).toBe(2)
  if (plan.version !== 2) throw new Error('expected v2')
  expect(plan.sources).toHaveLength(3)
  expect(plan.sources.every((e) => e.bindings.length === 2)).toBe(true)
  expect(plan.backfillGroups).toHaveLength(2)
  expect(plan.backfillGroups.every((g) => g.eligible && g.anchor === plan.generatedAt)).toBe(true)
  const state14 = plan.backfillGroups.find((g) => g.key === t.group.key)!
  expect(state14.sourceIds).toHaveLength(2)
  // Event and scheduler use the same global frozen group; neither queries DB for membership.
  const competing = await withTenant({ orgId: orgs[0]!.id, principal }, (tx) =>
    emitEvent(tx, {
      projectId: projects[0]!.id,
      type: 'source.bound',
      data: { source_id: publicSources[0]!.id, role: 'api_station' }
    })
  )
  await Promise.all([
    jobs.runAdapter('apims', null),
    sourceBoundConsumer(runtime).handler({ ...raw, id: competing.id })
  ])
  expect(dbSnapshots).toBe(1)
  expect(historyUrls).toHaveLength(6)
  const history = [...new Map(results.filter((r) => r.purpose === 'backfill').map((r) => [r.operationId, r])).values()]
  for (const result of results.filter((r) => r.purpose === 'backfill'))
    expect(result).toEqual(history.find((r) => r.operationId === result.operationId))
  expect(history).toHaveLength(6)
  expect(history.filter((r) => r.polls.length === 2)).toHaveLength(3)
  const required = state14.requiredObservations.map((r) => ({ metric: r.metric, observedAt: new Date(r.observedAt) }))
  const check = () =>
    withSystem(principal.job, (tx) =>
      sourceBackfillCoverage(tx, {
        kind: 'apims',
        groupByMeta: 'state_id',
        groupValue: 14,
        sourceIds: state14.sourceIds,
        required
      })
    )
  expect(await check()).toEqual({ hasBackfillPoll: false, missingSourceIds: state14.sourceIds })
  const ingest = (ref: ResultReference) =>
    ingestSourceResult(ref, { store: t.store, ...sourceIngestionDatabase([t.a], t.clock.now), publish: async () => {} })
  for (const ref of refs) await ingest(ref)
  expect(await check()).toEqual({ hasBackfillPoll: true, missingSourceIds: [] })
  const rows = await withSystem(principal.job, (tx) =>
    tx
      .select()
      .from(reading)
      .where(
        and(
          inArray(reading.sourceId, state14.sourceIds),
          inArray(
            reading.observedAt,
            required.map((r) => r.observedAt)
          )
        )
      )
  )
  for (const sourceId of state14.sourceIds)
    expect(new Set(rows.filter((r) => r.sourceId === sourceId).map((r) => r.observedAt.toISOString())).size).toBe(3)
  await jobs.runAdapter('apims', null)
  expect(historyUrls).toHaveLength(6)
  const late = await withSystem(principal.job, (tx) =>
    makeSource(tx, { kind: 'apims', externalId: 'CA20B', meta: { state_id: 10 } })
  )
  await withTenant({ orgId: orgs[0]!.id, principal }, (tx) =>
    makeProjectSource(tx, { projectId: projects[0]!.id, sourceId: late.id, role: 'api_station' })
  )
  await jobs.refreshSourcePlan(t.clock.now())
  const refreshed = await readSourcePlan(t.store)
  if (refreshed.version !== 2) throw new Error('expected v2')
  expect(refreshed.backfillGroups.every((g) => !g.eligible)).toBe(true)
  await jobs.runAdapter('apims', null)
  expect(historyUrls).toHaveLength(6)
  expect(results.at(-1)!.polls.some((p) => p.sourceId === late.id)).toBe(false)
  await t.clock.advance(900000)
  await jobs.runAdapter('apims', null)
  expect(historyUrls).toHaveLength(6)
  expect(results.at(-1)!.polls.some((p) => p.sourceId === late.id)).toBe(true)
  const latePolls = await withSystem(principal.job, (tx) => tx.select().from(poll).where(eq(poll.sourceId, late.id)))
  expect(latePolls).toHaveLength(0)
  expect(
    await withSystem(principal.job, (tx) =>
      sourceBackfillCoverage(tx, {
        kind: 'apims',
        groupByMeta: 'state_id',
        groupValue: 10,
        sourceIds: [late.id],
        required
      })
    )
  ).toEqual({ hasBackfillPoll: true, missingSourceIds: [late.id] })
})

import { snapshotAt } from '@skyclause/clauses'
import { apimsIndicators } from '../../../packages/sources/src/indicators/apims'
import { MAX_PENDING_RESULTS, resultPath } from '../src/sources/pubsub'

test('one fresh real day cannot satisfy the three-morning reducer', async () => {
  const t = setup()
  t.clock.time = Date.parse('2026-11-10T14:30:00Z')
  const step = t.a.groupedBackfill!.steps(t.members, t.clock.now().toISOString())[0]!
  const result = await executeSourceStep(
    t.a,
    t.members,
    step,
    (ss) =>
      context({
        kind: 'apims',
        family: undefined,
        sources: ss,
        clock: t.clock,
        requestId: randomUUID,
        http: async () => new Response(fixture('apitablehourly-state14-20261110T141922Z.json'))
      }),
    { operationId: randomUUID(), purpose: 'backfill', scheduledAt: null, clock: t.clock, requestId: randomUUID }
  )
  expect(result.polls.every((p) => p.readings.length === 25)).toBe(true)
  const snapshot = snapshotAt(
    {
      sources: t.members.map((s) => ({
        ...s,
        cadenceS: 3600,
        staleAfterS: 7200,
        freshness: 'observed' as const,
        probation: false
      })),
      polls: result.polls.map((p) => ({
        id: randomUUID(),
        sourceId: p.sourceId,
        startedAt: result.requests[0]!.startedAt,
        outcome: p.outcome,
        httpStatus: 200
      })),
      readings: result.polls.flatMap((p) =>
        p.readings.map((r) => ({
          ...r,
          id: randomUUID(),
          receivedAt: t.clock.now().toISOString(),
          valueText: null,
          valueJson: r.valueJson as Record<string, unknown>,
          itemKey: '',
          revision: 0
        }))
      )
    },
    apimsIndicators,
    randomUUID(),
    'sky',
    t.clock.now().toISOString()
  )
  expect(snapshot.site['site.api_0600_min_last3_max']).toMatchObject({ value: null, state: 'stale' })
})
test('the entire three-child outbox reservation is atomic at capacity', async () => {
  const t = setup(),
    pending = Array.from({ length: MAX_PENDING_RESULTS - 1 }, () => {
      const operation_id = randomUUID()
      return {
        operation_id,
        kind: 'apims',
        object_path: resultPath('apims', operation_id),
        reserved_until: '2026-11-10T00:00:00.000Z'
      }
    })
  await t.store.write('control/pending-results.json', encodeObject(pending), '0')
  t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('outbox is full')
  expect(t.urls).toHaveLength(0)
  expect(decodeObject((await t.store.read('control/pending-results.json'))!.body)).toEqual(pending)
})
test('publish succeeded before receipt: repair republishes same four-field reference then drains receipt', async () => {
  const t = setup(),
    refs: ResultReference[] = []
  t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
  t.ports.publish = async (result) => {
    await publishSourceResult(result, {
      store: t.store,
      publish: async (ref) => {
        refs.push(ref)
      }
    })
    throw new Error('death before receipt')
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('death before receipt')
  await t.clock.advance(60001)
  const ports = {
    store: t.store,
    now: t.clock.now,
    publish: async (ref: ResultReference) => {
      refs.push(ref)
    },
    recoverGroup: (
      recovery: Parameters<typeof recoverSavedGroupedBackfill>[0]['recovery'],
      operationId: string,
      kind: SourceExecutionResult['kind'],
      now: Date
    ) => recoverSavedGroupedBackfill({ store: t.store, recovery, operationId, kind, now, validate: parseSourceResult })
  }
  await repairSourceResults(ports)
  expect(refs).toEqual([refs[0], refs[0]])
  await t.store.write(`control/receipts/${refs[0]!.operation_id}.json`, encodeObject(refs[0]), '0')
  await repairSourceResults(ports)
  expect(decodeObject<Array<unknown>>((await t.store.read('control/pending-results.json'))!.body)).toHaveLength(2)
  expect(t.urls).toHaveLength(1)
})
test('one saved child cannot be adopted with a different frozen source state', async () => {
  const t = setup()
  t.ports.publish = async () => {
    throw new Error('stop')
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('stop')
  const path = `control/grouped-backfills/${t.group.key}.json`,
    saved = (await t.store.read(path))!,
    claim = decodeObject<{ sources: Source[]; children: Array<{ operationId: string }> }>(saved.body)
  claim.sources[0]!.meta.state_id = 10
  await t.store.write(path, encodeObject(claim), saved.generation)
  await t.clock.advance(60001)
  await expect(
    recoverSavedGroupedBackfill({
      store: t.store,
      recovery: { type: 'group', key: t.group.key, anchor: t.group.anchor, sourceIds: t.group.sourceIds, step: 0 },
      operationId: claim.children[0]!.operationId,
      kind: 'apims',
      now: t.clock.now(),
      validate: parseSourceResult
    })
  ).rejects.toThrow(/identity/)
  expect(t.urls).toHaveLength(1)
})

test.each(['operation', 'purpose', 'kind', 'membership', 'hash'])('saved child rejects forged %s', async (field) => {
  const t = setup()
  t.ports.publish = async () => {
    throw new Error('stop')
  }
  await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('stop')
  const claim = decodeObject<{ children: Array<{ operationId: string; resultPath: string }> }>(
      (await t.store.read(`control/grouped-backfills/${t.group.key}.json`))!.body
    ),
    child = claim.children[0]!,
    saved = (await t.store.read(child.resultPath))!
  const result = decodeObject<
    Record<string, unknown> & { requests: Array<{ sourceIds: string[]; bodySha256: string }> }
  >(saved.body)
  if (field === 'operation') result.operationId = randomUUID()
  if (field === 'purpose') result.purpose = 'poll'
  if (field === 'kind') result.kind = 'jps_rain'
  if (field === 'membership') result.requests[0]!.sourceIds = [randomUUID()]
  if (field === 'hash') result.requests[0]!.bodySha256 = '0'.repeat(64)
  await t.store.write(child.resultPath, encodeObject(result), saved.generation)
  await t.clock.advance(60001)
  await expect(
    recoverSavedGroupedBackfill({
      store: t.store,
      recovery: { type: 'group', key: t.group.key, anchor: t.group.anchor, sourceIds: t.group.sourceIds, step: 0 },
      operationId: child.operationId,
      kind: 'apims',
      now: t.clock.now(),
      validate: parseSourceResult
    }).then(() => null)
  ).rejects.toThrow()
  expect(t.urls).toHaveLength(1)
})
test('a twenty-second physical timeout is saved once and the distinct last step proceeds', async () => {
  const t = setup(),
    factory = t.ports.contextFactory
  let contexts = 0
  t.ports.contextFactory = (ss, o) =>
    ++contexts === 2
      ? context({
          kind: 'apims',
          family: undefined,
          sources: ss,
          clock: t.clock,
          requestId: randomUUID,
          http: async (_url, init) =>
            new Promise((_resolve, reject) => {
              init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
            })
        })
      : factory(ss, o)
  const run = runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  for (let i = 0; i < 10 && contexts < 2; i++) await flush()
  expect(contexts).toBe(2)
  await t.clock.advance(20000)
  expect(await run).toBe('complete')
  expect(t.published.map((r) => r.polls[0]!.outcome)).toEqual(['ok', 'error', 'ok'])
  expect(t.published[1]!.requests[0]).toMatchObject({ httpStatus: null, latencyMs: 20000, error: { type: 'timeout' } })
  await runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  expect(contexts).toBe(3)
})

test('duplicate initial membership is rejected before any physical request', async () => {
  const t = setup(),
    duplicate = [...t.members, t.members[0]!]
  await expect(
    runGroupedBackfillOnce(t.a, { ...t.group, sourceIds: duplicate.map((s) => s.id) }, duplicate, t.ports)
  ).rejects.toThrow(/identity/)
  expect(t.urls).toHaveLength(0)
})

// Removing resumable reservation handling stalls the scheduled entry point before either adapter runs.
test('expired unfinished group reservations let scheduled recovery, latest and unrelated adapters progress', async () => {
  const t = setup(),
    refs: ResultReference[] = [],
    results: SourceExecutionResult[] = [],
    urls: string[] = []
  const jps: Source = { ...sources[0]!, id: randomUUID(), kind: 'jps_rain', externalId: '75', meta: { jps_id: 75 } }
  const plan = {
    version: 2,
    generatedAt: t.group.anchor,
    periods: [],
    backfillGroups: [t.group],
    sources: [...t.members, jps].map((source) => ({
      source,
      bindings: [{ orgId: randomUUID(), projectId: randomUUID() }],
      previousPollDigest: null,
      previousBackfillDigest: null
    }))
  }
  await t.store.write('control/plan.json', encodeObject(plan), '0')
  const publish = async (ref: ResultReference) => {
    refs.push(ref)
  }
  let fail = true
  const jobs = createSourceJobs({
    store: t.store,
    scratch: new MemoryStore(),
    clock: t.clock,
    id: randomUUID,
    adapters: [t.a, createJpsRainAdapter()],
    userAgent: 'test',
    log: () => {},
    database: {
      snapshot: async () => {
        throw new Error('scheduled DB forbidden')
      },
      catalogue: async () => {}
    },
    repair: () =>
      repairSourceResults({
        store: t.store,
        now: t.clock.now,
        publish,
        recoverLatest: (recovery, operationId, kind, now) =>
          recoverLatestSlot({ store: t.store, recovery, operationId, kind, now }),
        recoverGroup: (recovery, operationId, kind, now) =>
          recoverSavedGroupedBackfill({ store: t.store, recovery, operationId, kind, now, validate: parseSourceResult })
      }),
    publish: async (result) => {
      results.push(result)
      await publishSourceResult(result, {
        store: t.store,
        publish: async (ref) => {
          if (fail) {
            fail = false
            throw new Error('publication crash')
          }
          await publish(ref)
        }
      })
    },
    http: async (url) => {
      urls.push(String(url))
      const u = new URL(String(url))
      if (u.pathname.includes('GetRainfallGraph')) return new Response(fixture('rainfall-graph-75-20261105T1312Z.json'))
      if (!u.pathname.endsWith('/apitablehourly')) return new Response(fixture('mapcaqm-20261105T1313Z.json'))
      const day = u.searchParams.get('datetime')!.slice(0, 10).replaceAll('-', '')
      return new Response(fixture(`apitablehourly-state14-${day}T230000-20261107T080610Z.json`))
    }
  })
  await expect(jobs.runAdapter('apims', null)).rejects.toThrow('publication crash')
  const claimPath = `control/grouped-backfills/${t.group.key}.json`
  const original = decodeObject<GroupedBackfillClaim>((await t.store.read(claimPath))!.body)
  const savedChild = (await t.store.read(original.children[0]!.resultPath))!
  await t.clock.advance(20 * 60 * 1000 + 1)
  // Global repair must not let APIMS's unattempted children starve this adapter.
  await jobs.runAdapter('jps_rain', null)
  const pending = decodeObject<Array<{ operation_id: string }>>(
    (await t.store.read('control/pending-results.json'))!.body
  )
  expect(original.children.every((child) => pending.some((entry) => entry.operation_id === child.operationId))).toBe(
    true
  )
  await jobs.runAdapter('apims', null)
  await jobs.runAdapter('apims', null)
  const final = decodeObject<GroupedBackfillClaim>((await t.store.read(claimPath))!.body)
  expect(final.state).toBe('complete')
  expect(final.group).toEqual(original.group)
  expect(final.sources).toEqual(original.sources)
  expect(final.children.map((c) => c.operationId)).toEqual(original.children.map((c) => c.operationId))
  expect((await t.store.read(original.children[0]!.resultPath))!.body).toEqual(savedChild.body)
  expect(urls.filter((url) => url.includes('/apitablehourly'))).toHaveLength(3)
  expect(urls.filter((url) => url.includes('/mapcaqm'))).toHaveLength(1)
  expect(urls.filter((url) => url.includes('GetRainfallGraph'))).toHaveLength(1)
  expect(results.filter((result) => result.kind === 'apims' && result.purpose === 'poll')).toHaveLength(2)
  expect(
    new Set(
      results
        .filter((result) => result.kind === 'apims' && result.purpose === 'poll')
        .map((result) => result.operationId)
    ).size
  ).toBe(1)
  for (const child of original.children) {
    const deliveries = refs.filter((ref) => ref.operation_id === child.operationId)
    expect(deliveries.length).toBeGreaterThan(0)
    expect(new Set(deliveries.map((ref) => ref.sha256)).size).toBe(1)
  }
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
// Removing the partial recovery CAS lets a late old-owner save claim the stable public operation.
test('partial recovery follows a replacement claim instead of publishing late superseded bytes', async () => {
  const t = setup(),
    refs: ResultReference[] = [],
    write = t.store.write.bind(t.store),
    read = t.store.read.bind(t.store)
  const saveEntered = deferred(),
    saveRelease = deferred()
  let oldPath = ''
  t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
  t.ports.publish = (result) =>
    publishSourceResult(result, {
      store: t.store,
      publish: async (ref) => {
        refs.push(ref)
      }
    })
  t.store.write = async (path, body, generation) => {
    if (path.startsWith('control/results/grouped-backfills/') && !oldPath) {
      oldPath = path
      saveEntered.resolve()
      await saveRelease.promise
    }
    return write(path, body, generation)
  }
  const oldRun = runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  await saveEntered.promise
  t.clock.time += 60001
  t.clock.elapsed += 60001
  const claimPath = `control/grouped-backfills/${t.group.key}.json`
  const oldClaim = decodeObject<GroupedBackfillClaim>((await read(claimPath))!.body)
  const readEntered = deferred(),
    readRelease = deferred()
  let heldRead = false
  t.store.read = async (path) => {
    if (path === oldPath && !heldRead) {
      heldRead = true
      readEntered.resolve()
      await readRelease.promise
    }
    return read(path)
  }
  const recovering = recoverSavedGroupedBackfill({
    store: t.store,
    recovery: { type: 'group', key: t.group.key, anchor: t.group.anchor, sourceIds: t.group.sourceIds, step: 0 },
    operationId: oldClaim.children[0]!.operationId,
    kind: 'apims',
    now: t.clock.now(),
    validate: parseSourceResult
  })
  await readEntered.promise
  const transportEntered = deferred(),
    transportRelease = deferred(),
    factory = t.ports.contextFactory
  const nextRun = runGroupedBackfillOnce(t.a, t.group, t.members, {
    ...t.ports,
    contextFactory: (ss, opts) => {
      const c = factory(ss, opts),
        http = c.ctx.http
      c.ctx.http = async (...args) => {
        transportEntered.resolve()
        await transportRelease.promise
        return http(...args)
      }
      return c
    }
  })
  await transportEntered.promise
  const replacement = decodeObject<GroupedBackfillClaim>((await read(claimPath))!.body)
  expect(replacement.children[0]!.resultPath).not.toBe(oldPath)
  saveRelease.resolve()
  expect(await oldRun).toBe('running')
  readRelease.resolve()
  const recovered = await recovering
  // Exercise real publication before takeover's transport is released, as repair would.
  if (recovered && typeof recovered !== 'string') await t.ports.publish(recovered)
  transportRelease.resolve()
  const completion = await nextRun.then(
    (value) => ({ value }),
    (error) => ({ error: String(error) })
  )
  expect(completion).toEqual({ value: 'complete' })
  expect(recovered === null || typeof recovered === 'string').toBe(true)
  expect(refs).toHaveLength(3)
  expect(new Set(refs.map((ref) => ref.operation_id)).size).toBe(3)
  const final = decodeObject<GroupedBackfillClaim>((await read(claimPath))!.body)
  expect(final.state).toBe('complete')
  expect(final.children.map((c) => c.operationId)).toEqual(oldClaim.children.map((c) => c.operationId))
  const stale = parseSourceResult(decodeObject((await read(oldPath))!.body))
  for (const child of final.children) {
    const delivered = parseSourceResult(decodeObject((await read(resultPath('apims', child.operationId)))!.body))
    const authoritative = parseSourceResult(decodeObject((await read(child.resultPath))!.body))
    expect(delivered).toEqual(authoritative)
    expect(delivered.requests[0]!.requestId).not.toBe(stale.requests[0]!.requestId)
  }
  // Only the accepted pre-save ambiguous history GET is repeated.
  expect(t.urls).toHaveLength(4)
})

// If recovery does not fence a durable child, an already-prepared takeover can replace its path.
test('a successful partial recovery fence makes an already prepared takeover adopt the saved child', async () => {
  const t = setup(),
    refs: ResultReference[] = [],
    write = t.store.write.bind(t.store)
  const saveEntered = deferred(),
    saveRelease = deferred(),
    takeoverEntered = deferred(),
    takeoverRelease = deferred()
  let oldPath = '',
    holdTakeover = false,
    heldTakeover = false
  const claimPath = `control/grouped-backfills/${t.group.key}.json`
  t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
  t.ports.publish = (result) =>
    publishSourceResult(result, {
      store: t.store,
      publish: async (ref) => {
        refs.push(ref)
      }
    })
  t.store.write = async (path, body, generation) => {
    if (path.startsWith('control/results/grouped-backfills/') && !oldPath) {
      oldPath = path
      saveEntered.resolve()
      await saveRelease.promise
    }
    if (path === claimPath && holdTakeover && !heldTakeover) {
      heldTakeover = true
      takeoverEntered.resolve()
      await takeoverRelease.promise
    }
    return write(path, body, generation)
  }
  const oldRun = runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  await saveEntered.promise
  t.clock.time += 60001
  t.clock.elapsed += 60001
  const original = decodeObject<GroupedBackfillClaim>((await t.store.read(claimPath))!.body)
  holdTakeover = true
  const nextRun = runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)
  await takeoverEntered.promise
  saveRelease.resolve()
  expect(await oldRun).toBe('running')
  const recovered = await recoverSavedGroupedBackfill({
    store: t.store,
    recovery: { type: 'group', key: t.group.key, anchor: t.group.anchor, sourceIds: t.group.sourceIds, step: 0 },
    operationId: original.children[0]!.operationId,
    kind: 'apims',
    now: t.clock.now(),
    validate: parseSourceResult
  })
  if (recovered && typeof recovered !== 'string') await t.ports.publish(recovered)
  takeoverRelease.resolve()
  const completion = await nextRun.then(
    (value) => ({ value }),
    (error) => ({ error: String(error) })
  )
  expect(completion).toEqual({ value: 'complete' })
  const final = decodeObject<GroupedBackfillClaim>((await t.store.read(claimPath))!.body)
  expect(final.children[0]!.resultPath).toBe(oldPath)
  expect(t.urls).toHaveLength(3)
  expect(new Set(refs.map((ref) => ref.operation_id)).size).toBe(3)
  for (const child of final.children)
    expect(new Set(refs.filter((ref) => ref.operation_id === child.operationId).map((ref) => ref.sha256)).size).toBe(1)
})

test.each(['absent', 'complete', 'corrupt', 'path'] as const)(
  'expired %s group reservations still report genuine repair errors',
  async (state) => {
    const t = setup()
    t.ports.admitGroup = (claim) => reserveGroupedSourceResults(t.store, claim, t.clock.now())
    t.ports.publish = async () => {
      throw new Error('publication crash')
    }
    await expect(runGroupedBackfillOnce(t.a, t.group, t.members, t.ports)).rejects.toThrow('publication crash')
    const path = `control/grouped-backfills/${t.group.key}.json`,
      saved = (await t.store.read(path))!
    const claim = decodeObject<GroupedBackfillClaim>(saved.body)
    if (state === 'absent') t.store.objects.delete(path)
    if (state === 'complete') await t.store.write(path, encodeObject({ ...claim, state: 'complete' }), saved.generation)
    if (state === 'corrupt') {
      claim.sources[0]!.meta.state_id = 10
      await t.store.write(path, encodeObject(claim), saved.generation)
    }
    if (state === 'path') {
      const pendingPath = 'control/pending-results.json',
        saved = (await t.store.read(pendingPath))!
      const pending = decodeObject<Array<{ object_path: string }>>(saved.body)
      pending[1]!.object_path = 'control/deliveries/forged.json'
      await t.store.write(pendingPath, encodeObject(pending), saved.generation)
    }
    await t.clock.advance(20 * 60 * 1000 + 1)
    await expect(
      repairSourceResults({
        store: t.store,
        now: t.clock.now,
        publish: async () => {},
        recoverGroup: (recovery, operationId, kind, now) =>
          recoverSavedGroupedBackfill({ store: t.store, recovery, operationId, kind, now, validate: parseSourceResult })
      })
    ).rejects.toThrow(
      state === 'corrupt' ? /identity/ : state === 'path' ? /reserved result path/ : /expired before durable result/
    )
    expect(t.urls).toHaveLength(1)
    expect(decodeObject<unknown[]>((await t.store.read('control/pending-results.json'))!.body)).toHaveLength(3)
  }
)
