import { randomUUID } from 'node:crypto'
import { REGISTRY, type Principal } from '@skyclause/contracts'
import { recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectPack,
  makeReading,
  makeSource,
  makeSourceState
} from '@skyclause/db/test/factories/index'
import { capturedCa16w } from '@skyclause/db/test/source-binding-capture'
import { beforeAll, describe, expect, test } from 'vitest'
import { vi } from 'vitest'
import * as db from '@skyclause/db'
import { asLogin, expectOneAudit, expectEvent } from '@skyclause/db/test/harness/index'
import * as api from '../src'
import {
  apiRequest,
  asDevice,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'source-binding-home'
const OTHER = 'source-binding-other'
const now = new Date('2026-11-05T13:13:00Z')
const viewer = asSession({ org: ORG, role: 'viewer' })
const deps = testDeps({ withTenant, recordAudit, now: () => now })
const { v1 } = createTestApi({ deps })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(ORG).id, principal: { ...viewer, orgId: testOrg(ORG).id, role: 'viewer' } }, fn)
const request = (query: Record<string, string> = {}, as: Principal = viewer, org = ORG) =>
  apiRequest(v1, { as, org, method: 'GET', path: '/v1/catalogue/sources', query })
const body = async (query: Record<string, string> = {}, as: Principal = viewer) => {
  const response = await request(query, as)
  expect(response.status).toBe(200)
  return (await response.json()) as { data: api.CatalogueSourceView[]; next_cursor: string | null }
}

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

const admin = { ...asSession({ org: ORG, role: 'admin' }), orgId: testOrg(ORG).id, role: 'admin' as const }
const access = { now, can: testCan }
const adminTenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: admin }, fn)
const bindRequest = (projectId: string, sourceId: string, key = randomUUID(), extra = {}) =>
  apiRequest(v1, {
    as: admin,
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${projectId}/sources`,
    body: { source_id: sourceId, ...extra },
    idempotencyKey: key
  })
const unbindRequest = (projectId: string, sourceId: string) =>
  apiRequest(v1, {
    as: admin,
    org: ORG,
    method: 'DELETE',
    path: `/v1/projects/${projectId}/sources/${sourceId}`
  })
async function effectCounts(projectId: string) {
  return asLogin('postgres', async (client) => {
    const counts = []
    for (const table of ['project_source', 'audit_event', 'domain_event', 'analytics_event']) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE project_id=$1`, [
        projectId
      ])
      counts.push(rows[0].count)
    }
    return counts
  })
}
const newPublic = (overrides = {}) => withSystem('binding-test', (tx) => makeSource(tx, overrides))

