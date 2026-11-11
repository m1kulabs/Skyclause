import { expect, test, afterEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { afterCommit, withSavepoint, withTenant, systemPrincipal, emitEvent, setEventPublisher } from '../src'
import { makeOrganization, makeProject, makeSource, makeProjectSource, makeProjectPack } from './factories'
import { makeIndicatorSnapshot, makeSheetVersion } from './factories'
import {
  withRetention,
  sourceState,
  evaluatorSourceTransition,
  evaluatorSourceDelivery,
  evaluatorReevaluation,
  requestEvaluatorReevaluation,
  completeEvaluatorReevaluation,
  sweepEvaluatorCoordination,
  commitEvaluatorVerdict,
  lockEvaluatorProject,
  saveEvaluatorSnapshot,
  shadowState,
  crossing,
  indicatorSnapshot,
  findSourceTargets,
  shareSystemConnection
} from '../src'
import { eq } from 'drizzle-orm'
import { snapshotAt } from '@skyclause/clauses'
import { asLogin } from './harness'
import { withSystem, recordSourceTransition, listSourceTransitionDeliveries, deliverSourceTransition } from '../src'
import type { Verdict, ReadingHistory } from '@skyclause/clauses'

const at = '2026-11-10T04:00:00.000Z'
afterEach(() => setEventPublisher(null))
export async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('test-evaluator') }, fn)
  const p = await run((tx) => makeProject(tx))
  return { orgId, run, p }
}
test('savepoint rollback discards actual emitEvent publisher buffers and commit hooks', async () => {
  const { run, p } = await scene()
  const published: string[] = []
  const hooks: string[] = []
  setEventPublisher(async ({ event_id }) => {
    published.push(event_id)
  })
  let good!: string
  await run(async (tx) => {
    await withSavepoint(tx, async (child) => {
      good = (
        await emitEvent(child, {
          projectId: p.id,
          type: 'window.cancelled',
          data: { window_id: p.id, via: 'form', times_changed: false, series_id: null }
        })
      ).id
      afterCommit(child, async () => {
        hooks.push('sky')
      })
    })
    await expect(
      withSavepoint(tx, async (child) => {
        await emitEvent(child, {
          projectId: p.id,
          type: 'window.cancelled',
          data: { window_id: p.id, via: 'form', times_changed: false, series_id: null }
        })
        afterCommit(child, async () => {
          hooks.push('crowd')
        })
        throw new Error('failed pack after shared write')
      })
    ).rejects.toThrow('failed pack')
  })
  expect(published).toEqual([good])
  expect(hooks).toEqual(['sky'])
  expect((await run((tx) => tx.execute(sql`SELECT id FROM domain_event WHERE project_id=${p.id}`))).rows).toEqual([
    { id: good }
  ])
})
function history(sourceId: string, fresh = false): ReadingHistory {
  return {
    sources: [
      {
        id: sourceId,
        kind: 'apims',
        cadenceS: 300,
        staleAfterS: 600,
        freshness: 'observed',
        probation: false,
        meta: {}
      }
    ],
    polls: [
      {
        id: 'poll',
        sourceId,
        startedAt: fresh ? at : '2026-11-10T03:00:00.000Z',
        receivedAt: fresh ? at : '2026-11-10T03:00:00.000Z',
        outcome: 'ok',
        httpStatus: 200
      }
    ],
    readings: fresh
      ? [
          {
            id: 'reading',
            sourceId,
            metric: 'api',
            observedAt: at,
            receivedAt: at,
            value: 12,
            valueText: null,
            valueJson: null,
            itemKey: '',
            revision: 1
          }
        ]
      : []
  }
}
test('immutable stale and recovery fanout survives a crash, is ordered and deduplicated per tenant project', async () => {
  const a = await scene(),
    b = await scene()
  const s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  for (const x of [a, b])
    await x.run(async (tx) => {
      await makeProjectSource(tx, { projectId: x.p.id, sourceId: s.id })
      await makeProjectPack(tx, { projectId: x.p.id, enabled: true })
    })
  const targets = [a, b].map((x) => ({ orgId: x.orgId, projectId: x.p.id }))
  const stale = await withSystem('test', (tx) =>
    recordSourceTransition(tx, { sourceId: s.id, tEval: at, history: history(s.id), targets })
  )
  expect(stale?.eventType).toBe('source.stale')
  await a.run((tx) => deliverSourceTransition(tx, { transitionId: stale!.id, projectId: a.p.id }))
  const recovered = await withSystem('test', (tx) =>
    recordSourceTransition(tx, {
      sourceId: s.id,
      tEval: '2026-11-10T04:00:01.000Z',
      history: history(s.id, true),
      targets
    })
  )
  expect(recovered?.eventType).toBe('source.recovered')
  // Recovery cannot overtake undelivered stale in the other tenant.
  expect(await b.run((tx) => deliverSourceTransition(tx, { transitionId: recovered!.id, projectId: b.p.id }))).toBe(
    false
  )
  await expect(
    b.run(async (tx) => {
      await deliverSourceTransition(tx, { transitionId: stale!.id, projectId: b.p.id })
      throw new Error('crash')
    })
  ).rejects.toThrow('crash')
  for (const t of [stale!, recovered!])
    for (const x of [a, b]) await x.run((tx) => deliverSourceTransition(tx, { transitionId: t.id, projectId: x.p.id }))
  for (const t of [stale!, recovered!])
    for (const x of [a, b]) await x.run((tx) => deliverSourceTransition(tx, { transitionId: t.id, projectId: x.p.id }))
  for (const x of [a, b])
    expect(
      (await x.run((tx) => tx.execute(sql`SELECT type FROM domain_event WHERE project_id=${x.p.id} ORDER BY seq`))).rows
    ).toEqual([{ type: 'source.stale' }, { type: 'source.recovered' }])
  expect(await withSystem('test', listSourceTransitionDeliveries)).toEqual([])
  expect(
    await withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: '2026-11-10T04:00:02.000Z',
        history: history(s.id, true),
        targets
      })
    )
  ).toBeNull()
  await expect(asLogin('app', (c) => c.query('SELECT * FROM evaluator_source_transition'))).rejects.toThrow(
    /permission/
  )
})

