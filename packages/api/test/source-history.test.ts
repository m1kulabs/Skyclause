import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { type Principal, type Page, type Reading } from '@skyclause/contracts'
import { listSourceReadings as readingsRoute, listSourcePolls as pollsRoute } from '@skyclause/contracts/api/v1/sources'
import {
  recordAudit,
  withSystem,
  withTenant,
  source,
  reading,
  poll,
  sourceState,
  projectSource,
  auditEvent,
  domainEvent,
  analyticsEvent,
  type Tx
} from '@skyclause/db'
import {
  makeOrganization,
  makeProject,
  makeSource,
  makeReading,
  makePoll,
  makeSourceState,
  makeProjectSource,
  makeAuditEvent,
  makeDomainEvent,
  makeAnalyticsEvent
} from '@skyclause/db/test/factories/index'
import { beforeAll, expect, test, vi } from 'vitest'
import * as api from '../src'
import * as db from '@skyclause/db'
import { asLogin } from '@skyclause/db/test/harness/index'
import { capturedCa16w } from '@skyclause/db/test/source-binding-capture'
import { eq } from 'drizzle-orm'
import { decodeCursor, encodeCursor } from '../src/pagination'
import {
  apiRequest,
  asApiKey,
  asOAuth,
  asShareLink,
  asGuestToken,
  asSystem,
  crossOrgCase,
  asDevice,
  asSession,
  createTestApi,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'source-history-home'
const OTHER = 'source-history-other'
const orgId = testOrg(ORG).id
const now = new Date('2026-11-12T13:13:00Z')
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId, role: 'viewer' as const }
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: testCan }) })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: viewer }, fn)
const systemTenant = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: asSystem('source-history-api-test') }, fn)
const write = <T>(fn: (tx: Tx) => Promise<T>) => withSystem('source-history-api-test', fn)
const request = (
  kind: 'readings' | 'polls',
  sourceId: string,
  query: Record<string, string> = {},
  as: Principal | undefined = viewer,
  app = v1
) => apiRequest(app, { as, org: ORG, method: 'GET', path: `/v1/sources/${sourceId}/${kind}`, query })
const routes = { readings: readingsRoute, polls: pollsRoute }
const services = () => ({ readings: api.listSourceReadings, polls: api.listSourcePolls })
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})
for (const kind of ['readings', 'polls'] as const) {
  test(`${kind} exposes a schema-valid authorized empty page without a binding`, async () => {
    const src = await write((tx) => makeSource(tx))
    const response = await request(kind, src.id)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(routes[kind].responses[200].content['application/json'].schema.safeParse(body).success).toBe(true)
    expect(body).toEqual({ data: [], next_cursor: null })
  })
  test(`${kind} direct service denies a device before any target lookup`, async () => {
    const principal = asDevice({ org: ORG })
    await tenant(async (tx) => {
      await expect(
        services()[kind]({ tx, principal }, { sourceId: randomUUID(), query: { limit: 50 } }, { can: () => true, now })
      ).rejects.toMatchObject({ status: 403 })
    })
  })
}

