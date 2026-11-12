import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type Page, type Principal } from '@skyclause/contracts'
import { listProjectSources as route } from '@skyclause/contracts/api/v1/sources'
import { recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeSource,
  makeSourceState
} from '@skyclause/db/test/factories/index'
import { capturedCa16w } from '@skyclause/db/test/source-binding-capture'
import { analyticsEvent, auditEvent, domainEvent, projectSource, sourceState } from '@skyclause/db'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import * as api from '../src'
import { encodeCursor } from '../src/pagination'
import {
  apiRequest,
  asApiKey,
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

const ORG = 'project-sources-home'
const OTHER = 'project-sources-other'
const now = new Date('2026-11-12T13:13:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId: testOrg(ORG).id, role: 'viewer' as const }
const deps = testDeps({ withTenant, recordAudit, now: () => now, can: testCan })
const { v1 } = createTestApi({ deps })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: viewer }, fn)
const request = (projectId: string, query: Record<string, string> = {}, as: Principal | undefined = viewer, app = v1) =>
  apiRequest(app, { as, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/sources`, query })
const body = async (projectId: string) => {
  const response = await request(projectId)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(route.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as Page<api.ProjectSourceHealthView>
}
const project = () => tenant((tx) => makeProject(tx))
const bind = (projectId: string, sourceId: string, role: 'api_station' | 'camera' | 'met_forecast' = 'api_station') =>
  tenant((tx) => makeProjectSource(tx, { projectId, sourceId, role, createdAt: ago(1000) }))
const publicSource = (overrides = {}) =>
  withSystem('project-sources-test', (tx) => makeSource(tx, { createdAt: ago(1000), ...overrides }))
async function effects(projectId: string, sourceId?: string) {
  return withSystem('project-sources-test-effects', async (tx) => ({
    bindings: await tx
      .select()
      .from(projectSource)
      .where(eq(projectSource.projectId, projectId))
      .orderBy(projectSource.id),
    audits: await tx.select().from(auditEvent).where(eq(auditEvent.projectId, projectId)).orderBy(auditEvent.id),
    events: await tx.select().from(domainEvent).where(eq(domainEvent.projectId, projectId)).orderBy(domainEvent.id),
    analytics: await tx
      .select()
      .from(analyticsEvent)
      .where(eq(analyticsEvent.projectId, projectId))
      .orderBy(analyticsEvent.id),
    states: sourceId ? await tx.select().from(sourceState).where(eq(sourceState.sourceId, sourceId)) : []
  }))
}
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

describe('listProjectSources', () => {
  test('new empty project has a real authorized read', async () => {
    const p = await project()
    expect(await body(p.id)).toEqual({ data: [], next_cursor: null })
  })
  test('captured public source returns the complete base DTO, stored role and runtime health without effects', async () => {
    const p = await project()
    const capture = capturedCa16w()
    const src = await withSystem('project-sources-test', async (tx) => {
      const src = await makeSource(tx, {
        kind: capture.kind,
        name: capture.name,
        externalId: capture.externalId,
        lat: capture.lat,
        lon: capture.lon,
        cadenceS: 3600,
        createdAt: ago(1000),
        licenceId: null,
        licenceLabel: 'not used'
      })
      await makeReading(tx, {
        sourceId: src.id,
        observedAt: capture.observedAt,
        receivedAt: ago(100),
        metric: 'api',
        unit: 'index',
        value: capture.value
      })
      await makeSourceState(tx, { sourceId: src.id, state: 'stale', since: ago(2000), updatedAt: ago(100) })
      return src
    })
    await bind(p.id, src.id)
    const before = await effects(p.id, src.id)
    const row = (await body(p.id)).data[0]!
    expect(row).toMatchObject({
      id: src.id,
      name: capture.name,
      kind: 'apims',
      project_id: p.id,
      role: 'api_station',
      licence_label: 'no published terms',
      state: { state: 'stale', since: ago(2000).toISOString().replace('.000Z', 'Z') },
      latest_reading: { value: capture.value, observed_at: capture.observedAt.toISOString().replace('.000Z', 'Z') },
      age_s: Math.floor((now.getTime() - capture.observedAt.getTime()) / 1000),
      recent_errors: [],
      last_error: null
    })
    expect(row.history).toHaveLength(48)
    expect(row.history!.every((slot) => slot.status === 'missed')).toBe(true)
    expect(row).not.toHaveProperty('probation')
    expect(await effects(p.id, src.id)).toEqual(before)
  })
  test.each(['error', 'fresh', null] as const)(
    'stored %s state and latest normal error never expose a last-good value or invent since',
    async (state) => {
      const p = await project()
      const src = await withSystem('project-sources-test', async (tx) => {
        const src = await makeSource(tx, { createdAt: ago(1000) })
        await makeReading(tx, { sourceId: src.id, observedAt: ago(600), receivedAt: ago(590), value: 67 })
        if (state)
          await makeSourceState(tx, {
            sourceId: src.id,
            state,
            since: ago(900),
            httpStatus: state === 'error' ? 503 : null,
            updatedAt: ago(800)
          })
        await makePoll(tx, { sourceId: src.id, purpose: 'poll', startedAt: ago(700), receivedAt: ago(699) })
        await makePoll(tx, {
          sourceId: src.id,
          purpose: 'poll',
          startedAt: ago(10),
          receivedAt: ago(9),
          outcome: 'error',
          httpStatus: null,
          errorCode: 'timeout',
          message: 'Upstream timed out'
        })
        return src
      })
      await bind(p.id, src.id)
      const before = await effects(p.id, src.id)
      const row = (await body(p.id)).data[0]!
      expect(row.state).toEqual(
        state === 'error'
          ? {
              state: 'error',
              since: ago(900).toISOString().replace('.000Z', 'Z'),
              http_status: 503,
              pending_until: null
            }
          : null
      )
      expect(row.latest_reading).toBeNull()
      expect(row.age_s).toBeNull()
      expect(row.last_error).toMatchObject({
        started_at: ago(10).toISOString().replace('.000Z', 'Z'),
        http_status: null,
        message: 'Upstream timed out',
        purpose: 'poll'
      })
      expect(await effects(p.id, src.id)).toEqual(before)
    }
  )
  test('absent evaluator state remains null alongside genuine readings; future observed age is unknown', async () => {
    const p = await project()
    const src = await withSystem('project-sources-test', async (tx) => {
      const src = await makeSource(tx, { createdAt: ago(1000) })
      await makeReading(tx, { sourceId: src.id, observedAt: ago(-600), receivedAt: ago(10), value: 2 })
      return src
    })
    await bind(p.id, src.id)
    expect((await body(p.id)).data[0]).toMatchObject({
      state: null,
      latest_reading: { observed_at: ago(-600).toISOString().replace('.000Z', 'Z') },
      age_s: null,
      last_error: null
    })
  })
  test('48 rolling half-open APIMS slots preserve edges and error precedence; retained errors have actual diagnostics', async () => {
    const p = await project()
    const src = await withSystem('project-sources-test', async (tx) => {
      const src = await makeSource(tx, { kind: 'apims', cadenceS: 3600, createdAt: ago(200000) })
      for (const seconds of [48 * 3600, 47 * 3600, 3 * 3600 - 900, 2400, 1500, 600, 0]) {
        await makePoll(tx, {
          sourceId: src.id,
          purpose: 'poll',
          startedAt: ago(seconds),
          receivedAt: ago(seconds),
          outcome: 'ok'
        })
      }
      await makePoll(tx, {
        sourceId: src.id,
        purpose: 'poll',
        startedAt: ago(3 * 3600),
        receivedAt: ago(3 * 3600 - 1),
        outcome: 'error',
        httpStatus: null,
        errorCode: 'network',
        message: 'Connection reset'
      })
      return src
    })
    await bind(p.id, src.id)
    const row = (await body(p.id)).data[0]!
    expect(row.history).toHaveLength(48)
    row.history!.forEach((slot, i) =>
      expect(slot).toEqual({
        start_at: ago((48 - i) * 3600)
          .toISOString()
          .replace('.000Z', 'Z'),
        end_at: ago((47 - i) * 3600)
          .toISOString()
          .replace('.000Z', 'Z'),
        status: [0, 1, 47].includes(i) ? 'received' : i === 45 ? 'error' : 'missed'
      })
    )
    expect(row.last_error).toMatchObject({
      started_at: ago(10800).toISOString().replace('.000Z', 'Z'),
      http_status: null,
      message: 'Connection reset',
      purpose: 'poll'
    })
    expect(row.recent_errors).toHaveLength(1)
  })
  test('an outcome at exact now is excluded and persisted error does not recover on a successful poll', async () => {
    const p = await project()
    const sources = await withSystem('project-sources-test', async (tx) => {
      const edge = await makeSource(tx, { createdAt: ago(1000) })
      await makePoll(tx, { sourceId: edge.id, purpose: 'poll', startedAt: now, receivedAt: now })
      const error = await makeSource(tx, { createdAt: ago(1000) })
      await makeSourceState(tx, {
        sourceId: error.id,
        state: 'error',
        since: ago(900),
        updatedAt: ago(800),
        httpStatus: 503,
        pendingUntil: ago(-100)
      })
      await makeReading(tx, { sourceId: error.id, observedAt: ago(600), receivedAt: ago(590), value: 67 })
      await makePoll(tx, {
        sourceId: error.id,
        purpose: 'poll',
        startedAt: ago(10),
        receivedAt: ago(9),
        outcome: 'unchanged'
      })
      return { edge, error }
    })
    await bind(p.id, sources.edge.id)
    await bind(p.id, sources.error.id)
    const rows = (await body(p.id)).data
    expect(rows.find((row) => row.id === sources.edge.id)!.history!.every((slot) => slot.status === 'missed')).toBe(
      true
    )
    expect(rows.find((row) => row.id === sources.error.id)).toMatchObject({
      state: {
        state: 'error',
        since: ago(900).toISOString().replace('.000Z', 'Z'),
        pending_until: ago(-100).toISOString().replace('.000Z', 'Z')
      },
      latest_reading: null,
      age_s: null
    })
  })
  test('backfill errors retain their purpose without normal history, and backfill success cannot define polled age', async () => {
    const p = await project()
    const forecast = JSON.parse(
      readFileSync(
        new URL('../../sources/test/fixtures/weather-forecast-all-20261111T140148Z.json', import.meta.url),
        'utf8'
      )
    )[0] as { date: string; location: { location_id: string; location_name: string }; [key: string]: unknown }
    const observed = new Date(`${forecast.date}T00:00:00+08:00`)
    const src = await withSystem('project-sources-test', async (tx) => {
      const src = await makeSource(tx, {
        kind: 'met_forecast',
        externalId: forecast.location.location_id,
        name: forecast.location.location_name,
        freshness: 'polled',
        createdAt: ago(1000)
      })
      await makeReading(tx, {
        sourceId: src.id,
        observedAt: observed,
        receivedAt: ago(100),
        valueJson: forecast,
        value: null
      })
      await makePoll(tx, { sourceId: src.id, purpose: 'backfill', startedAt: ago(50), receivedAt: ago(49) })
      await makePoll(tx, {
        sourceId: src.id,
        purpose: 'backfill',
        startedAt: ago(10),
        receivedAt: ago(9),
        outcome: 'error',
        httpStatus: 502,
        message: 'Archive unavailable'
      })
      return src
    })
    await bind(p.id, src.id, 'met_forecast')
    let row = (await body(p.id)).data[0]!
    expect(row.age_s).toBeNull()
    expect(row.history!.every((slot) => slot.status === 'missed')).toBe(true)
    expect(row.last_error).toMatchObject({ purpose: 'backfill', message: 'Archive unavailable', http_status: 502 })
    await withSystem('project-sources-test', async (tx) => {
      await makePoll(tx, { sourceId: src.id, purpose: 'poll', startedAt: ago(800), receivedAt: ago(799) })
      await makePoll(tx, {
        sourceId: src.id,
        purpose: 'poll',
        startedAt: ago(300),
        receivedAt: ago(299),
        outcome: 'unchanged'
      })
    })
    row = (await body(p.id)).data[0]!
    expect(row.age_s).toBe(300)
    expect(row.latest_reading).toMatchObject({
      observed_at: observed.toISOString().replace('.000Z', 'Z'),
      value_json: forecast
    })
    expect(row.state).toBeNull()
  })
  test('injected permissions allow viewer, guest, read key, OAuth and reviewer link; resource scope remains hidden', async () => {
    const p = await project()
    const principals = [
      viewer,
      asSession({ org: ORG, role: 'guest', guest: true }),
      asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
      asOAuth({ org: ORG, role: 'viewer', projectIds: [p.id] }),
      asOAuth({ org: ORG, role: null, projectIds: [p.id], shareLinkId: randomUUID() }),
      asShareLink({ org: ORG, projectId: p.id, access: 'reviewer' })
    ]
    for (const principal of principals) expect((await request(p.id, {}, principal)).status).toBe(200)
    const scoped = [
      asOAuth({ org: ORG, role: 'viewer', projectIds: [] }),
      asShareLink({ org: ORG, projectId: randomUUID(), access: 'reviewer' })
    ]
    const testApp = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: testCan }) }).v1
    for (const principal of scoped) {
      expect((await request(p.id, {}, principal)).status).toBe(404)
      expect((await request(p.id, {}, principal, testApp)).status).toBe(404)
      await tenant(async (tx) =>
        expect(
          api.listProjectSources({ tx, principal }, { projectId: p.id, query: { limit: 50 } }, { can: testCan, now })
        ).rejects.toMatchObject({ status: 404 })
      )
    }
  })
  test('foreign project is 404; forbidden principals are uniformly 403 before lookup; anonymous is 401', async () => {
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    await crossOrgCase('listProjectSources', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
    for (const principal of [
      asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
      asOAuth({ org: ORG, role: 'viewer', projectIds: [foreign.id] }),
      asShareLink({ org: ORG, projectId: foreign.id, access: 'reviewer' })
    ]) {
      expect((await request(foreign.id, {}, principal)).status).toBe(404)
    }
    const p = await project()
    const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: () => false }) }).v1
    for (const id of [p.id, foreign.id]) {
      expect((await request(id, {}, viewer, denied)).status).toBe(403)
      expect((await request(id, {}, asDevice({ org: ORG }))).status).toBe(403)
      expect((await request(id, {}, asApiKey({ org: ORG, role: 'viewer', scopes: [] }))).status).toBe(403)
    }
    expect((await apiRequest(v1, { org: ORG, method: 'GET', path: `/v1/projects/${p.id}/sources` })).status).toBe(401)
    await tenant(async (tx) => {
      for (const projectId of [p.id, foreign.id]) {
        await expect(
          api.listProjectSources(
            { tx, principal: viewer },
            { projectId, query: { limit: 50 } },
            { now, can: () => false }
          )
        ).rejects.toMatchObject({ status: 403 })
        await expect(
          api.listProjectSources(
            { tx, principal: asDevice({ org: ORG }) },
            { projectId, query: { limit: 50 } },
            { now, can: () => true }
          )
        ).rejects.toMatchObject({ status: 403 })
      }
      await expect(
        api.listProjectSources(
          { tx, principal: { ...viewer, orgId: testOrg(OTHER).id } },
          { projectId: p.id, query: { limit: 50 } },
          { now, can: testCan }
        )
      ).rejects.toMatchObject({ status: 404 })
    })
  })
  test('private metadata and conflicting bindings never grant another project access', async () => {
    const [p, other] = await Promise.all([project(), project()])
    const visible = await tenant((tx) =>
      makeSource(tx, { kind: 'camera', meta: { project_id: p.id }, createdAt: ago(1000) })
    )
    const hidden = await tenant((tx) =>
      makeSource(tx, { kind: 'camera', meta: { project_id: other.id, secret: 'hidden' }, createdAt: ago(1000) })
    )
    const conflicting = await tenant((tx) =>
      makeSource(tx, { kind: 'camera', meta: { project_id: p.id }, createdAt: ago(1000) })
    )
    await bind(p.id, visible.id, 'camera')
    await bind(p.id, hidden.id, 'camera')
    await bind(p.id, conflicting.id, 'camera')
    await bind(other.id, conflicting.id, 'camera')
    expect((await body(p.id)).data.map((row) => row.id)).toEqual([visible.id])
  })
  test('limit-one pagination visits each stored binding once and rejects invalid or reused cursors', async () => {
    const [p, other] = await Promise.all([project(), project()])
    const sources = await Promise.all([publicSource(), publicSource(), publicSource()])
    for (const src of sources) await bind(p.id, src.id)
    const seen = []
    let cursor: string | null = null
    do {
      const response = await request(p.id, { limit: '1', ...(cursor ? { cursor } : {}) })
      expect(response.status).toBe(200)
      const page = (await response.json()) as Page<api.ProjectSourceHealthView>
      seen.push(...page.data.map((row) => row.id))
      cursor = page.next_cursor
      if (cursor) {
        const reused = await request(other.id, { cursor })
        expect(reused.status).toBe(422)
        expect(await reused.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
      }
    } while (cursor)
    expect(new Set(seen)).toEqual(new Set(sources.map((src) => src.id)))
    expect(seen).toHaveLength(3)
    for (const limit of ['0', '201', 'no']) expect((await request(p.id, { limit })).status).toBe(422)
    const payload = { v: 1, org_id: testOrg(ORG).id, project_id: p.id, binding_id: randomUUID() }
    for (const cursor of [
      'garbage',
      encodeCursor({ ...payload, extra: true }),
      encodeCursor({ ...payload, v: 2 }),
      encodeCursor({ ...payload, org_id: testOrg(OTHER).id }),
      encodeCursor({ ...payload, binding_id: 'invalid' })
    ]) {
      const response = await request(p.id, { cursor })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
    }
  })
})