test('missing Normal writes state without crossing; first watch crosses; failed shared writes roll back all evidence', async () => {
  const { run, p } = await scene()
  const v: Verdict = {
    scope: { kind: 'site', id: null },
    pack: 'sky',
    mode: 'normal',
    watch: false,
    noCall: null,
    recommendations: [],
    clauses: [],
    openFrom: null
  }
  const version = await run((tx) => makeSheetVersion(tx, { status: 'published' }))
  const snap = await run((tx) => makeIndicatorSnapshot(tx, { projectId: p.id }))
  const key = (v: Verdict) => JSON.stringify([v.mode, v.watch, v.noCall, v.recommendations])
  const q = {
    projectId: p.id,
    pack: 'sky' as const,
    tEval: at,
    snapshotId: snap.id,
    sheetVersionId: version.id,
    verdictHash: 'hash',
    verdict: v,
    semanticKey: key(v),
    previousKey: key
  }
  const baseline = await run(async (tx) => {
    await lockEvaluatorProject(tx, p.id)
    return commitEvaluatorVerdict(tx, q)
  })
  expect(baseline).toEqual({ crossingId: null, applied: true })
  expect(await run((tx) => tx.select().from(shadowState).where(eq(shadowState.projectId, p.id)))).toHaveLength(1)
  const watch = { ...v, watch: true }
  expect(
    (
      await run(async (tx) => {
        await lockEvaluatorProject(tx, p.id)
        return commitEvaluatorVerdict(tx, {
          ...q,
          tEval: '2026-11-10T04:01:00.000Z',
          verdict: watch,
          semanticKey: key(watch)
        })
      })
    ).crossingId
  ).toBeTypeOf('string')
  const separate = await scene()
  const published = await separate.run((tx) => makeSheetVersion(tx, { status: 'published' }))
  const registry = [
    { name: 'site.api_max', celType: 'int' as const, unit: '', scope: 'site' as const, sourceKind: 'apims' as const }
  ]
  const snapshot = snapshotAt({ sources: [], readings: [], polls: [] }, registry, separate.p.id, 'sky', at)
  await expect(
    separate.run(async (tx) => {
      await lockEvaluatorProject(tx, separate.p.id)
      const saved = await saveEvaluatorSnapshot(tx, { snapshot, registry, windows: [] })
      await commitEvaluatorVerdict(tx, {
        ...q,
        projectId: separate.p.id,
        snapshotId: saved.snapshotId,
        sheetVersionId: published.id,
        verdict: watch,
        semanticKey: key(watch)
      })
      throw new Error('crash after actual emitEvent')
    })
  ).rejects.toThrow('crash')
  for (const table of [shadowState, crossing, indicatorSnapshot])
    expect(await separate.run((tx) => tx.select().from(table))).toEqual([])
})
test('source errors and recovery preserve actual null HTTP metadata in typed events', async () => {
  const x = await scene(),
    s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  await x.run(async (tx) => {
    await makeProjectSource(tx, { projectId: x.p.id, sourceId: s.id })
    await makeProjectPack(tx, { projectId: x.p.id, enabled: true })
    await makeProjectPack(tx, { projectId: x.p.id, pack: 'crowd', enabled: true })
  })
  const targets = [{ orgId: x.orgId, projectId: x.p.id }]
  const failed = history(s.id)
  failed.polls[0]!.outcome = 'error'
  failed.polls[0]!.httpStatus = null
  const error = await withSystem('test', (tx) =>
    recordSourceTransition(tx, { sourceId: s.id.toUpperCase(), tEval: at, history: failed, targets })
  )
  await x.run((tx) => deliverSourceTransition(tx, { transitionId: error!.id, projectId: x.p.id }))
  const recoveredHistory = history(s.id, true)
  recoveredHistory.polls[0]!.httpStatus = null
  recoveredHistory.polls.unshift({ ...failed.polls[0]!, id: 'old-error' })
  const recovered = await withSystem('test', (tx) =>
    recordSourceTransition(tx, {
      sourceId: s.id,
      tEval: '2026-11-10T04:00:01.000Z',
      history: recoveredHistory,
      targets
    })
  )
  await x.run((tx) => deliverSourceTransition(tx, { transitionId: recovered!.id, projectId: x.p.id }))
  const rows = await x.run((tx) =>
    tx.execute(sql`SELECT type,data FROM domain_event WHERE project_id=${x.p.id} ORDER BY seq`)
  )
  expect(rows.rows).toMatchObject([
    { type: 'source.error', data: { http_status: null } },
    { type: 'source.recovered', data: { http_status: null } }
  ])
  expect(await x.run((tx) => findSourceTargets(tx, { sourceId: s.id, tEval: at }))).toEqual(targets)
  // No second recovery when the same recovered frame is evaluated again.
  expect(
    await withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: '2026-11-10T04:00:02.000Z',
        history: recoveredHistory,
        targets
      })
    )
  ).toBeNull()
  expect(
    await withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: '2026-11-10T04:00:03.000Z',
        history: recoveredHistory,
        targets
      })
    )
  ).toBeNull()
})
test.each(['removed', 'archived', 'deleted'] as const)(
  '%s recipient is acknowledged without emission',
  async (kind) => {
    const x = await scene(),
      s = await withSystem('test', (tx) => makeSource(tx))
    await x.run(async (tx) => {
      await makeProjectSource(tx, { projectId: x.p.id, sourceId: s.id })
      await makeProjectPack(tx, { projectId: x.p.id, enabled: true })
    })
    const t = await withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: at,
        history: history(s.id),
        targets: [{ orgId: x.orgId, projectId: x.p.id }]
      })
    )
    await asLogin('retention', (c) =>
      c.query(
        kind === 'removed'
          ? 'DELETE FROM project_source WHERE project_id=$1'
          : kind === 'archived'
            ? 'UPDATE project SET archived_at=now() WHERE id=$1'
            : 'DELETE FROM project WHERE id=$1',
        [x.p.id]
      )
    )
    expect(await x.run((tx) => deliverSourceTransition(tx, { transitionId: t!.id, projectId: x.p.id }))).toBe(true)
    expect((await x.run((tx) => tx.execute(sql`SELECT * FROM domain_event WHERE project_id=${x.p.id}`))).rows).toEqual(
      []
    )
    expect(
      (
        await withSystem('test', (tx) =>
          tx.select().from(evaluatorSourceDelivery).where(eq(evaluatorSourceDelivery.transitionId, t!.id))
        )
      )[0]!.completedAt
    ).not.toBeNull()
  }
)
test('unfinished source fanout and reevaluation survive retention; completed work is swept', async () => {
  const x = await scene(),
    s = await withSystem('test', (tx) => makeSource(tx))
  const t = await withSystem('test', (tx) =>
    recordSourceTransition(tx, {
      sourceId: s.id,
      tEval: at,
      history: history(s.id),
      targets: [{ orgId: x.orgId, projectId: x.p.id }]
    })
  )
  await x.run((tx) =>
    requestEvaluatorReevaluation(tx, { projectId: x.p.id, pack: 'sky', tEval: at, reason: 'deferred' })
  )
  await withRetention('test', (tx) => sweepEvaluatorCoordination(tx, new Date('2027-12-01T00:00:00Z')))
  expect(
    await withSystem('test', (tx) =>
      tx.select().from(evaluatorSourceTransition).where(eq(evaluatorSourceTransition.id, t!.id))
    )
  ).toHaveLength(1)
  expect(await x.run((tx) => tx.select().from(evaluatorReevaluation))).toHaveLength(1)
  await shareSystemConnection(async () => {
    await withSystem('test', listSourceTransitionDeliveries)
    await x.run((tx) => deliverSourceTransition(tx, { transitionId: t!.id, projectId: x.p.id }))
  })
  await x.run((tx) => completeEvaluatorReevaluation(tx, { projectId: x.p.id, pack: 'sky', tEval: at }))
  await withRetention('test', (tx) => sweepEvaluatorCoordination(tx, new Date('2027-12-01T00:00:00Z')))
  expect(
    await withSystem('test', (tx) =>
      tx.select().from(evaluatorSourceTransition).where(eq(evaluatorSourceTransition.id, t!.id))
    )
  ).toEqual([])
  expect(await x.run((tx) => tx.select().from(evaluatorReevaluation))).toEqual([])
})

