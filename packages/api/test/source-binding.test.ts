import { randomUUID } from 'node:crypto'
import { REGISTRY, type Principal } from '@skyclause/contracts'
import { recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeOrganization,
  makeProject,
  makeReading,
  makeSource,
  makeSourceState
} from '@skyclause/db/test/factories/index'
import { capturedCa16w } from '@skyclause/db/test/source-binding-capture'
import { beforeAll, describe, expect, test } from 'vitest'
import * as api from '../src'
import {
  apiRequest,
  asDevice,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
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
