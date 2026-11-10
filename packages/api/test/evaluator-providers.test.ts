import { expect, test } from 'vitest'
import { canonicalHash, type IndicatorDefinition } from '@skyclause/clauses'
import type { TxHandle } from '@skyclause/contracts'
import { adapters, type SourceAdapter } from '@skyclause/sources'
import { withSystem, withTenant, systemPrincipal } from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource, makeReading } from '../../db/test/factories'
import { memberOf } from '../../db/test/harness'
import { loadEvaluatorHistory } from '../src/services/evaluator/history'
import { createRuntimeRegistry, mapSourceMetadata } from '../src/services/evaluator/registry'

const tx = {} as TxHandle
const definition: IndicatorDefinition = {
  name: 'site.rain_60m_mm',
  celType: 'double',
  unit: 'mm',
  scope: 'site',
  sourceKind: 'jps_rain'
}
// Isolated test adapter: production registry always consumes actual installed declarations.
const adapter = (indicators: IndicatorDefinition[]) => ({ kind: 'jps_rain', indicators }) as SourceAdapter<unknown>
const q = { projectId: 'project', pack: 'sky' as const }
test('installed real adapters define readiness; empty actual registry is unavailable', async () => {
  expect(adapters).toEqual([])
  await expect(createRuntimeRegistry(adapters).load(tx, q)).rejects.toMatchObject({ name: 'NotBuiltError' })
})
test('deterministic declarations collapse identical duplicates and reject conflicts', async () => {
  const second = { ...definition, name: 'w.rain_max_60m_mm' }
  const provider = createRuntimeRegistry([adapter([second, definition]), adapter([definition])])
  expect(await provider.load(tx, q)).toEqual([definition, second])
  expect(await provider.load(tx, { ...q, registryHash: canonicalHash([definition, second]) })).toEqual([
    definition,
    second
  ])
  await expect(
    createRuntimeRegistry([adapter([definition, { ...definition, unit: 'cm' }])]).load(tx, q)
  ).rejects.toThrow('Conflicting')
  await expect(provider.load(tx, { ...q, registryHash: 'unknown-historical-hash' })).rejects.toMatchObject({
    name: 'NotBuiltError'
  })
})
test('provider validates actual Rapid Rail UTC metadata and GTFS calendar rather than copying untrusted values', () => {
  const metadata = {
    data_as_of: 'published',
    last_updated: 'published',
    next_update: 'published',
    data_as_of_utc: '2026-11-01T00:00:00Z',
    last_updated_utc: '2026-11-02T00:00:00Z',
    next_update_utc: '2026-12-01T00:00:00Z'
  }
  expect(mapSourceMetadata('rapidrail_od', { retained: true }, [{ metric: 'metadata', valueJson: metadata }])).toEqual({
    retained: true,
    next_update: metadata.next_update_utc
  })
  const feed = { sha256: 'hash', object_path: 'path', calendar_end: '2026-11-10', segments: [] }
  expect(mapSourceMetadata('gtfs_static', {}, [{ metric: 'feed', valueJson: feed }])).toEqual({
    calendar_end: '2026-11-10'
  })
  expect(() =>
    mapSourceMetadata('rapidrail_od', {}, [{ metric: 'metadata', valueJson: { ...metadata, next_update_utc: 'bad' } }])
  ).toThrow()
  expect(() =>
    mapSourceMetadata('gtfs_static', {}, [{ metric: 'feed', valueJson: { ...feed, calendar_end: '2026-02-31' } }])
  ).toThrow()
  expect(() => mapSourceMetadata('rapidrail_od', { next_update: 'future' }, [])).toThrow('not built')
  expect(() => mapSourceMetadata('gtfs_static', { calendar_end: '2099-01-01' }, [])).toThrow('not built')
})

test('actual tenant provider selects newest eligible metadata/feed payload through real schemas and retains original clocks', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('test-evaluator-provider')
  const [rail, gtfs] = await withSystem(principal.job, async (tx) => [
    await makeSource(tx, { kind: 'rapidrail_od', freshness: 'polled', meta: { next_update: 'future-untrusted' } }),
    await makeSource(tx, { kind: 'gtfs_static', freshness: 'polled', meta: { calendar_end: '2099-01-01' } })
  ])
  const p = await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    const p = await makeProject(tx)
    for (const source of [rail, gtfs])
      await makeProjectSource(tx, { projectId: p.id, sourceId: source.id, role: 'rain_gauge' })
    return p
  })
  const observedAt = new Date('2026-11-10T01:00:00Z'),
    receivedAt = new Date('2026-11-10T02:00:00Z')
  const metadata = {
    data_as_of: 'published',
    last_updated: 'published',
    next_update: 'published',
    data_as_of_utc: '2026-11-01T00:00:00Z',
    last_updated_utc: '2026-11-02T00:00:00Z',
    next_update_utc: '2026-12-01T00:00:00Z'
  }
  await withSystem(principal.job, async (tx) => {
    await makeReading(tx, { sourceId: rail.id, metric: 'metadata', observedAt, receivedAt, valueJson: metadata })
    await makeReading(tx, {
      sourceId: rail.id,
      metric: 'metadata',
      observedAt: new Date('2026-11-10T02:30:00Z'),
      receivedAt: new Date('2026-11-10T04:00:00Z'),
      valueJson: { ...metadata, next_update_utc: '2027-01-01T00:00:00Z' }
    })
    await makeReading(tx, {
      sourceId: gtfs.id,
      metric: 'feed',
      observedAt,
      receivedAt,
      valueJson: { sha256: 'hash', object_path: 'path', calendar_end: '2026-11-10', segments: [] }
    })
  })
  const history = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    loadEvaluatorHistory(tx, { projectId: p.id, pack: 'crowd', tEval: '2026-11-10T03:00:00Z' })
  )
  expect(history.sources.find((s) => s.id === rail.id)?.meta.next_update).toBe(metadata.next_update_utc)
  expect(history.sources.find((s) => s.id === gtfs.id)?.meta.calendar_end).toBe('2026-11-10')
  expect(history.readings).toHaveLength(2)
  expect(
    history.readings.every(
      (r) => r.observedAt === observedAt.toISOString() && r.receivedAt === receivedAt.toISOString()
    )
  ).toBe(true)
  await withSystem(principal.job, (tx) =>
    makeReading(tx, {
      sourceId: rail.id,
      metric: 'metadata',
      observedAt: new Date('2026-11-10T02:45:00Z'),
      receivedAt: new Date('2026-11-10T02:46:00Z'),
      valueJson: { ...metadata, next_update_utc: 'invalid' }
    })
  )
  await expect(
    withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      loadEvaluatorHistory(tx, { projectId: p.id, pack: 'crowd', tEval: '2026-11-10T03:00:00Z' })
    )
  ).rejects.toMatchObject({ name: 'NotBuiltError', owner: 'b-evaluator:rapidrail-metadata-history' })
})
