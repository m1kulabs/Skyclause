import { expect, test } from 'vitest'
import { canonicalHash, resolveSourceAt, type IndicatorDefinition } from '@skyclause/clauses'
import type { TxHandle } from '@skyclause/contracts'
import { adapters, type SourceAdapter } from '@skyclause/sources'
import { withSystem, withTenant, systemPrincipal } from '@skyclause/db'
import { makeOrganization, makeProject, makeProjectSource, makeSource, makeReading } from '../../db/test/factories'
import { memberOf } from '../../db/test/harness'
import { loadEvaluatorHistory } from '../src/services/evaluator/history'
import { createRuntimeRegistry, mapSourceMetadata } from '../src/services/evaluator/registry'
import { createEvaluatorProviders } from '../src/services/evaluator'
import { TEST_REGISTRY } from '../../clauses/test/test-helpers'
import { createProjectRecord, clauseSheet, sheetVersion, loadEvaluatorSnapshot } from '@skyclause/db'
import { asLogin } from '../../db/test/harness'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { ForecastSource } from '@skyclause/contracts'
import type { NightInput } from '@skyclause/clauses'

const tEval = '2026-11-10T04:00:00.000Z'
async function projectScene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
  const created = await run((tx) =>
    createProjectRecord(tx, {
      name: 'Evaluator providers',
      slug: `evaluator-${randomUUID().slice(0, 8)}`,
      siteName: 'APU',
      siteLat: 3.0553,
      siteLon: 101.7005,
      packs: ['sky']
    })
  )
  // Existing engine test declarations are injected only into this isolated test provider.
  const installed = [adapter(TEST_REGISTRY)]
  return { orgId, run, created, providers: createEvaluatorProviders({ adapters: installed, forecast: null }) }
}
test('persist=false uses a read-only tenant transaction and writes nothing', async () => {
  const { run, created, providers } = await projectScene()
  const q = { projectId: created.project.id, pack: 'sky' as const, tEval, windows: [], persist: false }
  const originalDefinitions = await run((tx) => providers.registry.load(tx, q))
  const taken = await run(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`)
    return providers.snapshots.take(tx, q)
  })
  expect(taken.snapshotId).toBeNull()
  expect(taken.snapshot.inputs.find((row) => row.name === 'site.api_max')).toMatchObject({
    sourceId: null,
    state: 'stale'
  })
  const count = await asLogin('postgres', (client) =>
    client.query('SELECT count(*)::int AS n FROM indicator_snapshot WHERE project_id = $1', [q.projectId])
  )
  expect(count.rows).toEqual([{ n: 0 }])
  expect(providers.recordedAt).toBeNull()
  const saved = await run((tx) => providers.snapshots.take(tx, { ...q, persist: true }))
  expect(saved.snapshotId).toBeTypeOf('string')
  expect(await run((tx) => loadEvaluatorSnapshot(tx, q))).toMatchObject(saved)
  const removed = createEvaluatorProviders({ adapters: [], forecast: null })
  expect(await run((tx) => removed.snapshots.take(tx, { ...q, persist: true }))).toEqual(saved)
  expect(
    await run((tx) =>
      removed.registry.load(tx, { projectId: q.projectId, pack: q.pack, registryHash: saved.snapshot.registryHash })
    )
  ).toEqual(originalDefinitions)
  await expect(
    run((tx) => removed.registry.load(tx, { projectId: q.projectId, pack: q.pack, registryHash: 'unknown' }))
  ).rejects.toMatchObject({ owner: 'b-evaluator:historical-registry' })
  await expect(run((tx) => removed.registry.load(tx, { projectId: q.projectId, pack: q.pack }))).rejects.toMatchObject({
    owner: 'b-evaluator:indicator-registry'
  })
})
test('real System v1 is checked and evaluated without modifying its publication', async () => {
  const { run, created, providers } = await projectScene()
  const version = created.versions.find((row) => row.content && (row.content as { pack: string }).pack === 'sky')!
  expect(version.validationRegistryHash).toBeNull()
  const loaded = await run((tx) => providers.shadow.loadPublished(tx, created.project.id, 'sky'))
  expect(loaded).toMatchObject({
    versionId: version.id,
    n: 1,
    sheet: { contentHash: version.contentHash, registryTypes: { 'site.api_max': 'int' } }
  })
  const taken = await run((tx) =>
    providers.snapshots.take(tx, { projectId: created.project.id, pack: 'sky', tEval, windows: [], persist: false })
  )
  const result = providers.shadow.evaluate(loaded.sheet, taken.snapshot, [], tEval)
  expect(result.verdicts.site[0]?.noCall?.inputs.length).toBeGreaterThan(0)
  expect(result.verdictHash).toBe(result.verdicts.hash)
  expect(result.explanations.length).toBeGreaterThan(0)
  expect(await run((tx) => tx.select().from(sheetVersion).where(eq(sheetVersion.id, version.id)))).toEqual([version])
  await expect(
    run((tx) =>
      createEvaluatorProviders({ adapters, forecast: null }).shadow.loadPublished(tx, created.project.id, 'sky')
    )
  ).rejects.toMatchObject({ name: 'NotBuiltError' })
  await expect(
    run((tx) =>
      createEvaluatorProviders({ adapters: [adapter([definition])], forecast: null }).shadow.loadPublished(
        tx,
        created.project.id,
        'sky'
      )
    )
  ).rejects.toThrow(/check/)
})
test('checked publication helper uses the exact verified archive registry when explicitly pinned', async () => {
  const { run, created, providers } = await projectScene()
  const q = { projectId: created.project.id, pack: 'sky' as const }
  const saved = await run((tx) => providers.snapshots.take(tx, { ...q, tEval, windows: [], persist: true }))
  const original = created.versions.find((version) => (version.content as { pack: string }).pack === q.pack)!
  const [publication] = await run((tx) =>
    tx
      .insert(sheetVersion)
      .values({
        orgId: original.orgId,
        sheetId: original.sheetId,
        n: 2,
        status: 'published',
        content: original.content,
        contentHash: original.contentHash,
        validationRegistryHash: 'unknown-publication-time-registry'
      })
      .returning()
  )
  expect(
    (await run((tx) => providers.loadCheckedPublishedVersion(tx, { ...q, versionId: publication!.id }))).sheet
      .registryHash
  ).toBe(saved.snapshot.registryHash)
  const noCurrentDefinitions = createEvaluatorProviders({ adapters: [], forecast: null })
  await expect(run((tx) => noCurrentDefinitions.loadCheckedPublishedVersion(tx, q))).rejects.toMatchObject({
    owner: 'b-evaluator:indicator-registry'
  })
  const pin = {
    ...q,
    versionId: created.sheets.find((sheet) => sheet.pack === q.pack)!.liveVersionId!,
    registryHash: saved.snapshot.registryHash
  }
  const checked = await run((tx) => noCurrentDefinitions.loadCheckedPublishedVersion(tx, pin))
  expect(checked.sheet.registryHash).toBe(saved.snapshot.registryHash)
  expect(checked.sheet.registryTypes?.['site.api_max']).toBe('int')
  expect(
    noCurrentDefinitions.shadow.evaluate(checked.sheet, saved.snapshot, [], tEval).verdicts.site[0]?.noCall?.inputs
      .length
  ).toBeGreaterThan(0)
  await expect(
    run((tx) => noCurrentDefinitions.loadCheckedPublishedVersion(tx, { ...pin, registryHash: 'unknown' }))
  ).rejects.toMatchObject({ owner: 'b-evaluator:historical-registry' })
  const incomplete = createEvaluatorProviders({ adapters: [adapter([definition])], forecast: null })
  const otherArchive = await run((tx) =>
    incomplete.snapshots.take(tx, { ...q, tEval: '2026-11-10T04:01:00Z', windows: [], persist: true })
  )
  await expect(
    run((tx) =>
      noCurrentDefinitions.loadCheckedPublishedVersion(tx, { ...pin, registryHash: otherArchive.snapshot.registryHash })
    )
  ).rejects.toMatchObject({ owner: 'b-evaluator:published-sheet-check' })
  await asLogin('retention', (client) =>
    client.query("UPDATE indicator_snapshot SET registry_definitions = '[]' WHERE id = $1", [saved.snapshotId])
  )
  await expect(run((tx) => noCurrentDefinitions.loadCheckedPublishedVersion(tx, pin))).rejects.toThrow(/hash/)
})
test('publication selection rejects wrong pack/project, draft pins, corrupt content and foreign live pointers', async () => {
  const { run, created, providers } = await projectScene()
  const sky = created.sheets.find((row) => row.pack === 'sky')!
  const crowd = created.versions.find((row) => row.sheetId !== sky.id)!
  const other = await projectScene()
  const query = { projectId: created.project.id, pack: 'sky' as const }
  await expect(
    run((tx) => providers.loadCheckedPublishedVersion(tx, { ...query, versionId: crowd.id }))
  ).rejects.toThrow(/published/)
  await expect(
    run((tx) => providers.loadCheckedPublishedVersion(tx, { ...query, versionId: other.created.versions[0]!.id }))
  ).rejects.toThrow(/published/)
  const [draft] = await run((tx) =>
    tx
      .insert(sheetVersion)
      .values({
        orgId: sky.orgId,
        sheetId: sky.id,
        content: { pack: 'sky', clauses: [] },
        contentHash: 'draft',
        status: 'draft'
      })
      .returning()
  )
  await expect(
    run((tx) => providers.loadCheckedPublishedVersion(tx, { ...query, versionId: draft!.id }))
  ).rejects.toThrow(/published/)
  const validId = sky.liveVersionId!
  await run((tx) => tx.update(clauseSheet).set({ liveVersionId: crowd.id }).where(eq(clauseSheet.id, sky.id)))
  await expect(run((tx) => providers.shadow.loadPublished(tx, query.projectId, query.pack))).rejects.toThrow(
    /published/
  )
  expect(
    (await run((tx) => providers.loadCheckedPublishedVersion(tx, { ...query, versionId: validId }))).versionId
  ).toBe(validId)
  const [corrupt] = await run((tx) =>
    tx
      .insert(sheetVersion)
      .values({
        orgId: sky.orgId,
        sheetId: sky.id,
        n: 2,
        status: 'published',
        content: created.versions.find((version) => version.id === validId)!.content,
        contentHash: 'corrupt'
      })
      .returning()
  )
  await expect(
    run((tx) => providers.loadCheckedPublishedVersion(tx, { ...query, versionId: corrupt!.id }))
  ).rejects.toThrow(/hash/)
})
test('Sky never calls forecast; Crowd null is unavailable and real-shaped nights preserve null exits and hash', async () => {
  const { run, created } = await projectScene()
  const installed = [adapter(TEST_REGISTRY)]
  const absent = createEvaluatorProviders({ adapters: installed, forecast: null })
  const q = { projectId: created.project.id, pack: 'crowd' as const, tEval, windows: [], persist: false }
  await expect(run((tx) => absent.snapshots.take(tx, q))).rejects.toMatchObject({
    name: 'NotBuiltError',
    owner: 'b-forecast'
  })
  const night: NightInput = {
    id: 'listed-night',
    date: '2026-11-10',
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
  const forecast: ForecastSource = {
    nights: async (_tx, range) => {
      expect(range).toEqual({ projectId: q.projectId, from: '2026-11-10', to: '2026-11-10' })
      return [structuredClone(night)]
    },
    exits: async () => {
      throw new Error('unexpected exits')
    },
    baseline: async () => {
      throw new Error('unexpected baseline')
    }
  }
  const throwing = createEvaluatorProviders({
    adapters: installed,
    forecast: {
      ...forecast,
      nights: async () => {
        throw new Error('Sky called forecast')
      }
    }
  })
  expect((await run((tx) => throwing.snapshots.take(tx, { ...q, pack: 'sky' }))).snapshot.nights).toEqual([])
  const providers = createEvaluatorProviders({ adapters: installed, forecast })
  const taken = await run((tx) => providers.snapshots.take(tx, q))
  expect(taken.snapshot.nights).toEqual([night])
  const { hash, ...body } = taken.snapshot
  expect(hash).toBe(canonicalHash(body))
  expect(hash).not.toBe(canonicalHash({ ...body, nights: [] }))
  night.exitEnd = '2026-11-10T16:00:00Z'
  const changed = await run((tx) => providers.snapshots.take(tx, q))
  expect(changed.snapshot.hash).not.toBe(hash)
  expect(changed.snapshot.nights[0]!.exitEnd).toBe(night.exitEnd)
})

test('snapshot composition uses validated eligible API history and range temporal context stays unavailable', async () => {
  const { run, created, providers } = await projectScene()
  const source = await withSystem('test-evaluator-checked-history', (tx) =>
    makeSource(tx, { kind: 'rapidrail_od', freshness: 'polled', meta: { next_update: '2099-01-01T00:00:00Z' } })
  )
  await run((tx) => makeProjectSource(tx, { projectId: created.project.id, sourceId: source.id, role: 'rain_gauge' }))
  const q = { projectId: created.project.id, pack: 'sky' as const, tEval, windows: [], persist: false }
  expect((await run((tx) => providers.snapshots.take(tx, q))).snapshot.nights).toEqual([])
  await expect(
    run((tx) => providers.history(tx, { projectId: q.projectId, from: tEval, to: tEval }))
  ).rejects.toMatchObject({ owner: 'b-evaluator:temporal-context-history' })
})

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
  const installed = await createRuntimeRegistry(adapters).load(tx, q)
  expect(installed).toEqual(
    expect.arrayContaining([
      { name: 'site.rain_60m_mm', celType: 'double', unit: 'mm', scope: 'site', sourceKind: 'jps_rain' }
    ])
  )
  await expect(createRuntimeRegistry([]).load(tx, q)).rejects.toMatchObject({ name: 'NotBuiltError' })
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

test('Sky history does not depend on unavailable bound Crowd metadata', async () => {
  const s = await projectScene()
  for (const kind of ['rapidrail_od', 'gtfs_static'] as const) {
    const source = await withSystem('unavailable-crowd', (tx) => makeSource(tx, { kind }))
    await s.run((tx) => makeProjectSource(tx, { projectId: s.created.project.id, sourceId: source.id }))
  }
  expect(
    await s.run((tx) => loadEvaluatorHistory(tx, { projectId: s.created.project.id, pack: 'sky', tEval }))
  ).toEqual({ sources: [], readings: [], polls: [] })
  await expect(
    s.run((tx) => loadEvaluatorHistory(tx, { projectId: s.created.project.id, pack: 'crowd', tEval }))
  ).rejects.toMatchObject({ name: 'NotBuiltError' })
})

test.each(['required', 'optional'] as const)(
  'the API checker explicitly rejects unsupported cross-pack %s indicators',
  async (mode) => {
    const { checkedValidation } = await import('../src/services/clause-sheets/ports')
    const jps = adapters.find((a) => a.kind === 'jps_rain')!
    const crowd = adapter(TEST_REGISTRY.filter((d) => d.name === 'site.night.baseline'))
    const registry = await createRuntimeRegistry([jps, crowd]).load(tx, { projectId: 'project', pack: 'crowd' })
    const content = {
      pack: 'crowd' as const,
      clauses: [
        {
          key: 'rain_watch',
          name: 'Rain watch',
          enabled: true,
          scope: 'site' as const,
          requires: mode === 'required' ? ['site.rain_60m_mm'] : [],
          optional: mode === 'optional' ? ['site.rain_60m_mm'] : [],
          when: mode === 'required' ? 'site.rain_60m_mm > 20.0' : 'has(site.rain_60m_mm) && site.rain_60m_mm > 20.0',
          proposes: { watch: true as const },
          wording: { en: 'Rain watch' }
        }
      ]
    }
    const validation = await checkedValidation(content, registry)
    expect(validation.result.publishable).toBe(false)
    expect(validation.result.issues.some((i) => i.message.includes('site.rain_60m_mm'))).toBe(true)
  }
)

test.each([
  {
    events: [
      [5, 'ok'],
      [10, 'error']
    ] as const,
    want: 'error'
  },
  {
    events: [
      [0, 'ok'],
      [5, 'error'],
      [10, 'ok']
    ] as const,
    want: 'recovered'
  }
])('DB history preserves physical capture ordering across a shared receipt ($want)', async ({ events, want }) => {
  const s = await projectScene(),
    at = (minute: number) => new Date(`2026-11-10T10:${String(minute).padStart(2, '0')}:00Z`)
  const source = await withSystem('batched-error-order', async (tx) => {
    const source = await makeSource(tx, { kind: 'jps_rain', freshness: 'observed', staleAfterS: 600 })
    for (const [minute, outcome] of events) {
      const { makePoll } = await import('../../db/test/factories')
      const poll = await makePoll(tx, {
        sourceId: source.id,
        startedAt: at(minute),
        receivedAt: at(15),
        outcome,
        httpStatus: outcome === 'error' ? 503 : 200
      })
      if (outcome === 'ok')
        await makeReading(tx, {
          sourceId: source.id,
          pollId: poll.id,
          metric: 'rain_5m_mm',
          unit: 'mm',
          value: 0,
          observedAt: at(minute),
          receivedAt: at(15)
        })
    }
    return source
  })
  await s.run((tx) =>
    makeProjectSource(tx, { projectId: s.created.project.id, sourceId: source.id, role: 'rain_gauge' })
  )
  const history = await s.run((tx) =>
    loadEvaluatorHistory(tx, { projectId: s.created.project.id, pack: 'sky', tEval: at(15).toISOString() })
  )
  expect(resolveSourceAt(history, source.id, at(15).toISOString()).state).toBe(want)
})

test('historical registry lookup preserves all archived definitions but rejects unsupported cross-pack use', async () => {
  const s = await projectScene()
  const { snapshotAt } = await import('@skyclause/clauses')
  const { saveEvaluatorSnapshot } = await import('@skyclause/db')
  const q = { projectId: s.created.project.id, pack: 'sky' as const, tEval: '2026-11-10T08:00:00Z' }
  const snapshot = snapshotAt({ sources: [], readings: [], polls: [] }, TEST_REGISTRY, q.projectId, q.pack, q.tEval)
  await s.run((tx) => saveEvaluatorSnapshot(tx, { snapshot, registry: TEST_REGISTRY, windows: [] }))
  const empty = createEvaluatorProviders({ adapters: [], forecast: null })
  const archived = await s.run((tx) => empty.registry.load(tx, { ...q, registryHash: snapshot.registryHash }))
  expect(archived).toEqual(TEST_REGISTRY)
  const supported = await s.run((tx) =>
    empty.loadCheckedPublishedVersion(tx, { ...q, registryHash: snapshot.registryHash })
  )
  expect(supported.sheet.registryHash).toBe(snapshot.registryHash)
  const original = s.created.versions.find((v) => (v.content as { pack: string }).pack === 'sky')!
  const content = {
    pack: 'sky' as const,
    clauses: [
      {
        key: 'rail_watch',
        name: 'Rail watch',
        enabled: true,
        scope: 'site' as const,
        requires: ['site.night.baseline'],
        when: 'site.night.baseline > 20',
        proposes: { watch: true as const },
        wording: { en: 'Rail watch' }
      }
    ]
  }
  const version = await s.run(async (tx) => {
    const { makeSheetVersion } = await import('../../db/test/factories')
    return makeSheetVersion(tx, { sheetId: original.sheetId, n: 2, status: 'published', content })
  })
  await expect(
    s.run((tx) =>
      empty.loadCheckedPublishedVersion(tx, { ...q, versionId: version.id, registryHash: snapshot.registryHash })
    )
  ).rejects.toMatchObject({ owner: 'b-evaluator:unsupported-pack-input' })
})
