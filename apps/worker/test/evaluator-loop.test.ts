import { expect, test, vi, afterEach } from 'vitest'
import type { Verdict } from '@skyclause/clauses'
import { semanticVerdictKey } from '@skyclause/api'
import { createEvaluatorProviders } from '@skyclause/api'
import type { SourceAdapter } from '@skyclause/sources'
import { TEST_REGISTRY } from '../../../packages/clauses/test/test-helpers'
import {
  withTenant,
  systemPrincipal,
  createProjectRecord,
  projectPack,
  featureFlag,
  shadowState,
  crossing,
  indicatorSnapshot,
  evaluatorReevaluation
} from '@skyclause/db'
import {
  makeOrganization,
  makeWindow,
  makeNight,
  makeListing,
  makeSource,
  makeReading,
  makeProjectSource
} from '../../../packages/db/test/factories'
import { eq, sql } from 'drizzle-orm'
import { asLogin } from '../../../packages/db/test/harness'
import { project, loadEvaluatorSnapshot, domainEvent, setEventPublisher, withSystem } from '@skyclause/db'
import * as database from '@skyclause/db'
import { recordSourceTransitions } from '../src/evaluator/source-state'
import { deliverSourceTransitions } from '../src/evaluator/delivery'
import { evaluateProject } from '../src/evaluator/evaluate'

const at = '2026-11-10T04:00:00.000Z'
const normal: Verdict = {
  scope: { kind: 'site', id: null },
  pack: 'sky',
  mode: 'normal',
  watch: false,
  noCall: null,
  recommendations: [],
  clauses: [],
  openFrom: null
}
test('semantic key ignores evidence and clause firing but retains mode, watch, null versus names and recommendation sets', () => {
  const changed = {
    ...normal,
    openFrom: at,
    clauses: [{ key: 'changed', result: 'fired' as const, blockedBy: [], inputs: [] }]
  }
  expect(semanticVerdictKey(normal)).toBe(semanticVerdictKey(changed))
  for (const v of [
    { ...normal, mode: null },
    { ...normal, watch: true },
    { ...normal, noCall: { inputs: [] } },
    { ...normal, recommendations: ['shift_start' as const] }
  ])
    expect(semanticVerdictKey(v)).not.toBe(semanticVerdictKey(normal))
  const input = { name: 'rain', state: 'stale' as const, sourceId: null, since: at }
  const a = {
    ...normal,
    noCall: { inputs: [input, { ...input, name: 'api' }, input] },
    recommendations: ['shift_start', 'shift_end', 'shift_start'] as Verdict['recommendations']
  }
  const b = {
    ...a,
    noCall: { inputs: [{ ...input, name: 'api', since: 'later', sourceId: 'other' }, input] },
    recommendations: ['shift_end', 'shift_start'] as Verdict['recommendations']
  }
  expect(semanticVerdictKey(a)).toBe(semanticVerdictKey(b))
  expect(semanticVerdictKey(a)).not.toBe(semanticVerdictKey({ ...a, noCall: { inputs: [input] } }))
})
async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('test-evaluator') }, fn)
  const created = await run((tx) =>
    createProjectRecord(tx, {
      name: 'Evaluator',
      slug: 'evaluator',
      siteName: 'APU',
      siteLat: 3,
      siteLon: 101,
      packs: ['sky', 'crowd']
    })
  )
  await run((tx) => tx.insert(featureFlag).values({ key: 'pack_crowd', orgId, enabled: true }))
  await run((tx) => tx.update(projectPack).set({ enabled: true }).where(eq(projectPack.projectId, created.project.id)))
  const providers = createEvaluatorProviders({
    adapters: [{ kind: 'jps_rain', indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: null
  })
  return { orgId, run, created, providers, q: { projectId: created.project.id, tEval: at } }
}
test('first No call writes site with zero windows; concurrent repeats produce one crossing and Crowd remains pending', async () => {
  const { run, q, providers } = await scene()
  const results = await Promise.all([
    run((tx) => evaluateProject(tx, q, providers)),
    run((tx) => evaluateProject(tx, q, providers))
  ])
  expect(results.flatMap((r) => r.crossingIds)).toHaveLength(1)
  for (const r of results) expect(r.deferredPacks).toEqual(['crowd'])
  await run(async (tx) => {
    expect(await tx.select().from(shadowState)).toHaveLength(1)
    expect(await tx.select().from(crossing)).toHaveLength(1)
    expect(await tx.select().from(indicatorSnapshot)).toHaveLength(1)
    expect(await tx.select().from(evaluatorReevaluation)).toMatchObject([
      { projectId: q.projectId, pack: 'crowd', completedAt: null }
    ])
  })
  const newer = '2026-11-10T04:10:00.000Z'
  await run((tx) => evaluateProject(tx, { ...q, tEval: newer }, providers))
  await run((tx) => evaluateProject(tx, q, providers))
  expect(
    (await run((tx) => tx.select().from(shadowState).where(eq(shadowState.projectId, q.projectId))))[0]?.evaluatedAt
  ).toEqual(new Date(newer))
})
test('disabled packs produce no snapshots or state', async () => {
  const { run, q, providers } = await scene()
  await run((tx) => tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.projectId, q.projectId)))
  expect((await run((tx) => evaluateProject(tx, q, providers))).crossingIds).toEqual([])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
})

