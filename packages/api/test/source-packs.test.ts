import { randomUUID } from 'node:crypto'
import type { Pack } from '@skyclause/contracts'
import {
  createBundle,
  createProjectRecord,
  lockSourceProject,
  recordAudit,
  setFlag,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeOrganization,
  makeProject,
  makeProjectPack,
  makeSource,
  makeSourceState
} from '@skyclause/db/test/factories/index'
import { asLogin, expectOneAudit } from '@skyclause/db/test/harness/index'
import { bundleScene, callDraft, runOf, windowOf } from '@skyclause/db/test/bundles/scene'
import { sql } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import * as api from '../src'
import { apiRequest, asSession, createTestApi, testCan, testDeps, testOrg } from './harness'

const ORG = 'source-pack-settings'
const orgId = testOrg(ORG).id
const now = new Date('2026-11-05T13:13:00Z')
const principal = { ...asSession({ org: ORG, role: 'admin' }), orgId, role: 'admin' as const }
const access = { now, can: testCan }
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now }) })
const patch = (projectId: string, body: object, pack: Pack = 'crowd') =>
  apiRequest(v1, {
    as: principal,
    org: ORG,
    method: 'PATCH',
    path: `/v1/projects/${projectId}/packs/${pack}`,
    body
  })
const remove = (projectId: string, sourceId: string) =>
  apiRequest(v1, {
    as: principal,
    org: ORG,
    method: 'DELETE',
    path: `/v1/projects/${projectId}/sources/${sourceId}`
  })