test.each(['camera', 'pi'] as const)('%s without authoritative owner context fails closed', async (kind) => {
  const x = await scene(),
    s = await withSystem('test', (tx) => makeSource(tx, { kind, meta: { project_id: x.p.id } }))
  const h = history(s.id)
  h.sources[0]!.kind = kind
  h.sources[0]!.meta = { project_id: x.p.id }
  await expect(
    withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: at,
        history: h,
        targets: [{ orgId: x.orgId, projectId: x.p.id }]
      })
    )
  ).rejects.toMatchObject({ owner: 'b-evaluator:device-owner-context' })
  expect(await withSystem('test', (tx) => tx.select().from(sourceState).where(eq(sourceState.sourceId, s.id)))).toEqual(
    []
  )
})
test('concurrent source evaluations have one immutable transition and older input cannot regress state', async () => {
  const s = await withSystem('test', (tx) => makeSource(tx, { kind: 'apims' }))
  const results = await Promise.all(
    [0, 1].map(() =>
      withSystem('test', (tx) =>
        recordSourceTransition(tx, { sourceId: s.id, tEval: at, history: history(s.id), targets: [] })
      )
    )
  )
  expect(results.filter(Boolean)).toHaveLength(1)
  expect(
    await withSystem('test', (tx) =>
      recordSourceTransition(tx, {
        sourceId: s.id,
        tEval: '2026-11-10T03:00:00.000Z',
        history: history(s.id, true),
        targets: []
      })
    )
  ).toBeNull()
  const [state] = await withSystem('test', (tx) => tx.select().from(sourceState).where(eq(sourceState.sourceId, s.id)))
  expect(state).toMatchObject({ state: 'stale', evaluatedAt: new Date(at) })
})

test('reevaluation retention starts at actual completion, not a historical evaluation instant', async () => {
  const x = await scene(),
    started = new Date()
  const q = { projectId: x.p.id, pack: 'sky' as const, tEval: at }
  await x.run((tx) => requestEvaluatorReevaluation(tx, { ...q, reason: 'old requested instant' }))
  await x.run((tx) => completeEvaluatorReevaluation(tx, q))
  const [intent] = await x.run((tx) => tx.select().from(evaluatorReevaluation))
  expect(intent!.completedAt!.getTime()).toBeGreaterThanOrEqual(started.getTime())
})
