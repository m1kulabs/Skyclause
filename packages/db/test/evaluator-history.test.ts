import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { resolveSourceAt, deriveInputState, snapshotAt } from '@skyclause/clauses'
import {
  loadEvaluatorHistory,
  loadReadingHistory,
  systemPrincipal,
  withSystem,
  withTenant,
  recordSourceRequest
} from '../src'
import { makeOrganization, makeProject, makeProjectSource, makeSource, makeReading, makePoll } from './factories'
import { memberOf } from './harness'

const system = systemPrincipal('test-evaluator-history')
const at = (value: string) => new Date(value)
const cutoff = '2026-11-10T04:00:00.000Z'
async function scene(
  kind: 'jps_rain' | 'apims' | 'met_warning' | 'camera' = 'jps_rain',
  freshness: 'observed' | 'polled' = 'polled'
) {
  const orgId = (await makeOrganization()).id
  const s = await withSystem(system.job, (tx) => makeSource(tx, { kind, freshness, meta: { retained: 'original' } }))
  const p = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const p = await makeProject(tx)
    await makeProjectSource(tx, { projectId: p.id, sourceId: s.id, role: 'rain_gauge' })
    await makeProjectSource(tx, { projectId: p.id, sourceId: s.id, role: 'api_station' })
    return p
  })
  const read = (tEval = cutoff) =>
    withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      loadEvaluatorHistory(tx, { projectId: p.id, pack: 'sky', tEval })
    )
  return { s, p, orgId, read }
}
test('receipt cutoff precedes full observation/item revision ranking and preserves payloads and source freshness', async () => {
  const { s, read } = await scene()
  const rows = await withSystem(system.job, async (tx) => {
    const common = {
      sourceId: s.id,
      observedAt: at('2026-11-10T02:00:00Z'),
      receivedAt: at('2026-11-10T03:00:00Z'),
      itemKey: 'a',
      revision: 1
    }
    const first = await makeReading(tx, {
      ...common,
      value: 3,
      valueText: 'published',
      valueJson: { exact: [1, 2] },
      deviceTime: at('2026-11-10T01:59:00Z')
    })
    await makeReading(tx, { ...common, value: 9, revision: 2, receivedAt: at('2026-11-10T05:00:00Z') })
    const item = await makeReading(tx, { ...common, itemKey: 'b', value: 5 })
    const observation = await makeReading(tx, { ...common, observedAt: at('2026-11-10T01:00:00Z'), value: 2 })
    return [observation, first, item]
  })
  const h = await read()
  expect(h.sources).toMatchObject([{ id: s.id, freshness: 'polled', meta: { retained: 'original' } }])
  expect(h.sources).toHaveLength(1)
  expect(h.readings.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort())
  expect(h.readings.find((r) => r.value === 3)).toMatchObject({
    valueText: 'published',
    valueJson: { exact: [1, 2] },
    observedAt: '2026-11-10T02:00:00.000Z',
    receivedAt: '2026-11-10T03:00:00.000Z',
    deviceTime: '2026-11-10T01:59:00.000Z',
    unit: 'mm'
  })
})
test('normal errors and unchanged polls have independent receipt clocks; backfill does not affect live freshness', async () => {
  const { s, read, p, orgId } = await scene()
  await withSystem(system.job, async (tx) => {
    await makePoll(tx, {
      sourceId: s.id,
      startedAt: at('2026-11-10T03:59:00Z'),
      receivedAt: at(cutoff),
      outcome: 'unchanged'
    })
    await makePoll(tx, {
      sourceId: s.id,
      startedAt: at('2026-11-10T03:59:30Z'),
      receivedAt: at('2026-11-10T04:01:00Z'),
      outcome: 'error',
      httpStatus: 503
    })
    await makePoll(tx, {
      sourceId: s.id,
      purpose: 'backfill',
      startedAt: at('2026-11-10T03:59:45Z'),
      receivedAt: at(cutoff),
      outcome: 'error'
    })
  })
  const early = await read()
  expect(early.polls).toMatchObject([
    { outcome: 'unchanged', startedAt: '2026-11-10T03:59:00.000Z', receivedAt: cutoff }
  ])
  expect(early.polls).toHaveLength(1)
  const later = await read('2026-11-10T04:01:00.000Z')
  expect(later.polls).toHaveLength(2)
  expect(resolveSourceAt(later, s.id, '2026-11-10T04:01:00.000Z').state).toBe('error')
  expect(resolveSourceAt(later, s.id, cutoff).state).toBe('fresh')
  const range = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    loadReadingHistory(tx, { projectId: p.id, from: cutoff, to: '2026-11-10T04:01:00Z' })
  )
  const registry = [
    {
      name: 'w.rain_max_60m_mm',
      celType: 'double' as const,
      unit: 'mm',
      scope: 'window' as const,
      sourceKind: 'jps_rain' as const
    }
  ]
  expect(deriveInputState(range, s.id, cutoff)).toBe('fresh')
  expect(deriveInputState(range, s.id, '2026-11-10T04:01:00Z')).toBe('error')
  const steps = [cutoff, '2026-11-10T04:01:00Z'].map(
    (tEval) => snapshotAt(range, registry, p.id, 'sky', tEval).inputs[0]?.state
  )
  expect(steps).toEqual(['fresh', 'error'])
})
test.each(['ok', 'unchanged', 'error'])(
  'legacy %s poll availability is explicitly unavailable, never silently fresh',
  async (outcome) => {
    const { s, read } = await scene()
    await withSystem(system.job, (tx) =>
      makePoll(tx, { sourceId: s.id, startedAt: at('2026-11-10T03:00:00Z'), outcome })
    )
    await expect(read()).rejects.toMatchObject({ name: 'NotBuiltError', owner: 'b-evaluator:poll-receipt-history' })
  }
)
test('all retained boundary history survives narrow requested span and replay retains revisions', async () => {
  const { s, p, orgId, read } = await scene('apims')
  await withSystem(system.job, (tx) =>
    makePoll(tx, { sourceId: s.id, startedAt: at('2026-11-10T02:58:00Z'), receivedAt: at('2026-11-10T02:58:00Z') })
  )
  const observations = ['2026-11-07T22:00:00Z', '2026-11-08T22:00:00Z', '2026-11-09T22:00:00Z', '2026-11-10T03:55:00Z']
  const correction = await withSystem(system.job, async (tx) => {
    for (const observed of observations)
      await makeReading(tx, {
        sourceId: s.id,
        metric: 'api',
        observedAt: at(observed),
        receivedAt: at(observed),
        value: 40
      })
    return makeReading(tx, {
      sourceId: s.id,
      metric: 'api',
      observedAt: at(observations[0]!),
      receivedAt: at('2026-11-10T03:00:00Z'),
      revision: 1,
      value: 50
    })
  })
  expect((await read()).readings).toHaveLength(4)
  const replay = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    loadReadingHistory(tx, { projectId: p.id, from: '2026-11-10T03:58:00Z', to: cutoff })
  )
  expect(replay.readings).toHaveLength(5)
  expect(replay.readings.map((r) => r.observedAt)).toContain('2026-11-07T22:00:00.000Z')
  const registry = [
    {
      name: 'site.api_0600_min_last3_max',
      celType: 'int' as const,
      unit: 'API',
      scope: 'site' as const,
      sourceKind: 'apims' as const
    }
  ]
  const earlier = snapshotAt(replay, registry, p.id, 'sky', '2026-11-10T02:59:00Z')
  expect(earlier.site['site.api_0600_min_last3_max']?.value).toBe(40)
  expect(earlier.site['site.api_0600_min_last3_max']?.readingIds).toHaveLength(3)
  expect(earlier.site['site.api_0600_min_last3_max']?.readingIds).not.toContain(correction.id)
  expect(snapshotAt(replay, registry, p.id, 'sky', cutoff).site['site.api_0600_min_last3_max']?.readingIds).toContain(
    correction.id
  )
})
test.each(['met_warning', 'jps_rain'] as const)('pre-window %s observations are retained', async (kind) => {
  const { s, read } = await scene(kind)
  await withSystem(system.job, (tx) =>
    makeReading(tx, {
      sourceId: s.id,
      metric: kind === 'met_warning' ? 'warning' : 'rain_5m_mm',
      observedAt: at('2026-11-09T00:00:00Z'),
      receivedAt: at('2026-11-09T00:01:00Z'),
      valueJson: { valid_from_utc: cutoff },
      value: 1
    })
  )
  expect((await read()).readings).toHaveLength(1)
})
test('foreign projects/devices, archived projects and system scope cannot expose history; empty stays empty', async () => {
  const { p, orgId, read } = await scene()
  expect((await read()).readings).toEqual([])
  const other = (await makeOrganization()).id
  const foreignDevice = await withTenant({ orgId: other, principal: memberOf(other) }, (tx) =>
    makeSource(tx, { kind: 'camera' })
  )
  await expect(
    withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      makeProjectSource(tx, { projectId: p.id, sourceId: foreignDevice.id })
    )
  ).rejects.toThrow('Failed query')
  expect((await read()).sources.some((source) => source.id === foreignDevice.id)).toBe(false)
  expect(
    await withTenant({ orgId: other, principal: memberOf(other) }, (tx) =>
      loadEvaluatorHistory(tx, { projectId: p.id, pack: 'sky', tEval: cutoff })
    )
  ).toEqual({ sources: [], readings: [], polls: [] })
  await expect(
    withSystem(system.job, (tx) => loadEvaluatorHistory(tx, { projectId: p.id, pack: 'sky', tEval: cutoff }))
  ).rejects.toThrow('tenant')
  const archived = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    makeProject(tx, { archivedAt: new Date() })
  )
  expect(
    await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      loadEvaluatorHistory(tx, { projectId: archived.id, pack: 'sky', tEval: cutoff })
    )
  ).toEqual({ sources: [], readings: [], polls: [] })
})
test('camera evidence cannot be enabled retroactively by current settings', async () => {
  const { read } = await scene('camera')
  await expect(read()).rejects.toMatchObject({ name: 'NotBuiltError', owner: 'b-evaluator:camera-context-history' })
})
test.each(['ok', 'unchanged', 'error', 'backfill'] as const)(
  'trusted writer stamps actual receipt for %s without using capture/reading clocks',
  async (outcome) => {
    const s = await withSystem(system.job, (tx) => makeSource(tx))
    const receipt = at('2026-11-10T06:00:00Z')
    const stored = await withSystem(system.job, (tx) =>
      recordSourceRequest(
        tx,
        {
          requestId: randomUUID(),
          startedAt: at('2026-11-10T01:00:00Z'),
          purpose: outcome === 'backfill' ? 'backfill' : 'poll',
          family: null,
          httpStatus: outcome === 'error' ? 503 : 200,
          latencyMs: 5,
          sources: [
            {
              sourceId: s.id,
              outcome: outcome === 'error' ? 'error' : 'ok',
              bodySha256: null,
              readings:
                outcome === 'ok'
                  ? [
                      {
                        metric: 'rain_5m_mm',
                        observedAt: at('2026-11-10T00:00:00Z'),
                        receivedAt: at('2026-11-10T02:00:00Z'),
                        value: 2,
                        unit: 'mm'
                      }
                    ]
                  : []
            }
          ]
        },
        () => receipt
      )
    )
    expect(stored[0]).toMatchObject({ receivedAt: receipt, startedAt: at('2026-11-10T01:00:00Z') })
  }
)

test('prior observations across a long recovery gap survive loading', async () => {
  const { s, read } = await scene('jps_rain', 'observed')
  await withSystem(system.job, async (tx) => {
    for (const observedAt of ['2026-11-01T00:00:00Z', '2026-11-10T03:59:00Z'])
      await makeReading(tx, { sourceId: s.id, observedAt: at(observedAt), receivedAt: at(observedAt), value: 1 })
  })
  const h = await read()
  expect(h.readings).toHaveLength(2)
  expect(resolveSourceAt(h, s.id, cutoff).state).toBe('recovered')
})