afterEach(() => {
  vi.restoreAllMocks()
  setEventPublisher(null)
})
test.each(['archived', 'suspended', 'flag-off'] as const)('%s scopes make no writes', async (kind) => {
  const { orgId, run, q, providers } = await scene()
  if (kind === 'archived')
    await run((tx) =>
      tx
        .update(project)
        .set({ archivedAt: new Date(at) })
        .where(eq(project.id, q.projectId))
    )
  if (kind === 'suspended')
    await asLogin('auth_app', (c) =>
      c.query('UPDATE auth.organization SET deletion_requested_at=now() WHERE id=$1', [orgId])
    )
  if (kind === 'flag-off')
    await run(async (tx) => {
      await tx.update(projectPack).set({ enabled: false }).where(eq(projectPack.pack, 'sky'))
      await tx.update(featureFlag).set({ enabled: false })
    })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.crossingIds).toEqual([])
  expect(result.deferredPacks).toEqual([])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
})
test('same-key persisted archive keeps original windows and definitions even after current context changes', async () => {
  const { run, q, providers } = await scene()
  const w = await run((tx) =>
    makeWindow(tx, {
      projectId: q.projectId,
      startsAt: new Date('2026-11-10T05:00:00Z'),
      endsAt: new Date('2026-11-10T06:00:00Z')
    })
  )
  const frozen = [
    { id: w.id, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), tz: w.tz, kind: w.kind }
  ]
  await run((tx) => providers.snapshots.take(tx, { ...q, pack: 'sky', persist: true, windows: frozen }))
  await run((tx) =>
    makeWindow(tx, {
      projectId: q.projectId,
      startsAt: new Date('2026-11-10T07:00:00Z'),
      endsAt: new Date('2026-11-10T08:00:00Z')
    })
  )
  const empty = createEvaluatorProviders({ adapters: [], forecast: null }),
    evaluate = vi.spyOn(empty.shadow, 'evaluate')
  const result = await run((tx) => evaluateProject(tx, q, empty))
  expect(result.deferredPacks).toEqual(['crowd'])
  expect(evaluate.mock.calls[0]?.[2]).toEqual(frozen)
  const archived = await run((tx) => loadEvaluatorSnapshot(tx, { ...q, pack: 'sky' }))
  expect(evaluate.mock.calls[0]?.[0].registryHash).toBe(archived.snapshot.registryHash)
  expect(evaluate.mock.calls[0]?.[1]).toEqual(archived.snapshot)
})
test('cancelled and expired windows are excluded while zero eligible windows retain the Sky site', async () => {
  const { run, q, providers } = await scene()
  await run(async (tx) => {
    for (const extra of [{ cancelledAt: new Date(at) }, { expiresAt: new Date(at) }, { endsAt: new Date(at) }])
      await makeWindow(tx, {
        projectId: q.projectId,
        startsAt: new Date('2026-11-10T03:00:00Z'),
        endsAt: new Date('2026-11-10T05:00:00Z'),
        ...extra
      })
  })
  await run((tx) => evaluateProject(tx, q, providers))
  expect((await run((tx) => loadEvaluatorSnapshot(tx, { ...q, pack: 'sky' }))).windows).toEqual([])
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ scopeKind: 'site' }])
})
test('incompatible archive leaves explicit reevaluation intent without fake Normal state', async () => {
  const { run, q, providers } = await scene()
  const narrow = createEvaluatorProviders({
    adapters: [
      {
        kind: 'apims',
        indicators: [{ name: 'site.api_max', celType: 'int', unit: '', scope: 'site', sourceKind: 'apims' }]
      } as SourceAdapter<unknown>
    ],
    forecast: null
  })
  await run((tx) => narrow.snapshots.take(tx, { ...q, pack: 'sky', persist: true, windows: [] }))
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['sky', 'crowd'])
  expect(await run((tx) => tx.select().from(shadowState))).toEqual([])
  expect(await run((tx) => tx.select().from(domainEvent))).toEqual([])
  expect(await run((tx) => tx.select().from(evaluatorReevaluation))).toHaveLength(2)
})
test('snapshot write then engine failure rolls back the whole pack and leaves durable pending work', async () => {
  const { run, q, providers } = await scene()
  vi.spyOn(providers.shadow, 'evaluate').mockImplementation(() => {
    throw new Error('injected engine failure')
  })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['sky', 'crowd'])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
  expect(await run((tx) => tx.select().from(shadowState))).toEqual([])
  expect(await run((tx) => tx.select().from(crossing))).toEqual([])
})

