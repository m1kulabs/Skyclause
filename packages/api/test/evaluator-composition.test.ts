import { spawnSync } from 'node:child_process'
import { expect, test } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import {
  withTenant,
  systemPrincipal,
  createProjectRecord,
  indicatorSnapshot,
  clauseSheet,
  recordAudit
} from '@skyclause/db'
import skyDefault from '@skyclause/clauses/defaults/sky.json' with { type: 'json' }
import { makeOrganization, makeRun, makeBundle } from '../../db/test/factories'
import { TEST_REGISTRY } from '../../clauses/test/test-helpers'
import type { SourceAdapter } from '@skyclause/sources'
import { createEvaluatorProviders, productionEvaluatorProviders } from '@skyclause/api/evaluator'
import { clauseSheetPorts } from '../src/services/clause-sheets/ports'
import { setRecheckPorts } from '../src/services/approvals'
import { recheck } from '../src/services/approvals/recheck'
import { apiRequest, asSession, createTestApi, testCan, testDeps, testOrg } from './harness'

async function scene() {
  const orgId = (await makeOrganization()).id
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
    withTenant({ orgId, principal: systemPrincipal('evaluator-composition-test') }, fn)
  const created = await run((tx) =>
    createProjectRecord(tx, {
      name: 'Composition',
      slug: 'composition',
      siteName: 'APU',
      siteLat: 3,
      siteLon: 101,
      packs: ['sky']
    })
  )
  return { orgId, run, created }
}
test('cold API and worker composition is credential-free and makes no network connections', () => {
  const worker = new URL('../../../apps/worker/src/registry.ts', import.meta.url).pathname
  const result = spawnSync(
    'bun',
    [
      '--eval',
      `const net=await import('node:net');net.Socket.prototype.connect=()=>{throw new Error('network at import')};globalThis.fetch=()=>{throw new Error('fetch at import')};await import('@skyclause/api/evaluator');await import('@skyclause/api');await import(${JSON.stringify(worker)});`
    ],
    { cwd: new URL('..', import.meta.url).pathname, env: { PATH: process.env.PATH }, encoding: 'utf8' }
  )
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})
test('actual API preview and worker grade seams use the real providers, without manufacturing missing default definitions', async () => {
  await import('../src/index')
  const s = await scene(),
    providers = productionEvaluatorProviders(),
    ports = clauseSheetPorts()
  expect(ports.registry).toBe(providers.registry)
  expect(ports.recordedAt).toBeNull()
  const registry = await s.run((tx) => ports.registry!.load(tx, { projectId: s.created.project.id, pack: 'sky' }))
  expect(registry.find((d) => d.name === 'site.rain_60m_mm')).toMatchObject({
    celType: 'double',
    sourceKind: 'jps_rain'
  })
  const readOnly = await s.run(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`)
    return ports.snapshots!.take(tx, {
      projectId: s.created.project.id,
      pack: 'sky',
      tEval: '2026-11-11T02:00:00Z',
      windows: [],
      persist: false
    })
  })
  expect(readOnly.snapshotId).toBeNull()
  expect(await s.run((tx) => tx.select().from(indicatorSnapshot))).toEqual([])
  await expect(
    s.run((tx) =>
      createEvaluatorProviders({ adapters: [], forecast: null }).shadow.loadPublished(tx, s.created.project.id, 'sky')
    )
  ).rejects.toMatchObject({ name: 'NotBuiltError' })
})
test('approval recheck checks the actual pinned publication and retains registryTypes', async () => {
  const s = await scene()
  const providers = createEvaluatorProviders({
    adapters: [{ indicators: TEST_REGISTRY } as SourceAdapter<unknown>],
    forecast: null
  })
  setRecheckPorts({ ...providers })
  const version = s.created.versions.find((v) => (v.content as { pack: string }).pack === 'sky')!
  const bundle = await s.run(async (tx) => {
    const run = await makeRun(tx, {
      projectId: s.created.project.id,
      pack: 'sky',
      sheetVersionId: version.id,
      snapshotId: null,
      status: 'drafted'
    })
    return makeBundle(tx, { projectId: s.created.project.id, runId: run.id, pack: 'sky' })
  })
  // A pinned publication is selected by ID; a different live pointer cannot substitute it.
  await s.run((tx) =>
    tx.update(clauseSheet).set({ liveVersionId: null }).where(eq(clauseSheet.projectId, s.created.project.id))
  )
  const result = await s.run((tx) =>
    recheck(tx, { bundle, calls: [], windows: [], urls: new Map(), now: new Date('2026-11-11T02:00:00Z') })
  )
  expect(result.sheet.registryTypes?.['site.api_max']).toBe('int')
  expect(result.sheet.contentHash).toBe(version.contentHash)
  expect(result.snapshotId).toBeTypeOf('string')
})
test('a what-if runs on the composed engine, so only replay is still not built', async () => {
  await import('../src/index')
  const slug = 'what-if-composition'
  await makeOrganization({ id: testOrg(slug).id, slug })
  const created = await withTenant(
    { orgId: testOrg(slug).id, principal: systemPrincipal('evaluator-composition-test') },
    (tx) =>
      createProjectRecord(tx, {
        name: 'What-if',
        slug: 'what-if',
        siteName: 'APU',
        siteLat: 3,
        siteLon: 101,
        packs: ['sky']
      })
  )
  const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, can: testCan }) })
  // Haze watch reads only installed indicators, so it checks against the composed registry and nothing else.
  const response = await apiRequest(v1, {
    as: asSession({ org: slug, role: 'viewer' }),
    method: 'POST',
    path: `/v1/projects/${created.project.id}/analysis/what-if`,
    org: slug,
    body: {
      sheet: { pack: 'sky', clauses: [skyDefault.clauses[0]] },
      range: { from: '2026-11-05T00:00:00Z', to: '2026-11-06T00:00:00Z', step: 'PT60M' }
    }
  })
  expect(response.status).toBe(501)
  expect(await response.json()).toMatchObject({ type: expect.stringMatching(/\/not-built$/), owner: 'b-replay' })
})