const direct = (
  kind: 'readings' | 'polls',
  sourceId: string,
  principal: Principal = viewer,
  query: api.SourcePollsQuery = { limit: 50 },
  can = testCan
) => tenant(async (tx) => services()[kind]({ tx, principal }, { sourceId, query }, { can, now }))
async function body<K extends 'readings' | 'polls'>(kind: K, sourceId: string, query: Record<string, string> = {}) {
  const response = await request(kind, sourceId, query)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(routes[kind].responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as Page<K extends 'readings' ? Reading : api.SourcePollView>
}
async function effects(sourceId: string) {
  return systemTenant(async (tx) => ({
    sources: await tx.select().from(source).where(eq(source.id, sourceId)),
    readings: await tx
      .select()
      .from(reading)
      .where(eq(reading.sourceId, sourceId))
      .orderBy(reading.observedAt, reading.id),
    polls: await tx.select().from(poll).where(eq(poll.sourceId, sourceId)).orderBy(poll.startedAt, poll.id),
    states: await tx.select().from(sourceState).where(eq(sourceState.sourceId, sourceId)),
    bindings: await tx
      .select()
      .from(projectSource)
      .where(eq(projectSource.sourceId, sourceId))
      .orderBy(projectSource.id),
    audits: await tx.select().from(auditEvent).where(eq(auditEvent.orgId, orgId)).orderBy(auditEvent.id),
    events: await tx.select().from(domainEvent).where(eq(domainEvent.orgId, orgId)).orderBy(domainEvent.id),
    analytics: await tx.select().from(analyticsEvent).where(eq(analyticsEvent.orgId, orgId)).orderBy(analyticsEvent.id)
  }))
}

test('raw captured APIMS and future MET evidence retains all revisions, items, nulls and nested provider JSON during error state', async () => {
  const capture = capturedCa16w()
  const forecast = JSON.parse(
    readFileSync(
      new URL('../../sources/test/fixtures/weather-forecast-kl-20261108T014413Z.json', import.meta.url),
      'utf8'
    )
  )[0]
  const json = { Original_Key: [null, { nestedKey: true, nested_key: 'raw' }], forecast }
  const src = await write(async (tx) => {
    const src = await makeSource(tx, capture)
    await makeSourceState(tx, { sourceId: src.id, state: 'error', since: now, httpStatus: 503 })
    for (const row of [
      { metric: 'forecast', revision: 0, itemKey: 'a' },
      { metric: 'forecast', revision: 1, itemKey: 'a' },
      { metric: 'forecast', revision: 0, itemKey: 'b' },
      { metric: 'other', revision: 0, itemKey: null }
    ])
      await makeReading(tx, {
        sourceId: src.id,
        observedAt: new Date(`${forecast.date}T00:00:00Z`),
        receivedAt: new Date('2026-11-08T01:44:13Z'),
        unit: null,
        value: null,
        valueText: ' original\ntext ',
        valueJson: json,
        ...row
      })
    await makeReading(tx, {
      sourceId: src.id,
      observedAt: capture.observedAt,
      receivedAt: now,
      metric: 'api',
      unit: 'index',
      value: capture.value,
      itemKey: null
    })
    return src
  })
  const response = await request('readings', src.id)
  expect(response.status).toBe(200)
  const value = readingsRoute.responses[200].content['application/json'].schema.parse(await response.json())
  expect(readingsRoute.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  expect(value.data).toHaveLength(5)
  const rows = value.data.filter((r: { metric: string }) => r.metric !== 'api')
  expect(
    rows
      .map((r: { metric: string; revision: string; item_key: string | null }) => [r.metric, r.revision, r.item_key])
      .sort()
  ).toEqual(
    [
      ['forecast', '0', 'a'],
      ['forecast', '1', 'a'],
      ['forecast', '0', 'b'],
      ['other', '0', null]
    ].sort()
  )
  for (const row of rows) {
    expect(row).toEqual({
      id: expect.any(String),
      source_id: src.id,
      poll_id: null,
      metric: row.metric,
      unit: null,
      observed_at: '2026-11-14T00:00:00.000000Z',
      received_at: '2026-11-08T01:44:13.000000Z',
      value: null,
      value_text: ' original\ntext ',
      value_json: json,
      device_time: null,
      item_key: row.item_key,
      revision: row.revision
    })
  }
  expect(value.data.find((r: { metric: string }) => r.metric === 'api')).toMatchObject({
    value: capture.value,
    value_json: null,
    value_text: null
  })
  expect(await body('polls', src.id)).toEqual({ data: [], next_cursor: null })
})

test('polls expose the actual old backfill error behind five newer successes, nullable receipt/status and legacy outcomes', async () => {
  const src = await write(async (tx) => {
    const src = await makeSource(tx)
    await makePoll(tx, {
      sourceId: src.id,
      startedAt: new Date('2026-11-12T10:13:00Z'),
      outcome: 'error',
      httpStatus: null,
      receivedAt: null,
      purpose: 'apims_backfill',
      errorCode: 'timeout',
      message: ' original upstream error '
    })
    for (let i = 0; i < 5; i++)
      await makePoll(tx, {
        sourceId: src.id,
        startedAt: new Date(now.getTime() - i * 60000),
        outcome: 'ok',
        receivedAt: now
      })
    await makePoll(tx, {
      sourceId: src.id,
      startedAt: new Date('2026-11-12T11:00:00Z'),
      outcome: 'unchanged',
      message: null
    })
    await makePoll(tx, {
      sourceId: src.id,
      startedAt: new Date('2026-11-12T11:01:00Z'),
      outcome: 'legacy',
      purpose: 'raw_purpose'
    })
    return src
  })
  const errors = await body('polls', src.id, { outcome: 'error' })
  expect(errors.next_cursor).toBeNull()
  expect(errors.data).toEqual([
    {
      id: expect.any(String),
      source_id: src.id,
      request_id: expect.any(String),
      started_at: '2026-11-12T10:13:00.000000Z',
      http_status: null,
      latency_ms: 180,
      outcome: 'error',
      error_code: 'timeout',
      message: ' original upstream error ',
      purpose: 'apims_backfill',
      received_at: null
    }
  ])
  expect((await body('polls', src.id)).data.map((r) => r.outcome)).toEqual([
    'ok',
    'ok',
    'ok',
    'ok',
    'ok',
    'legacy',
    'unchanged',
    'error'
  ])
  expect(await body('readings', src.id)).toEqual({ data: [], next_cursor: null })
})

const times = [
  '2026-11-01T00:00:00.000002Z',
  '2026-11-01T00:00:00.000002Z',
  '2026-11-01T00:00:00.000001Z',
  '2026-10-31T23:59:59.999999Z'
]
async function exactRows(kind: 'readings' | 'polls') {
  const src = await write((tx) => makeSource(tx))
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort().reverse()
  await asLogin('postgres', async (client) => {
    for (const [i, at] of times.entries()) {
      if (kind === 'readings')
        await client.query(
          'INSERT INTO reading (id,source_id,metric,observed_at,received_at,device_time) VALUES ($1,$2,$3,$4,$4,$4)',
          [ids[i], src.id, `metric-${i}`, at]
        )
      else
        await client.query(
          'INSERT INTO poll (id,source_id,request_id,started_at,received_at,latency_ms,outcome) VALUES ($1,$2,$3,$4,$4,1,$5)',
          [ids[i], src.id, randomUUID(), at, 'ok']
        )
    }
  })
  return { src, ids }
}

for (const kind of ['readings', 'polls'] as const) {
  test(`${kind} traverses equal-time and microsecond rows across partitions, permits limit changes and terminates exactly`, async () => {
    const { src, ids } = await exactRows(kind)
    const first = await body(kind, src.id, { limit: '1' })
    expect(first.data.map((r) => r.id)).toEqual(ids.slice(0, 1))
    expect(first.next_cursor).toEqual(expect.any(String))
    expect(decodeCursor(first.next_cursor!)).toEqual({
      v: 1,
      kind,
      org_id: orgId,
      source_id: src.id,
      from: null,
      to: null,
      outcome: null,
      at: times[0],
      id: ids[0]
    })
    const seen = [...first.data.map((r) => r.id)]
    let cursor = first.next_cursor
    for (let i = 0; i < 5 && cursor; i++) {
      const next = await body(kind, src.id, { limit: '1', cursor })
      seen.push(...next.data.map((r) => r.id))
      cursor = next.next_cursor
    }
    expect(seen).toEqual(ids)
    expect(cursor).toBeNull()
    const changedLimit = await body(kind, src.id, { limit: '200', cursor: first.next_cursor! })
    expect(changedLimit.data.map((r) => r.id)).toEqual(ids.slice(1))
    expect(changedLimit.next_cursor).toBeNull()
    expect(await direct(kind, src.id, viewer, { limit: 200, cursor: first.next_cursor! })).toEqual(changedLimit)
  })

  test(`${kind} binds strict cursor identity to operation, tenant, source and exact filters at /cursor`, async () => {
    const { src } = await exactRows(kind)
    const filters = { from: times[3]!, to: '2026-11-02T00:00:00Z', ...(kind === 'polls' ? { outcome: 'ok' } : {}) }
    const first = await body(kind, src.id, { limit: '1', ...filters })
    const payload = decodeCursor(first.next_cursor!)
    const other = await write((tx) => makeSource(tx))
    for (const patch of [
      { v: 2 },
      { kind: kind === 'readings' ? 'polls' : 'readings' },
      { org_id: testOrg(OTHER).id },
      { source_id: other.id },
      { from: null },
      { to: null },
      { outcome: 'error' },
      { extra: true },
      { at: '2026-11-01T00:00:00.0000001Z' },
      { at: '0000-01-01T00:00:00Z' },
      { id: 'invalid' }
    ]) {
      const cursor = encodeCursor({ ...payload, ...patch })
      const response = await request(kind, src.id, { ...filters, cursor })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ in: 'query', pointer: '/cursor' }] })
      await expect(
        direct(kind, src.id, viewer, { limit: 50, ...filters, outcome: kind === 'polls' ? 'ok' : undefined, cursor })
      ).rejects.toMatchObject({ status: 422, extra: { errors: [{ pointer: '/cursor' }] } })
    }
    for (const query of [
      { cursor: 'garbage' },
      { cursor: first.next_cursor! },
      { ...filters, from: times[2]!, cursor: first.next_cursor! },
      { ...filters, to: '2026-11-03T00:00:00Z', cursor: first.next_cursor! },
      ...(kind === 'polls' ? [{ ...filters, outcome: 'error', cursor: first.next_cursor! }] : [])
    ]) {
      const response = await request(kind, src.id, query)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
    }
    expect((await request(kind, other.id, { ...filters, cursor: first.next_cursor! })).status).toBe(422)
  })

  test(`${kind} uses half-open ranges and validates direct and HTTP inputs without rounding`, async () => {
    const { src, ids } = await exactRows(kind)
    expect((await body(kind, src.id, { from: times[2]!, to: times[0]! })).data.map((r) => r.id)).toEqual([ids[2]])
    expect((await body(kind, src.id, { from: times[2]! })).data.map((r) => r.id)).toEqual(ids.slice(0, 3))
    expect((await body(kind, src.id, { to: times[2]! })).data.map((r) => r.id)).toEqual([ids[3]])
    expect((await body(kind, src.id, { from: '0001-01-01T00:00:00Z' })).data.map((r) => r.id)).toEqual(ids)
    expect(await direct(kind, src.id, viewer, { limit: 50, from: '0001-01-01T00:00:00Z' })).toEqual(
      await body(kind, src.id, { from: '0001-01-01T00:00:00Z' })
    )
    for (const [query, pointer] of [
      [{ from: times[0], to: times[0] }, '/to'],
      [{ from: times[0], to: times[2] }, '/to'],
      [{ from: '2026-11-01T00:00:00.1234567Z' }, '/from'],
      [{ to: 'invalid' }, '/to'],
      [{ from: '0000-01-01T00:00:00Z' }, '/from'],
      [{ to: '0000-01-01T00:00:00Z' }, '/to'],
      [{ limit: '0' }, '/limit'],
      [{ limit: '201' }, '/limit'],
      [{ limit: '1.5' }, '/limit'],
      ...(kind === 'polls' ? [[{ outcome: 'legacy' }, '/outcome']] : [])
    ] as Array<[Record<string, string>, string]>) {
      const response = await request(kind, src.id, query)
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        errors: expect.arrayContaining([expect.objectContaining({ pointer })])
      })
      await expect(direct(kind, src.id, viewer, { limit: 50, ...query } as api.SourcePollsQuery)).rejects.toMatchObject(
        { status: 422, extra: { errors: expect.arrayContaining([expect.objectContaining({ pointer })]) } }
      )
    }
  })
}