test('failed Crowd after actual emitEvent publishes no ghost event or metric while Sky commits', async () => {
  const { run, q } = await scene()
  const n = await run(async (tx) => {
    const n = await makeNight(tx, { projectId: q.projectId, date: '2026-11-10', state: 'in_progress' })
    await makeListing(tx, { projectId: q.projectId, nightId: n.id, state: 'listed' })
    return n
  })
  const providers = createEvaluatorProviders({
    adapters: [{ kind: 'jps_rain', indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: {
      nights: async () => [
        {
          id: n.id,
          date: n.date,
          baseline: null,
          uplift: null,
          forecast: null,
          band: null,
          doors: '2026-11-10T10:00:00Z',
          show: '2026-11-10T11:00:00Z',
          arrivalStart: '2026-11-10T08:00:00Z',
          arrivalEnd: null,
          exitStart: null,
          exitEnd: null,
          singleSource: true,
          forecastId: null,
          state: 'insufficient_baseline'
        }
      ],
      exits: async () => {
        throw new Error('unused')
      },
      baseline: async () => {
        throw new Error('unused')
      }
    }
  })
  const actual = database.commitEvaluatorVerdict,
    metrics: string[] = [],
    published: string[] = []
  vi.spyOn(database, 'commitEvaluatorVerdict').mockImplementation(async (tx, args) => {
    const result = await actual(tx, args)
    database.afterCommit(tx as database.Tx, async () => {
      metrics.push(args.pack)
    })
    if (args.pack === 'crowd') throw new Error('injected after actual shared event and metric hook')
    return result
  })
  setEventPublisher(async ({ event_id }) => {
    published.push(event_id)
  })
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.deferredPacks).toEqual(['crowd'])
  expect(result.crossingIds).toHaveLength(1)
  const events = await run((tx) => tx.select().from(domainEvent))
  expect(events).toHaveLength(1)
  expect(published).toEqual(events.map((e) => e.id))
  expect(metrics).toEqual(['sky'])
  expect(await run((tx) => tx.select().from(indicatorSnapshot))).toMatchObject([{ pack: 'sky' }])
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ pack: 'sky' }])
  expect(await run((tx) => tx.select().from(crossing))).toMatchObject([{ pack: 'sky' }])
})
test('separate simultaneous connections serialize on the project lock and duplicate evaluations use no readings twice', async () => {
  const { run, q, providers } = await scene()
  const source = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  const reading = await withSystem('test', (tx) =>
    makeReading(tx, {
      sourceId: source.id,
      metric: 'api',
      unit: '',
      value: 180,
      observedAt: new Date(at),
      receivedAt: new Date(at)
    })
  )
  await run((tx) => makeProjectSource(tx, { projectId: q.projectId, sourceId: source.id, role: 'rain_gauge' }))
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    pids: number[] = []
  const work = () =>
    run(async (tx) => {
      const pid = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
      pids.push(pid.rows[0]!.pid)
      if (pids.length === 2) release()
      await gate
      return evaluateProject(tx, q, providers)
    })
  const results = await Promise.all([work(), work()])
  expect(new Set(pids).size).toBe(2)
  expect(results.flatMap((r) => r.crossingIds)).toHaveLength(1)
  expect(results.flatMap((r) => r.usedReadingIds)).toEqual([reading.id])
})

test('an archive without committed shadow is evidence, not a newer evaluation watermark', async () => {
  const { run, q, providers } = await scene()
  await run((tx) =>
    providers.snapshots.take(tx, { ...q, tEval: '2026-11-10T05:00:00.000Z', pack: 'sky', windows: [], persist: true })
  )
  const result = await run((tx) => evaluateProject(tx, q, providers))
  expect(result.crossingIds).toHaveLength(1)
  expect(await run((tx) => tx.select().from(shadowState))).toMatchObject([{ evaluatedAt: new Date(at) }])
})

test('global source wrapper reads bindings in each tenant and delivers once with two enabled packs', async () => {
  const a = await scene(),
    b = await scene(),
    s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  for (const x of [a, b]) await x.run((tx) => makeProjectSource(tx, { projectId: x.q.projectId, sourceId: s.id }))
  await database.shareSystemConnection(async () => {
    const transitions = await recordSourceTransitions({
      tEval: at,
      history: {
        sources: [
          {
            id: s.id,
            kind: s.kind,
            cadenceS: s.cadenceS,
            staleAfterS: s.staleAfterS,
            freshness: s.freshness,
            probation: false,
            meta: {}
          }
        ],
        polls: [],
        readings: []
      }
    })
    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.targets).toEqual(
      expect.arrayContaining([
        { orgId: a.orgId, projectId: a.q.projectId },
        { orgId: b.orgId, projectId: b.q.projectId }
      ])
    )
    expect(transitions[0]!.targets).toHaveLength(2)
    await deliverSourceTransitions()
    await deliverSourceTransitions()
  })
  for (const x of [a, b])
    expect(await x.run((tx) => tx.select().from(domainEvent))).toMatchObject([
      { type: 'source.stale', data: { http_status: null } }
    ])
})