describe('binding', () => {
  test('cross_org_harness hides foreign source operations without effects', async () => {
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...admin, orgId: testOrg(OTHER).id } },
      async (tx) => {
        const project = await makeProject(tx)
        await makeProjectPack(tx, { projectId: project.id, pack: 'sky', enabled: true })
        return project
      }
    )
    const source = await newPublic()
    const before = await effectCounts(foreign.id)
    const cases = [
      crossOrgCase('listCatalogueSources', { app: v1, as: viewer, org: OTHER, params: {} }),
      crossOrgCase('bindSource', {
        app: v1,
        as: admin,
        org: ORG,
        params: { id: foreign.id },
        body: { source_id: source.id }
      }),
      crossOrgCase('unbindSource', {
        app: v1,
        as: admin,
        org: ORG,
        params: { id: foreign.id, sourceId: source.id }
      }),
      crossOrgCase('updateProjectPack', {
        app: v1,
        as: admin,
        org: ORG,
        params: { id: foreign.id, pack: 'sky' },
        body: { enabled: false }
      })
    ]
    for (const item of cases) await item.run()
    expect(await effectCounts(foreign.id)).toEqual(before)
  })
  test.each([
    ['jps_rain', 'rain_gauge'],
    ['apims', 'api_station'],
    ['met_warning', 'warnings'],
    ['met_forecast', 'met_forecast'],
    ['rapidrail_od', 'rail_station'],
    ['golive', 'venue_listings'],
    ['wikipedia', 'venue_listings'],
    ['gtfs_rt', 'bus_feed'],
    ['gtfs_static', 'gtfs_static'],
    ['camera', 'camera'],
    ['pi', 'pi']
  ] as const)('kind_role_map %s => %s ignores caller role', async (kind, role) => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source =
      kind === 'camera' || kind === 'pi'
        ? await adminTenant((tx) => makeSource(tx, { kind, meta: { project_id: project.id } }))
        : await newPublic({ kind })
    const response = await bindRequest(project.id, source.id, randomUUID(), { role: 'camera' })
    expect(response.status).toBe(201)
    const view = await response.json()
    expect(view).toMatchObject({
      id: source.id,
      role,
      project_id: project.id,
      state: null,
      latest_reading: null,
      age_s: null,
      recent_errors: []
    })
    const route = REGISTRY.find((r) => r.operationId === 'bindSource')!
    if (route.operationId === 'bindSource')
      expect(route.responses[201].content['application/json'].schema.safeParse(view).success).toBe(true)
    expect(await effectCounts(project.id)).toEqual([1, 1, 1, 1])
  })

  test('bind_error_or_unmaterialized returns actual persisted state and reading', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await withSystem('binding-test', async (tx) => {
      const source = await makeSource(tx, { lat: null, lon: null })
      await makeSourceState(tx, { sourceId: source.id, state: 'error', httpStatus: 503 })
      await makeReading(tx, { sourceId: source.id, observedAt: new Date('2026-11-05T13:00:00Z'), value: 67 })
      await makePoll(tx, { sourceId: source.id, outcome: 'error', httpStatus: 503 })
      return source
    })
    const response = await bindRequest(project.id, source.id)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      state: { state: 'error', http_status: 503 },
      latest_reading: { value: 67 },
      age_s: 780,
      lat: null,
      lon: null,
      recent_errors: [{ source_id: source.id, outcome: 'error', http_status: 503 }]
    })
  })

  test('bind_replay_and_new_key_retry and bind_unbind_one_audit_event', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await newPublic({ kind: 'apims', cadenceS: 900 })
    const key = randomUUID()
    const first = await bindRequest(project.id, source.id, key)
    expect(first.status).toBe(201)
    const text = await first.text()
    const replay = await bindRequest(project.id, source.id, key)
    expect(replay.status).toBe(201)
    expect(await replay.text()).toBe(text)
    expect((await bindRequest(project.id, source.id)).status).toBe(201)
    const changed = await bindRequest(project.id, randomUUID(), key)
    expect(changed.status).toBe(422)
    expect(((await changed.json()) as { type: string }).type).toContain('idempotency-mismatch')
    expect(await effectCounts(project.id)).toEqual([1, 1, 1, 1])
    expect(await expectOneAudit('source.bound', { projectId: project.id })).toMatchObject({
      target_type: 'source',
      target_id: source.id,
      before: null,
      after: { source_id: source.id, role: 'api_station' }
    })
    expect(await expectEvent('source.bound', { projectId: project.id })).toMatchObject({
      data: { source_id: source.id, role: 'api_station' }
    })
    const analytics = await asLogin('postgres', (client) =>
      client.query('SELECT name,props FROM analytics_event WHERE project_id=$1', [project.id])
    )
    expect(analytics.rows).toEqual([{ name: 'source_bound', props: { adapter: 'apims', cadence_min: 15 } }])
    expect((await unbindRequest(project.id, source.id)).status).toBe(204)
    expect((await unbindRequest(project.id, source.id)).status).toBe(204)
    expect(await effectCounts(project.id)).toEqual([0, 2, 2, 1])
    expect(await expectOneAudit('source.unbound', { projectId: project.id })).toMatchObject({
      before: { source_id: source.id, role: 'api_station' },
      after: null
    })
    await expectEvent('source.unbound', { projectId: project.id })
    expect((await unbindRequest(project.id, randomUUID())).status).toBe(404)
  })

  test('commit then response-store failure and new-key retry causes one change', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await newPublic()
    const spy = vi.spyOn(deps.idempotency, 'complete').mockRejectedValueOnce(new Error('response store unavailable'))
    try {
      expect((await bindRequest(project.id, source.id)).status).toBe(500)
      expect((await bindRequest(project.id, source.id)).status).toBe(201)
      expect(await effectCounts(project.id)).toEqual([1, 1, 1, 1])
    } finally {
      spy.mockRestore()
    }
  })

  test('ownership_survives_unbind and unavailable devices have zero effects', async () => {
    const [a, b] = await adminTenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const source = await adminTenant((tx) => makeSource(tx, { kind: 'camera', meta: { project_id: a.id } }))
    expect((await bindRequest(a.id, source.id)).status).toBe(201)
    expect((await unbindRequest(a.id, source.id)).status).toBe(204)
    expect((await bindRequest(b.id, source.id)).status).toBe(404)
    for (const meta of [{}, { project_id: 'bad' }, { project_id: 42 }, { project_id: randomUUID() }]) {
      const invalid = await adminTenant((tx) => makeSource(tx, { kind: 'pi', meta }))
      expect((await bindRequest(b.id, invalid.id)).status).toBe(404)
      expect((await unbindRequest(b.id, invalid.id)).status).toBe(404)
    }
    for (const kind of ['camera', 'pi'] as const) {
      const ownerless = await newPublic({ kind, meta: { project_id: b.id } })
      expect((await bindRequest(b.id, ownerless.id)).status).toBe(404)
    }
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...admin, orgId: testOrg(OTHER).id } },
      async (tx) => {
        const project = await makeProject(tx)
        return { project, source: await makeSource(tx, { kind: 'camera', meta: { project_id: project.id } }) }
      }
    )
    expect((await bindRequest(b.id, foreign.source.id)).status).toBe(404)
    expect((await bindRequest(foreign.project.id, source.id)).status).toBe(404)
    expect((await bindRequest(randomUUID(), source.id)).status).toBe(404)
    expect(await effectCounts(b.id)).toEqual([0, 0, 0, 0])
  })

  test.each([
    ['camera', false],
    ['camera', true],
    ['pi', false],
    ['pi', true]
  ] as const)(
    'private_cross_project_binding %s with owner binding=%s fails without effects',
    async (kind, ownerBound) => {
      const [a, b] = await adminTenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
      const source = await adminTenant(async (tx) => {
        const source = await makeSource(tx, { kind, meta: { project_id: a.id } })
        for (const projectId of ownerBound ? [a.id, b.id] : [b.id])
          await tx
            .insert(db.projectSource)
            .values({ orgId: testOrg(ORG).id, projectId, sourceId: source.id, role: kind })
        return source
      })
      const bindings = await adminTenant((tx) => db.sourceBindings(tx, source.id))
      const before = [await effectCounts(a.id), await effectCounts(b.id)]
      expect((await bindRequest(a.id, source.id)).status).toBe(404)
      expect([await effectCounts(a.id), await effectCounts(b.id)]).toEqual(before)
      const after = await adminTenant((tx) => db.sourceBindings(tx, source.id))
      expect(after.sort((x, y) => x.id.localeCompare(y.id))).toEqual(bindings.sort((x, y) => x.id.localeCompare(y.id)))
      const unchanged = await adminTenant((tx) => db.visibleBindingSource(tx, source.id))
      expect(unchanged).toEqual(source)
    }
  )

  test.each(['caller', 'recordAudit', 'emitEvent', 'track'] as const)(
    'transaction_rollback on %s failure',
    async (failure) => {
      const project = await adminTenant((tx) => makeProject(tx))
      const source = await newPublic()
      const published: string[] = []
      db.setEventPublisher(async ({ event_id }) => {
        published.push(event_id)
      })
      const spy =
        failure === 'caller' ? null : vi.spyOn(db, failure).mockRejectedValueOnce(new Error('injected failure'))
      try {
        await expect(
          adminTenant(async (tx) => {
            await api.bindSource({ tx, principal: admin }, { projectId: project.id, sourceId: source.id }, access)
            throw new Error('caller rollback')
          })
        ).rejects.toThrow(failure === 'caller' ? 'caller rollback' : 'injected failure')
        expect(await effectCounts(project.id)).toEqual([0, 0, 0, 0])
        expect(published).toEqual([])
      } finally {
        spy?.mockRestore()
        db.setEventPublisher(null)
      }
    }
  )

  test('system_provisioning_rerun stays in caller transaction with no HTTP key', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await newPublic()
    const principal = db.systemPrincipal('provision-binding-test')
    await db.shareSystemConnection(() =>
      withTenant({ orgId: testOrg(ORG).id, principal }, async (tx) => {
        const input = { projectId: project.id, sourceId: source.id }
        const first = await api.bindSource({ tx, principal }, input, { now, can: () => false })
        expect(await api.bindSource({ tx, principal }, input, { now, can: () => false })).toEqual(first)
      })
    )
    expect(await effectCounts(project.id)).toEqual([1, 1, 1, 1])
  })

  test('conflicting historic role fails closed without mutation', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await newPublic()
    await adminTenant((tx) =>
      tx
        .insert(db.projectSource)
        .values({ orgId: testOrg(ORG).id, projectId: project.id, sourceId: source.id, role: 'camera' })
    )
    expect((await bindRequest(project.id, source.id)).status).toBe(422)
    expect((await unbindRequest(project.id, source.id)).status).toBe(422)
    expect(await effectCounts(project.id)).toEqual([1, 0, 0, 0])
  })

  test('public multi-project binding publishes only after commit and absent DELETE has no effects', async () => {
    const [a, b, empty] = await adminTenant(async (tx) => [
      await makeProject(tx),
      await makeProject(tx),
      await makeProject(tx)
    ])
    const source = await newPublic()
    expect((await unbindRequest(empty.id, source.id)).status).toBe(204)
    expect(await effectCounts(empty.id)).toEqual([0, 0, 0, 0])
    const published: string[] = []
    db.setEventPublisher(async ({ event_id }) => {
      published.push(event_id)
    })
    try {
      await adminTenant(async (tx) => {
        await api.bindSource({ tx, principal: admin }, { projectId: a.id, sourceId: source.id }, access)
        expect(published).toEqual([])
      })
      expect(published).toHaveLength(1)
      expect((await bindRequest(b.id, source.id)).status).toBe(201)
      expect((await bindRequest(a.id, source.id)).status).toBe(201)
      expect(published).toHaveLength(2)
      const event = await expectEvent('source.bound', { projectId: a.id })
      expect(published).toContain(event.id)
      expect(event.published_at).not.toBeNull()
      expect(await effectCounts(a.id)).toEqual([1, 1, 1, 1])
      expect(await effectCounts(b.id)).toEqual([1, 1, 1, 1])
    } finally {
      db.setEventPublisher(null)
    }
  })

  test('unbind caller rollback preserves binding and produces no effects or publish', async () => {
    const project = await adminTenant((tx) => makeProject(tx))
    const source = await newPublic()
    expect((await bindRequest(project.id, source.id)).status).toBe(201)
    const published: string[] = []
    db.setEventPublisher(async ({ event_id }) => {
      published.push(event_id)
    })
    try {
      await expect(
        adminTenant(async (tx) => {
          await api.unbindSource({ tx, principal: admin }, { projectId: project.id, sourceId: source.id }, access)
          throw new Error('rollback unbind')
        })
      ).rejects.toThrow('rollback unbind')
      expect(await effectCounts(project.id)).toEqual([1, 1, 1, 1])
      expect(published).toEqual([])
    } finally {
      db.setEventPublisher(null)
    }
  })
})