const flag = (enabled: boolean) => setFlag({ key: 'pack_crowd', enabled, orgId })
async function scene(enabled = false) {
  return tenant(async (tx) => {
    const project = await makeProject(tx)
    await makeProjectPack(tx, { projectId: project.id, pack: 'crowd', enabled })
    await makeProjectPack(tx, { projectId: project.id, pack: 'sky', enabled: false })
    return project
  })
}
async function bind(projectId: string, kind: 'rapidrail_od' | 'golive' | 'wikipedia' | 'apims', error = false) {
  const source = await withSystem('source-pack-test', async (tx) => {
    const source = await makeSource(tx, { kind })
    if (error) await makeSourceState(tx, { sourceId: source.id, state: 'error', httpStatus: 503 })
    return source
  })
  await tenant((tx) => api.bindSource({ tx, principal }, { projectId, sourceId: source.id }, access))
  return source
}
async function counts(projectId: string) {
  return asLogin('postgres', async (client) => {
    const values = []
    for (const table of ['project_source', 'audit_event', 'domain_event', 'clause_sheet']) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE project_id=$1`, [projectId])
      values.push(rows[0].n)
    }
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM sheet_version v JOIN clause_sheet s ON s.id=v.sheet_id WHERE s.project_id=$1',
      [projectId]
    )
    values.push(rows[0].n)
    return values
  })
}

beforeAll(async () => {
  await makeOrganization({ id: orgId, slug: ORG })
  await flag(true)
})

describe('pack settings', () => {
  test.each(['HTTP', 'direct'] as const)(
    'sla_storage_range %s rejects overflow without effects and persists int32 max',
    async (via) => {
      const project = await scene()
      const packs = () =>
        asLogin('postgres', async (client) => {
          const { rows } = await client.query(
            'SELECT id,pack,enabled,sla_s,updated_at FROM project_pack WHERE project_id=$1 ORDER BY pack',
            [project.id]
          )
          return rows
        })
      const beforePacks = await packs()
      const beforeCounts = await counts(project.id)
      const settings = { enabled: true, sla_s: 2147483648 }
      if (via === 'HTTP') {
        const response = await patch(project.id, settings, 'sky')
        expect(response.status).toBe(422)
        expect(await response.json()).toMatchObject({ type: expect.stringContaining('validation-failed') })
      } else {
        await expect(
          tenant((tx) =>
            api.updateProjectPack({ tx, principal }, { projectId: project.id, pack: 'sky', ...settings }, access)
          )
        ).rejects.toMatchObject({ status: 422, slug: 'validation-failed' })
      }
      expect(await packs()).toEqual(beforePacks)
      expect(await counts(project.id)).toEqual(beforeCounts)
      const maximum = { enabled: true, sla_s: 2147483647 }
      if (via === 'HTTP') {
        const response = await patch(project.id, maximum, 'sky')
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ pack: 'sky', ...maximum })
      } else {
        expect(
          await tenant((tx) =>
            api.updateProjectPack({ tx, principal }, { projectId: project.id, pack: 'sky', ...maximum }, access)
          )
        ).toMatchObject({ pack: 'sky', ...maximum })
      }
      expect((await packs()).find((p) => p.pack === 'sky')).toMatchObject(maximum)
      expect(await counts(project.id)).toEqual([
        beforeCounts[0],
        beforeCounts[1]! + 1,
        beforeCounts[2],
        beforeCounts[3],
        beforeCounts[4]
      ])
    }
  )

  test('crowd_missing_roles is ordered and erroring-but-bound roles permit enabling', async () => {
    const project = await scene()
    const missing = async (roles: string[]) => {
      const response = await patch(project.id, { enabled: true })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        type: expect.stringContaining('pack-prerequisites'),
        missing: roles
      })
    }
    await missing(['rail_station', 'venue_listings'])
    await bind(project.id, 'golive', true)
    await missing(['rail_station'])
    await bind(project.id, 'rapidrail_od', true)
    expect((await patch(project.id, { enabled: true })).status).toBe(200)
    const railOnly = await scene()
    await bind(railOnly.id, 'rapidrail_od')
    const response = await patch(railOnly.id, { enabled: true })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ missing: ['venue_listings'] })
    expect((await patch(project.id, { enabled: true }, 'sky')).status).toBe(200)
  })

  test('crowd_feature_flag precedes missing roles; flag-off disable and SLA-only are allowed', async () => {
    await flag(false)
    try {
      const project = await scene()
      const before = await counts(project.id)
      const response = await patch(project.id, { enabled: true })
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ type: expect.stringContaining('feature-off') })
      expect(await counts(project.id)).toEqual(before)
      expect((await patch(project.id, { enabled: false })).status).toBe(200)
      expect((await patch(project.id, { sla_s: 1234 })).status).toBe(200)
      const enabled = await scene(true)
      const enabledNoOp = await patch(enabled.id, { enabled: true })
      expect(enabledNoOp.status).toBe(403)
      expect(await enabledNoOp.json()).toMatchObject({ type: expect.stringContaining('feature-off') })
      expect((await patch(enabled.id, { sla_s: 4321 })).status).toBe(200)
      expect((await patch(enabled.id, { enabled: false })).status).toBe(200)
      expect((await patch(enabled.id, { enabled: true }, 'sky')).status).toBe(200)
    } finally {
      await flag(true)
    }
  })

  test('last_required_role_removal preserves effects; redundant and unrelated removal succeeds', async () => {
    const project = await scene()
    const rail = await bind(project.id, 'rapidrail_od')
    const venue = await bind(project.id, 'golive')
    const extraVenue = await bind(project.id, 'wikipedia')
    const unrelated = await bind(project.id, 'apims')
    expect((await patch(project.id, { enabled: true })).status).toBe(200)
    const before = await counts(project.id)
    const response = await remove(project.id, rail.id)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ missing: ['rail_station'] })
    expect(await counts(project.id)).toEqual(before)
    expect((await remove(project.id, venue.id)).status).toBe(204)
    expect((await remove(project.id, extraVenue.id)).status).toBe(409)
    expect((await remove(project.id, unrelated.id)).status).toBe(204)
    expect((await patch(project.id, { enabled: false })).status).toBe(200)
    expect((await remove(project.id, rail.id)).status).toBe(204)
  })

  test('pack_disable_and_noop and single audit precedence preserve sheets and settings', async () => {
    const project = await tenant((tx) =>
      createProjectRecord(
        tx,
        {
          name: 'Pack test',
          slug: `pack-${randomUUID().slice(0, 8)}`,
          siteName: 'Site',
          siteLat: 3,
          siteLon: 101,
          packs: ['sky']
        },
        now
      )
    )
    const id = project.project.id
    const original = project.packs.find((p) => p.pack === 'sky')!
    const schedule = { at: ['08:00'], tz: 'Asia/Kuala_Lumpur' }
    await asLogin('postgres', (client) =>
      client.query('UPDATE project_pack SET schedule=$1 WHERE id=$2', [schedule, original.id])
    )
    const initial = await counts(id)
    expect((await patch(id, { enabled: true }, 'sky')).status).toBe(200)
    expect(await counts(id)).toEqual(initial)
    const sla = await patch(id, { sla_s: 900 }, 'sky')
    expect(sla.status).toBe(200)
    expect(await sla.json()).toEqual({ pack: 'sky', enabled: true, sla_s: 900, sheet_id: original.sheetId, schedule })
    expect(await expectOneAudit('sla.changed', { projectId: id })).toMatchObject({
      before: { enabled: true, sla_s: 600 },
      after: { enabled: true, sla_s: 900 }
    })
    expect((await patch(id, { enabled: false }, 'sky')).status).toBe(200)
    expect(await expectOneAudit('pack.updated', { projectId: id })).toMatchObject({
      before: { enabled: true, sla_s: 900 },
      after: { enabled: false, sla_s: 900 }
    })
    const before = await counts(id)
    expect((await patch(id, { enabled: true, sla_s: 1200 }, 'sky')).status).toBe(200)
    const after = await counts(id)
    expect(after).toEqual([before[0], before[1]! + 1, before[2], before[3], before[4]])
    const audits = await asLogin('postgres', (client) =>
      client.query('SELECT action, before, after FROM audit_event WHERE project_id=$1 ORDER BY at,id', [id])
    )
    expect(audits.rows.filter((r) => r.action === 'pack.updated')).toHaveLength(1)
    expect(audits.rows).toContainEqual({
      action: 'sla.changed',
      before: { pack: 'sky', enabled: false, sla_s: 900 },
      after: { pack: 'sky', enabled: true, sla_s: 1200 }
    })
    for (const invalid of [{}, { sla_s: 0 }, { sla_s: 1.5 }]) expect((await patch(id, invalid)).status).toBe(422)
    expect((await patch(randomUUID(), { enabled: false })).status).toBe(404)
    const withoutPack = await tenant((tx) => makeProject(tx))
    expect((await patch(withoutPack.id, { enabled: false })).status).toBe(404)
    const noOp = await counts(id)
    expect((await patch(id, { enabled: true, sla_s: 1200 }, 'sky')).status).toBe(200)
    expect(await counts(id)).toEqual(noOp)
  })

  test.each(['sky', 'crowd'] as const)(
    'sla_before_after_and_future_draft %s uses real #150 seam and null defaults',
    async (pack) => {
      const s = await tenant((tx) => bundleScene(tx, { pack, slaS: 300 }))
      const draft = (at: Date) =>
        tenant(async (tx) => {
          const w = await windowOf(tx, s, new Date('2026-11-06T14:00:00Z'), new Date('2026-11-06T15:00:00Z'))
          const run = await runOf(tx, s, at)
          return createBundle(tx, {
            runId: run.id,
            pack,
            draftOnly: false,
            triggeredAt: at,
            now: at,
            calls: [callDraft({ windowId: w.id, mode: pack === 'sky' ? 'commute_disruption' : 'surge_night' })]
          })
        })
      const earlier = await draft(now)
      expect(earlier.slaDueAt).toEqual(new Date(now.getTime() + 300_000))
      expect((await patch(s.projectId, { sla_s: 1234 }, pack)).status).toBe(200)
      const laterAt = new Date(now.getTime() + 60_000)
      const later = await draft(laterAt)
      expect(later.slaDueAt).toEqual(new Date(laterAt.getTime() + 1_234_000))
      const reset = await patch(s.projectId, { sla_s: null }, pack)
      expect(reset.status).toBe(200)
      expect(await reset.json()).toMatchObject({ sla_s: null })
      const resetAt = new Date(now.getTime() + 120_000)
      const resetDraft = await draft(resetAt)
      expect(resetDraft.slaDueAt).toEqual(new Date(resetAt.getTime() + (pack === 'sky' ? 600 : 7200) * 1000))
      const rows = await asLogin('postgres', (client) =>
        client.query('SELECT sla_due_at FROM bundle WHERE id=ANY($1::uuid[]) ORDER BY created_at', [
          [earlier.bundleId, later.bundleId]
        ])
      )
      expect(rows.rows.map((r) => r.sla_due_at)).toEqual([earlier.slaDueAt, later.slaDueAt])
    }
  )
})

// A gate holds the first real transaction only until pg_blocking_pids proves the second waits on it.
// No timed sleep or process-local mutex supplies the invariant being tested.
async function serializedRace(
  projectId: string,
  first: (tx: Tx) => Promise<unknown>,
  second: (tx: Tx) => Promise<unknown>
) {
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  let started!: (pid: number) => void
  const ready = new Promise<number>((r) => {
    started = r
  })
  const firstTx = tenant(async (tx) => {
    await lockSourceProject(tx, projectId)
    const result = await first(tx)
    const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    started(rows[0]!.pid)
    await gate
    return result
  })
  const pid = await Promise.race([
    ready,
    firstTx.then(() => {
      throw new Error('first transaction never reached gate')
    })
  ])
  const secondTx = tenant(second)
  // Attach rejection handling now so a missing lock implementation cannot cause an unhandled rejection.
  const settledSecond = secondTx.then(
    () => ({ ok: true }),
    (error: unknown) => ({ ok: false, error })
  )
  let waiting = false
  try {
    await asLogin('postgres', async (client) => {
      const deadline = Date.now() + 5000
      do {
        const { rows } = await client.query(
          'SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) AS waiting',
          [pid]
        )
        waiting = rows[0].waiting
      } while (!waiting && Date.now() < deadline)
    })
  } finally {
    release()
  }
  const results = await Promise.all([firstTx.then(() => ({ ok: true })), settledSecond])
  expect(waiting).toBe(true)
  expect(results.filter((r) => r.ok)).toHaveLength(1)
  expect(results[1]).toMatchObject({ ok: false, error: { status: 409 } })
  return asLogin('postgres', (client) =>
    client.query(
      `SELECT p.enabled, array_agg(s.role::text) AS roles FROM project_pack p LEFT JOIN project_source s ON s.project_id=p.project_id WHERE p.project_id=$1 AND p.pack='crowd' GROUP BY p.enabled`,
      [projectId]
    )
  )
}

describe('pack concurrency', () => {
  test('concurrent_remove_enable: two last-role removals retain one required binding', async () => {
    const project = await scene()
    const [a, b] = [await bind(project.id, 'rapidrail_od'), await bind(project.id, 'rapidrail_od')]
    await bind(project.id, 'golive')
    expect((await patch(project.id, { enabled: true })).status).toBe(200)
    const unbind = (sourceId: string) => (tx: Tx) =>
      api.unbindSource({ tx, principal }, { projectId: project.id, sourceId }, access)
    const final = await serializedRace(project.id, unbind(a.id), unbind(b.id))
    expect(final.rows[0]).toMatchObject({
      enabled: true,
      roles: expect.arrayContaining(['rail_station', 'venue_listings'])
    })
  })
  test.each(['enable', 'remove'] as const)('concurrent_remove_enable: %s first', async (first) => {
    const project = await scene()
    const rail = await bind(project.id, 'rapidrail_od')
    await bind(project.id, 'golive')
    const enable = (tx: Tx) =>
      api.updateProjectPack({ tx, principal }, { projectId: project.id, pack: 'crowd', enabled: true }, access)
    const unbind = (tx: Tx) => api.unbindSource({ tx, principal }, { projectId: project.id, sourceId: rail.id }, access)
    const final = await serializedRace(
      project.id,
      first === 'enable' ? enable : unbind,
      first === 'enable' ? unbind : enable
    )
    if (final.rows[0].enabled)
      expect(final.rows[0].roles).toEqual(expect.arrayContaining(['rail_station', 'venue_listings']))
    else expect(final.rows[0].roles).not.toContain('rail_station')
  })
})