for (const kind of ['readings', 'polls'] as const) {
  test(`${kind} permits unbound catalogue for other-organisation viewers, guests and scoped readers`, async () => {
    const src = await write(async (tx) => {
      const src = await makeSource(tx)
      await makeReading(tx, { sourceId: src.id, observedAt: now, value: 42 })
      await makePoll(tx, { sourceId: src.id, startedAt: now })
      return src
    })
    const otherOrg = testOrg(OTHER).id
    const principals = [
      { ...asSession({ org: OTHER, role: 'viewer' }), orgId: otherOrg, role: 'viewer' as const },
      { ...asSession({ org: OTHER, role: 'guest', guest: true }), orgId: otherOrg, role: 'guest' as const },
      asApiKey({ org: OTHER, role: 'viewer', scopes: ['read'] }),
      asGuestToken({ org: OTHER }),
      asOAuth({ org: OTHER, role: 'viewer', projectIds: [] }),
      asOAuth({ org: OTHER, role: null, projectIds: [randomUUID()], shareLinkId: randomUUID() }),
      asShareLink({ org: OTHER, projectId: randomUUID(), access: 'reviewer' })
    ]
    for (const principal of principals) {
      const page = await withTenant({ orgId: otherOrg, principal }, async (tx) =>
        services()[kind]({ tx, principal }, { sourceId: src.id, query: { limit: 50 } }, { can: testCan, now })
      )
      expect(page.data).toHaveLength(1)
      const response = await apiRequest(v1, {
        as: principal,
        org: OTHER,
        method: 'GET',
        path: `/v1/sources/${src.id}/${kind}`
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(page)
    }
  })

  test(`${kind} hides foreign private sources and enforces authoritative private project scope without requiring a binding`, async () => {
    const [own, other] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      async (tx) => {
        const p = await makeProject(tx)
        return makeSource(tx, { kind: 'camera', meta: { project_id: p.id } })
      }
    )
    await crossOrgCase(kind === 'readings' ? 'listSourceReadings' : 'listSourcePolls', {
      app: v1,
      as: viewer,
      org: ORG,
      params: { id: foreign.id }
    }).run()
    await expect(direct(kind, foreign.id)).rejects.toMatchObject({ status: 404 })
    for (const deviceKind of ['camera', 'pi'] as const) {
      const src = await tenant((tx) => makeSource(tx, { kind: deviceKind, meta: { project_id: own.id } }))
      const allowed = [
        viewer,
        asOAuth({ org: ORG, role: 'viewer', projectIds: [own.id] }),
        asShareLink({ org: ORG, projectId: own.id, access: 'reviewer' })
      ]
      for (const principal of allowed) {
        expect(await direct(kind, src.id, principal)).toEqual({ data: [], next_cursor: null })
        expect((await request(kind, src.id, {}, principal)).status).toBe(200)
      }
      for (const principal of [
        asOAuth({ org: ORG, role: 'viewer', projectIds: [other.id] }),
        asShareLink({ org: ORG, projectId: other.id, access: 'reviewer' })
      ]) {
        await expect(direct(kind, src.id, principal)).rejects.toMatchObject({ status: 404 })
        expect((await request(kind, src.id, {}, principal)).status).toBe(404)
      }
      const deniedCan: typeof testCan = (p, statement, target) => !target?.projectId && testCan(p, statement)
      await expect(direct(kind, src.id, viewer, { limit: 50 }, deniedCan)).rejects.toMatchObject({ status: 403 })
      const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, can: deniedCan }) }).v1
      expect((await request(kind, src.id, {}, viewer, denied)).status).toBe(403)
    }
  })

  test(`${kind} rejects corrupt ownership and scoped grants before any evidence query`, async () => {
    const p = await tenant((tx) => makeProject(tx))
    const otherProject = await tenant((tx) => makeProject(tx))
    const foreignProject = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    const hidden: string[] = []
    for (const deviceKind of ['camera', 'pi'] as const) {
      for (const meta of [
        {},
        { project_id: null },
        { project_id: 42 },
        { project_id: 'bad' },
        { project_id: randomUUID() },
        { project_id: foreignProject.id }
      ]) {
        hidden.push((await tenant((tx) => makeSource(tx, { kind: deviceKind, meta }))).id)
      }
      hidden.push((await write((tx) => makeSource(tx, { kind: deviceKind, meta: { project_id: p.id } }))).id)
      const conflict = await tenant(async (tx) => {
        const src = await makeSource(tx, { kind: deviceKind, meta: { project_id: p.id } })
        await makeProjectSource(tx, { sourceId: src.id, projectId: p.id, role: deviceKind })
        await makeProjectSource(tx, { sourceId: src.id, projectId: otherProject.id, role: deviceKind })
        return src
      })
      hidden.push(conflict.id)
    }
    hidden.push((await tenant((tx) => makeSource(tx, { kind: 'apims', meta: { project_id: p.id } }))).id)
    const src = await tenant((tx) => makeSource(tx, { kind: 'camera', meta: { project_id: p.id } }))
    const evidence = vi.spyOn(db, kind === 'readings' ? 'listSourceReadingRecords' : 'listSourcePollRecords')
    try {
      for (const id of [...hidden, randomUUID(), 'invalid']) {
        await expect(direct(kind, id)).rejects.toMatchObject({ status: 404 })
        expect((await request(kind, id)).status).toBe(404)
      }
      for (const principal of [
        asOAuth({ org: ORG, role: 'viewer', projectIds: [] }),
        asShareLink({ org: ORG, projectId: otherProject.id, access: 'reviewer' })
      ]) {
        await expect(direct(kind, src.id, principal)).rejects.toMatchObject({ status: 404 })
        expect((await request(kind, src.id, {}, principal)).status).toBe(404)
      }
      expect(evidence).not.toHaveBeenCalled()
    } finally {
      evidence.mockRestore()
    }
  })

  test(`${kind} uniformly forbids device, system, scopeless and failed unscoped Can before local, foreign or missing lookup`, async () => {
    const src = await write((tx) => makeSource(tx))
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeSource(tx, { kind: 'camera' })
    )
    const ids = [src.id, foreign.id, randomUUID()]
    const principals = [
      asDevice({ org: ORG }),
      asSystem('source-history-test'),
      asApiKey({ org: ORG, role: 'viewer', scopes: [] }),
      asOAuth({ org: ORG, role: 'viewer', scopes: [], projectIds: [] }),
      asGuestToken({ org: ORG, scopes: [] })
    ]
    const lookup = vi.spyOn(db, 'getSourceHistoryAccess')
    try {
      // An overly broad injected Can cannot grant device/system actors or missing token scopes.
      const permissive = createTestApi({ deps: testDeps({ withTenant, recordAudit, can: () => true }) }).v1
      for (const principal of principals)
        for (const id of ids) {
          await expect(direct(kind, id, principal, { limit: 50 }, () => true)).rejects.toMatchObject({
            status: 403,
            slug: 'insufficient-scope'
          })
          expect((await request(kind, id, {}, principal, permissive)).status).toBe(403)
        }
      const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, can: () => false }) }).v1
      for (const id of ids) {
        await expect(direct(kind, id, viewer, { limit: 50 }, () => false)).rejects.toMatchObject({
          status: 403,
          slug: 'insufficient-scope'
        })
        expect((await request(kind, id, {}, viewer, denied)).status).toBe(403)
      }
      expect(lookup).not.toHaveBeenCalled()
    } finally {
      lookup.mockRestore()
    }
    expect((await apiRequest(v1, { method: 'GET', path: `/v1/sources/${src.id}/${kind}`, org: ORG })).status).toBe(401)
    expect((await apiRequest(v1, { as: viewer, method: 'GET', path: `/v1/sources/${src.id}/${kind}` })).status).toBe(
      400
    )
    expect(
      (await apiRequest(v1, { as: viewer, org: OTHER, method: 'GET', path: `/v1/sources/${src.id}/${kind}` })).status
    ).toBe(404)
    expect(
      (
        await apiRequest(v1, {
          as: asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }),
          org: OTHER,
          method: 'GET',
          path: `/v1/sources/${src.id}/${kind}`
        })
      ).status
    ).toBe(404)
    await expect(direct(kind, src.id, { ...viewer, orgId: testOrg(OTHER).id })).rejects.toMatchObject({ status: 404 })
  })

  test(`${kind} reauthorizes a cursor after permission revocation and scope changes`, async () => {
    const p = await tenant((tx) => makeProject(tx))
    const src = await tenant((tx) => makeSource(tx, { kind: 'camera', meta: { project_id: p.id } }))
    await systemTenant(async (tx) => {
      for (let i = 0; i < 2; i++) {
        await makeReading(tx, { sourceId: src.id, metric: `m-${i}`, observedAt: now })
        await makePoll(tx, { sourceId: src.id, startedAt: now })
      }
    })
    let granted = true
    const can: typeof testCan = (principal, statement, target) => granted && testCan(principal, statement, target)
    const app = createTestApi({ deps: testDeps({ withTenant, recordAudit, can }) }).v1
    const principal = asOAuth({ org: ORG, role: 'viewer', projectIds: [p.id] })
    const first = await request(kind, src.id, { limit: '1' }, principal, app)
    expect(first.status).toBe(200)
    const cursor = ((await first.json()) as Page<Reading>).next_cursor!
    expect(cursor).toEqual(expect.any(String))
    granted = false
    expect((await request(kind, src.id, { cursor }, principal, app)).status).toBe(403)
    await expect(direct(kind, src.id, principal, { limit: 50, cursor }, can)).rejects.toMatchObject({ status: 403 })
    granted = true
    const changed = { ...principal, projectIds: [] } as Principal
    expect((await request(kind, src.id, { cursor }, changed, app)).status).toBe(404)
    await expect(direct(kind, src.id, changed, { limit: 50, cursor }, can)).rejects.toMatchObject({ status: 404 })
  })

  test(`${kind} honors default 50 and maximum 200 while direct callers receive identical paging`, async () => {
    const src = await write(async (tx) => {
      const src = await makeSource(tx)
      if (kind === 'readings')
        await tx
          .insert(reading)
          .values(Array.from({ length: 201 }, (_, i) => ({ sourceId: src.id, metric: `m-${i}`, observedAt: now })))
      else
        await tx.insert(poll).values(
          Array.from({ length: 201 }, () => ({
            sourceId: src.id,
            requestId: randomUUID(),
            startedAt: now,
            latencyMs: 1,
            outcome: 'ok'
          }))
        )
      return src
    })
    const defaults = await body(kind, src.id)
    expect(defaults.data).toHaveLength(50)
    expect(defaults.next_cursor).toEqual(expect.any(String))
    const max = await body(kind, src.id, { limit: '200' })
    expect(max.data).toHaveLength(200)
    const last = await body(kind, src.id, { cursor: max.next_cursor!, limit: '200' })
    expect(last.data).toHaveLength(1)
    expect(last.next_cursor).toBeNull()
    expect(await direct(kind, src.id, viewer, {} as api.SourcePollsQuery)).toEqual(defaults)
  })

  test(`${kind} leaves complete domain rows unchanged after repeated successes and denials and propagates read failures`, async () => {
    const p = await tenant((tx) => makeProject(tx))
    const src = await tenant(async (tx) => {
      const src = await makeSource(tx, { kind: 'camera', meta: { project_id: p.id } })
      await makeProjectSource(tx, { sourceId: src.id, projectId: p.id, role: 'camera' })
      await makeAuditEvent(tx, { projectId: p.id, targetId: src.id })
      await makeDomainEvent(tx, { projectId: p.id, data: { source_id: src.id } })
      return src
    })
    await systemTenant(async (tx) => {
      await makeReading(tx, { sourceId: src.id, observedAt: now, valueJson: { Raw_Key: 42 } })
      await makePoll(tx, { sourceId: src.id, startedAt: now, outcome: 'error', message: 'real stored error' })
      await makeSourceState(tx, { sourceId: src.id, state: 'error', since: now })
      await makeAnalyticsEvent(tx, { orgId, projectId: p.id })
    })
    const before = await effects(src.id)
    for (let i = 0; i < 2; i++) {
      expect((await request(kind, src.id)).status).toBe(200)
      expect((await direct(kind, src.id)).data).toHaveLength(1)
      const principal = asDevice({ org: ORG })
      expect((await request(kind, src.id, {}, principal)).status).toBe(403)
      await expect(direct(kind, src.id, principal)).rejects.toMatchObject({ status: 403 })
      const scoped = asOAuth({ org: ORG, role: 'viewer', projectIds: [] })
      expect((await request(kind, src.id, {}, scoped)).status).toBe(404)
      await expect(direct(kind, src.id, scoped)).rejects.toMatchObject({ status: 404 })
    }
    expect(await effects(src.id)).toEqual(before)
    const evidence = vi.spyOn(db, kind === 'readings' ? 'listSourceReadingRecords' : 'listSourcePollRecords')
    try {
      evidence.mockRejectedValueOnce(new Error('injected database read failure'))
      await expect(direct(kind, src.id)).rejects.toThrow('injected database read failure')
      evidence.mockRejectedValueOnce(new Error('injected database read failure'))
      const failure = await request(kind, src.id)
      expect(failure.status).toBe(500)
      expect(await failure.json()).toMatchObject({ type: 'https://docs.skyclause.m1ku.tech/problems/internal-error' })
      expect(await effects(src.id)).toEqual(before)
    } finally {
      evidence.mockRestore()
    }
  })
}