describe('catalogue', () => {
  test('real_capture_distance_and_age', async () => {
    const capture = capturedCa16w()
    await withSystem('catalogue-api-test', async (tx) => {
      const source = await makeSource(tx, capture)
      await makeReading(tx, {
        sourceId: source.id,
        metric: 'api',
        unit: null,
        observedAt: capture.observedAt,
        receivedAt: capture.observedAt,
        value: capture.value
      })
      await makeSourceState(tx, { sourceId: source.id, state: 'error', httpStatus: 503, since: now })
    })
    const result = await body({ kind: 'apims', q: 'CA16W', near: '3.0559,101.6997' })
    const ca16w = result.data[0]!
    expect(ca16w.distance_km).toBeGreaterThanOrEqual(5.6)
    expect(ca16w.distance_km).toBeLessThanOrEqual(6.2)
    expect(ca16w.latest_reading?.value).toBe(67)
    expect(ca16w.age_s).toBe(780)
    expect(ca16w.source_state?.state).toBe('error')
    expect(ca16w.latest_reading).toMatchObject({
      unit: null,
      poll_id: null,
      revision: '0',
      observed_at: '2026-11-05T13:00:00Z'
    })
    expect(ca16w).not.toHaveProperty('meta')
    const route = REGISTRY.find((r) => r.operationId === 'listCatalogueSources')!
    if (route.operationId === 'listCatalogueSources')
      expect(route.responses[200].content['application/json'].schema.safeParse(result).success).toBe(true)
  })

  test('null_coordinate_state_reading', async () => {
    const q = randomUUID()
    await withSystem('catalogue-api-test', (tx) =>
      makeSource(tx, { name: q, licenceId: null, licenceLabel: 'stored unpublished label', lat: null, lon: null })
    )
    const [noTerms] = (await body({ q, near: '3.0559,101.6997' })).data
    expect(noTerms?.distance_km).toBeNull()
    expect(noTerms?.source_state).toBeNull()
    expect(noTerms?.latest_reading).toBeNull()
    expect(noTerms?.age_s).toBeNull()
    expect(noTerms?.licence_id).toBeNull()
    expect(noTerms?.licence_label).toBe('no published terms')
    expect(await body({ q: randomUUID() })).toEqual({ data: [], next_cursor: null })
  })

  test('literal_name_station_search', async () => {
    const tag = randomUUID()
    const source = await withSystem('catalogue-api-test', async (tx) => {
      await makeSource(tx, { name: `${tag} other` })
      return makeSource(tx, { name: `${tag} 100%_\\`, externalId: `station-${tag}` })
    })
    for (const q of ['%', '_', '\\', `  STATION-${tag}  `])
      expect((await body({ q })).data.map((row) => row.id)).toEqual([source.id])
  })

  test('distance_ties_cursor_filters', async () => {
    const q = randomUUID()
    const rows = await withSystem('catalogue-api-test', async (tx) => {
      const rows = []
      for (const located of [true, true, false, false])
        rows.push(await makeSource(tx, { name: q, lat: located ? 3 : null, lon: located ? 101 : null }))
      return rows
    })
    const query = { q, near: '3,101', limit: '1' }
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const result = await body({ ...query, ...(cursor ? { cursor } : {}) })
      seen.push(...result.data.map((r) => r.id))
      cursor = result.next_cursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(
      rows
        .sort((a, b) => Number(a.lat === null) - Number(b.lat === null) || a.id.localeCompare(b.id))
        .map((row) => row.id)
    )
    const first = await body(query)
    for (const patch of [{ q: 'other' }, { near: '4,101' }, { kind: 'apims' }, { near: '' }] as Record<
      string,
      string
    >[]) {
      expect((await request({ ...query, ...patch, cursor: first.next_cursor! })).status).toBe(422)
    }
    // Equivalent normalized filters may use a different page size.
    expect(
      (await request({ ...query, q: ` ${q} `, near: '3.0,101.0', limit: '2', cursor: first.next_cursor! })).status
    ).toBe(200)
  })

  test('device_owner_scope', async () => {
    const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const q = randomUUID()
    const sources = await tenant(async (tx) => {
      const sources = []
      for (const project of [a, b]) {
        const src = await makeSource(tx, {
          kind: 'camera',
          name: q,
          meta: { project_id: project.id, secret: project.id }
        })
        await makeReading(tx, { sourceId: src.id, valueJson: { private: project.id } })
        sources.push(src)
      }
      await makeSource(tx, { kind: 'pi', name: q, meta: {} })
      return sources
    })
    const publicSource = await withSystem('catalogue-api-test', (tx) => makeSource(tx, { name: q }))
    for (const principal of [
      asOAuth({ org: ORG, role: 'viewer', projectIds: [a.id] }),
      asShareLink({ org: ORG, projectId: a.id, access: 'reviewer' })
    ]) {
      const result = await body({ q }, principal)
      expect(result.data.map((row) => row.id).sort()).toEqual([sources[0]!.id, publicSource.id].sort())
      expect(JSON.stringify(result)).not.toContain(b.id)
    }
    expect((await body({ q })).data).toHaveLength(3)
  })

  test('invalid_query', async () => {
    for (const near of ['3', ',101', '3,', 'NaN,101', 'Infinity,101', '91,101', '3,181', '3,101,1', ' ,101', ''])
      expect((await request({ near })).status).toBe(422)
    for (const query of [{ kind: 'wrong' }, { cursor: 'bad' }, { limit: '0' }, { limit: '201' }] as Record<
      string,
      string
    >[])
      expect((await request(query)).status).toBe(422)
    const cursor = (distance_km: unknown) =>
      api.encodeCursor({ v: 1, filter_hash: 'bad', distance_km, id: randomUUID() })
    for (const distance of [-1, '0', null, 1e300])
      expect((await request({ cursor: cursor(distance) })).status).toBe(422)
  })

  test('catalogue_permissions', async () => {
    expect((await request()).status).toBe(200)
    expect((await request({}, asDevice({ org: ORG }))).status).toBe(403)
    expect((await request({}, viewer, OTHER)).status).toBe(404)
    await tenant(async (tx) => {
      await expect(
        api.listCatalogueSources(
          { tx, principal: { ...viewer, orgId: testOrg(ORG).id, role: 'viewer' } },
          { limit: 50 },
          { now, can: () => false }
        )
      ).rejects.toMatchObject({ status: 403 })
      const result = await api.listCatalogueSources(
        { tx, principal: { ...viewer, orgId: testOrg(ORG).id, role: 'viewer' } },
        { limit: 50 },
        { now, can: testCan }
      )
      expect(result.data.length).toBeGreaterThan(0)
    })
  })
})
