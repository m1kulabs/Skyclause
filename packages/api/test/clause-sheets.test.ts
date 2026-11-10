import { randomUUID } from 'node:crypto'
import { canonicalHash, snapshotAt, type SheetInput } from '@skyclause/clauses'
import skyDefault from '@skyclause/clauses/defaults/sky.json'
import { API_ROUTES, V1_ROUTES, type Principal, type SkyclauseRoute } from '@skyclause/contracts'
import { createProjectRecord, recordAudit, withTenant, type Tx } from '@skyclause/db'
import { makeOrganization, makeRun, makeRunStep } from '../../db/test/factories'
import { asLogin, memberOf } from '../../db/test/harness'
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest'
import { TEST_REGISTRY } from '../../clauses/test/test-helpers'
import { setClauseSheetPorts } from '../src/services/clause-sheets'
import { HANDLERS } from '../src/routes'
import { openApiDocument } from '../src/openapi'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  asSystem,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg,
  TEST_NOW,
  type ApiRequest
} from './harness'

const ORG = 'mounted-clauses'
const OTHER = 'mounted-clauses-other'
const owner = asSession({ org: ORG, role: 'owner' })
const raw = (): SheetInput => structuredClone(skyDefault) as SheetInput
const routes = [...V1_ROUTES, ...API_ROUTES].filter(
  (r) => r['x-skyclause'].owner === 'b-clause-sheets-api'
) as SkyclauseRoute[]
const orgId = testOrg(ORG).id
const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)
const apps = () => createTestApi({ deps: testDeps({ withTenant, recordAudit }) })
const slug = async (r: Response) => ((await r.json()) as { type: string }).type.split('/').at(-1)
async function project(org = orgId) {
  return inOrg(
    (tx) =>
      createProjectRecord(
        tx,
        {
          name: 'Mounted clauses',
          slug: `mount-${randomUUID().slice(0, 8)}`,
          siteName: 'APU',
          siteLat: 3.0553,
          siteLon: 101.7005,
          packs: ['sky']
        },
        TEST_NOW
      ),
    org
  )
}
async function save(app: ReturnType<typeof apps>, id: string, as: Principal = owner) {
  const response = await apiRequest(app.v1, {
    as,
    org: ORG,
    method: 'POST',
    path: `/v1/clause-sheets/${id}/drafts`,
    body: { content: raw() },
    idempotencyKey: randomUUID()
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.json() as Promise<{ id: string; content_hash: string; validation_status: string }>
}
function request(route: SkyclauseRoute, id: string, draftId: string): ApiRequest {
  const operation = route.operationId
  return {
    as: owner,
    org: ORG,
    method: route.method.toUpperCase(),
    path: route.path.replace('{id}', id).replace('{draftId}', draftId).replace('{n}', '1'),
    idempotencyKey: route['x-skyclause'].idempotent ? randomUUID() : undefined,
    query:
      operation === 'getClauseSheetDiff'
        ? { base: 'live', head: `draft:${draftId}` }
        : operation === 'getClauseSheetPublishPreview'
          ? { draft_id: draftId }
          : undefined,
    body:
      operation === 'createClauseSheetDraft'
        ? { content: raw() }
        : operation === 'evaluateClauseSheet'
          ? { draft_id: draftId }
          : operation === 'publishClauseSheet'
            ? { draft_id: draftId, preview_hash: 'not-cached' }
            : undefined
  }
}
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})
beforeEach(() =>
  setClauseSheetPorts({ registry: { load: async () => TEST_REGISTRY }, snapshots: null, recordedAt: null })
)
afterEach(() => setClauseSheetPorts({ registry: null, snapshots: null, recordedAt: null }))

test('mounts exactly eleven owned operations and leaves replay creation unbuilt', () => {
  expect(routes.map((r) => r.operationId)).toEqual([
    'listClauseSheets',
    'listClauseSheetVersions',
    'getClauseSheetVersion',
    'getClauseSheetDiff',
    'evaluateClauseSheet',
    'listClauseSheetDrafts',
    'createClauseSheetDraft',
    'getClauseSheetDraft',
    'deleteClauseSheetDraft',
    'getClauseSheetPublishPreview',
    'publishClauseSheet'
  ])
  for (const route of routes) expect(HANDLERS).toHaveProperty(route.operationId)
  expect(HANDLERS.createReplay).toBeUndefined()
})

test('generated OpenAPI diff selector enforces the runtime UUIDv7 format', () => {
  const document = openApiDocument()
  const operation = document.paths!['/v1/clause-sheets/{id}/diff']!.get!
  const head = operation.parameters!.find((p) => 'name' in p && p.name === 'head')!
  if (!('schema' in head) || !head.schema || !('anyOf' in head.schema)) throw new Error('Missing head selector schema')
  const selector = head.schema.anyOf!.find((s) => 'pattern' in s && s.pattern)!
  if (!('pattern' in selector)) throw new Error('Missing draft selector pattern')
  const pattern = new RegExp(selector.pattern!)
  expect(pattern.test('draft:01950000-0000-7000-8000-000000000001')).toBe(true)
  for (const value of ['draft:', 'draft:bad', 'draft:01950000-0000-4000-8000-000000000001'])
    expect(pattern.test(value)).toBe(false)
})

for (const route of routes) {
  test(`${route.operationId} binds tenant and parent before dependencies`, async () => {
    const app = apps()
    const foreign = await project(testOrg(OTHER).id)
    const unknown = '01950000-0000-7000-8000-000000000001'
    const foreignId = route.operationId === 'listClauseSheets' ? foreign.project.id : foreign.sheets[0]!.id
    await crossOrgCase(route.operationId, {
      ...request(route, foreignId, unknown),
      as: owner,
      app: route.path.startsWith('/api/') ? app.api : app.v1,
      params: { id: foreignId, draftId: unknown, n: '1' }
    }).run()
    const missing = await apiRequest(
      route.path.startsWith('/api/') ? app.api : app.v1,
      request(route, unknown, unknown)
    )
    expect(missing.status).toBe(404)
  })
  test(`${route.operationId} refuses permission below its statement`, async () => {
    const app = createTestApi({ deps: testDeps({ withTenant, can: () => false }) })
    const response = await apiRequest(
      route.path.startsWith('/api/') ? app.api : app.v1,
      request(route, randomUUID(), '01950000-0000-7000-8000-000000000001')
    )
    expect(response.status).toBe(403)
  })
  test(`${route.operationId} passes the actual project permission target`, async () => {
    const made = await project()
    const targets: unknown[] = []
    const app = createTestApi({
      deps: testDeps({
        withTenant,
        can: (p, statement, target) => {
          if (target) targets.push(target)
          return !target && testCan(p, statement)
        }
      })
    })
    const id = route.operationId === 'listClauseSheets' ? made.project.id : made.sheets[0]!.id
    const response = await apiRequest(
      route.path.startsWith('/api/') ? app.api : app.v1,
      request(route, id, '01950000-0000-7000-8000-000000000001')
    )
    expect(response.status).toBe(403)
    expect(targets).toEqual([{ projectId: made.project.id }])
  })
}

test('raw save, lists, selected reads, diff and delete work with unavailable providers', async () => {
  setClauseSheetPorts({ registry: null, snapshots: null, recordedAt: null })
  const app = apps(),
    made = await project(),
    id = made.sheets[0]!.id
  const draft = await save(app, id)
  expect(draft.validation_status).toBe('unavailable')
  expect(draft.content_hash).toBe(canonicalHash(raw()))
  for (const path of [
    `/v1/projects/${made.project.id}/clause-sheets`,
    `/v1/clause-sheets/${id}/versions`,
    `/v1/clause-sheets/${id}/versions/1`,
    `/v1/clause-sheets/${id}/drafts`,
    `/v1/clause-sheets/${id}/drafts/${draft.id}`,
    `/v1/clause-sheets/${id}/diff?base=live&head=draft:${draft.id}`
  ]) {
    const response = await apiRequest(app.v1, { as: owner, org: ORG, method: 'GET', path })
    expect(response.status, path).toBe(200)
  }
  for (const operation of ['getClauseSheetPublishPreview', 'publishClauseSheet', 'evaluateClauseSheet']) {
    const route = routes.find((r) => r.operationId === operation)!
    const response = await apiRequest(route.path.startsWith('/api/') ? app.api : app.v1, request(route, id, draft.id))
    expect(response.status).toBe(501)
    expect(await response.json()).toMatchObject({ owner: 'b-evaluator' })
  }
  expect(
    (
      await apiRequest(app.v1, {
        as: owner,
        org: ORG,
        method: 'DELETE',
        path: `/v1/clause-sheets/${id}/drafts/${draft.id}`
      })
    ).status
  ).toBe(200)
})

test('draft selectors cannot cross same-tenant parents or select a publication', async () => {
  const app = apps(),
    a = await project(),
    b = await project(),
    id = a.sheets[0]!.id
  const draft = await save(app, b.sheets[0]!.id)
  for (const operation of [
    'getClauseSheetDraft',
    'deleteClauseSheetDraft',
    'getClauseSheetDiff',
    'evaluateClauseSheet',
    'getClauseSheetPublishPreview',
    'publishClauseSheet'
  ]) {
    const route = routes.find((r) => r.operationId === operation)!
    const response = await apiRequest(route.path.startsWith('/api/') ? app.api : app.v1, request(route, id, draft.id))
    expect(response.status, operation).toBe(404)
  }
})

test('validates diff, evaluation, publication and version selectors before services', async () => {
  const app = apps(),
    id = (await project()).sheets[0]!.id
  const invalid: Array<Omit<ApiRequest, 'as' | 'org'>> = [
    { method: 'GET', path: `/v1/clause-sheets/${id}/diff`, query: { base: 'live', head: 'draft:bad' } },
    { method: 'GET', path: `/v1/clause-sheets/${id}/versions/0` },
    { method: 'POST', path: `/v1/clause-sheets/${id}/evaluate`, body: { version_n: 1, content: raw() } },
    {
      method: 'POST',
      path: `/api/clause-sheets/${id}/publish`,
      body: { draft_id: 'bad', preview_hash: '' },
      idempotencyKey: randomUUID()
    },
    { method: 'GET', path: `/api/clause-sheets/${id}/publish-preview`, query: { draft_id: 'bad' } }
  ]
  for (const input of invalid) {
    const response = await apiRequest(input.path.startsWith('/api/') ? app.api : app.v1, {
      ...input,
      as: owner,
      org: ORG
    })
    expect(response.status).toBe(422)
    expect(await slug(response)).toBe('validation-failed')
  }
})

test('publication guards admit owner admin approver and session bearer at exactly twelve hours', async () => {
  const app = apps(),
    id = (await project()).sheets[0]!.id,
    draft = await save(app, id)
  for (const route of routes.filter((r) => r.path.startsWith('/api/'))) {
    for (const role of ['owner', 'admin', 'approver'] as const) {
      for (const via of ['cookie', 'bearer'] as const) {
        const as = asSession({ org: ORG, role, via, authenticatedAt: new Date(TEST_NOW.getTime() - 12 * 3600000) })
        const response = await apiRequest(app.api, { ...request(route, id, draft.id), as })
        expect(response.status, `${route.operationId} ${role} ${via}`).toBe(route.method === 'get' ? 200 : 409)
      }
    }
    const expired = asSession({ org: ORG, role: 'owner', authenticatedAt: new Date(TEST_NOW.getTime() - 13 * 3600000) })
    const response = await apiRequest(app.api, { ...request(route, id, draft.id), as: expired })
    expect(response.status).toBe(401)
    expect(await slug(response)).toBe('reauth-required')
  }
})

test('publication refuses editor and every nonhuman principal through real middleware', async () => {
  const app = apps(),
    id = (await project()).sheets[0]!.id,
    draft = await save(app, id)
  const denied = [
    asSession({ org: ORG, role: 'editor' }),
    asSession({ org: ORG, role: 'owner', guest: true }),
    asApiKey({ org: ORG, role: 'owner', scopes: ['admin'] }),
    asOAuth({ org: ORG, role: 'owner', resource: 'api', scopes: ['draft'] }),
    asShareLink({ org: ORG }),
    asGuestToken({ org: ORG }),
    asDevice({ org: ORG }),
    asSystem('clauses-test')
  ]
  for (const route of routes.filter((r) => r.path.startsWith('/api/'))) {
    for (const as of denied)
      expect((await apiRequest(app.api, { ...request(route, id, draft.id), as })).status).toBe(403)
  }
  const key = asApiKey({ org: ORG, role: 'editor', scopes: ['admin'] })
  await save(app, id, key)
  for (const as of denied.slice(3)) {
    const response = await apiRequest(app.v1, {
      ...request(
        routes.find((r) => r.operationId === 'createClauseSheetDraft')!,
        id,
        draft.id
      ),
      as
    })
    expect(response.status).toBe(403)
  }
})

test('cookie publication checks Origin while session bearer needs no Origin', async () => {
  const app = apps(),
    id = (await project()).sheets[0]!.id,
    draft = await save(app, id)
  const route = routes.find((r) => r.operationId === 'publishClauseSheet')!
  const bad = await apiRequest(app.api, {
    ...request(route, id, draft.id),
    headers: { Origin: 'https://foreign.example' }
  })
  expect(bad.status).toBe(403)
  const resolvedCookie = createTestApi({ deps: testDeps({ withTenant, resolvePrincipal: async () => owner }) })
  const noOrigin = await apiRequest(resolvedCookie.api, {
    ...request(route, id, draft.id),
    as: undefined,
    headers: { Cookie: 'test' }
  })
  expect(noOrigin.status).toBe(403)
  const bearer = asSession({ org: ORG, role: 'owner', via: 'bearer' })
  expect((await apiRequest(app.api, { ...request(route, id, draft.id), as: bearer })).status).toBe(409)
})

test('both publication middleware guards reject guests and old sessions before opening a tenant transaction', async () => {
  let transactions = 0
  const app = createTestApi({
    deps: testDeps({
      can: () => true,
      withTenant: async () => {
        transactions += 1
        throw new Error('must not enter service')
      }
    })
  })
  for (const route of routes.filter((r) => r.path.startsWith('/api/'))) {
    for (const as of [
      asSession({ org: ORG, role: 'owner', guest: true }),
      asSession({ org: ORG, role: 'owner', authenticatedAt: new Date(TEST_NOW.getTime() - 13 * 3600000) })
    ]) {
      const response = await apiRequest(app.api, {
        ...request(route, randomUUID(), '01950000-0000-7000-8000-000000000001'),
        as
      })
      expect(response.status).toBe(as.isGuest ? 403 : 401)
    }
  }
  expect(transactions).toBe(0)
})

test('live evaluation uses the registered nonpersisting provider and reports missing live and history dependencies', async () => {
  const app = apps(),
    made = await project(),
    id = made.sheets[0]!.id
  const input = {
    as: owner,
    org: ORG,
    method: 'POST',
    path: `/v1/clause-sheets/${id}/evaluate`,
    body: { version_n: 1 }
  }
  for (const body of [{ version_n: 1 }, { version_n: 1, at: TEST_NOW.toISOString() }]) {
    const missing = await apiRequest(app.v1, { ...input, body })
    expect(missing.status).toBe(501)
    expect(await missing.json()).toMatchObject({ owner: 'b-evaluator' })
  }
  const taken: unknown[] = []
  setClauseSheetPorts({
    registry: { load: async () => TEST_REGISTRY },
    recordedAt: null,
    snapshots: {
      take: async (_tx, q) => {
        taken.push(q)
        return {
          snapshotId: null,
          snapshot: snapshotAt({ sources: [], polls: [], readings: [] }, TEST_REGISTRY, q.projectId, q.pack, q.tEval)
        }
      }
    }
  })
  const evaluated = await apiRequest(app.v1, input)
  expect(evaluated.status, await evaluated.clone().text()).toBe(200)
  expect(await evaluated.json()).toMatchObject({ label: 'live', check: { ok: true } })
  expect(taken).toEqual([
    {
      projectId: made.project.id,
      pack: 'sky',
      tEval: TEST_NOW.toISOString().replace('.000Z', 'Z'),
      windows: [],
      persist: false
    }
  ])
})

test('publish idempotency replays original 201 once, rejects another body, and preserves versions two and three', async () => {
  const app = apps(),
    made = await project(),
    id = made.sheets[0]!.id
  const readOne = () =>
    apiRequest(app.v1, { as: owner, org: ORG, method: 'GET', path: `/v1/clause-sheets/${id}/versions/1` })
  const original = await (await readOne()).json()
  expect(original).toMatchObject({
    n: 1,
    status: 'published',
    published_by: null,
    content: raw(),
    content_hash: canonicalHash(raw())
  })
  let second: unknown
  for (const n of [2, 3]) {
    const draft = await save(app, id)
    const previewResponse = await apiRequest(app.api, {
      ...request(
        routes.find((r) => r.operationId === 'getClauseSheetPublishPreview')!,
        id,
        draft.id
      )
    })
    expect(previewResponse.status).toBe(200)
    const preview = (await previewResponse.json()) as { preview_hash: string }
    const input = {
      ...request(
        routes.find((r) => r.operationId === 'publishClauseSheet')!,
        id,
        draft.id
      ),
      body: { draft_id: draft.id, preview_hash: preview.preview_hash }
    }
    const first = await apiRequest(app.api, input)
    expect(first.status, await first.clone().text()).toBe(201)
    const published = await first.json()
    expect(published).toMatchObject({ n, status: 'published', published_by: owner.accountId })
    const replay = await apiRequest(app.api, input)
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(published)
    const mismatch = await apiRequest(app.api, { ...input, body: { draft_id: draft.id, preview_hash: 'different' } })
    expect(mismatch.status).toBe(422)
    expect(await slug(mismatch)).toBe('idempotency-mismatch')
    const stale = await apiRequest(app.api, { ...input, idempotencyKey: randomUUID() })
    expect(stale.status).toBe(409)
    expect(await slug(stale)).toBe('preview-stale')
    if (n === 2) second = published
  }
  for (const n of [2, 3]) {
    const response = await apiRequest(app.v1, {
      as: owner,
      org: ORG,
      method: 'GET',
      path: `/v1/clause-sheets/${id}/versions/${n}`
    })
    expect(response.status).toBe(200)
    const read = await response.json()
    if (n === 2) expect(read).toEqual(second)
  }
  const effects = await asLogin('postgres', (db) =>
    db.query<{ audits: string; events: string; ledger: string }>(
      `SELECT (SELECT count(*) FROM audit_event WHERE org_id = $1 AND action = 'clause_sheet.published' AND target_id = $2) audits, (SELECT count(*) FROM domain_event WHERE org_id = $1 AND type = 'clause_sheet.published' AND project_id = $3) events, (SELECT count(*) FROM ledger_entry WHERE org_id = $1 AND project_id = $3 AND kind = 'clause_version') ledger`,
      [orgId, id, made.project.id]
    )
  )
  expect(effects.rows[0]).toEqual({ audits: '2', events: '2', ledger: '2' })
  expect(await (await readOne()).json()).toEqual(original)
})

test('provider failures and incomplete existing history never publish or create effects', async () => {
  const app = apps(),
    made = await project(),
    id = made.sheets[0]!.id,
    draft = await save(app, id)
  const route = routes.find((r) => r.operationId === 'getClauseSheetPublishPreview')!
  setClauseSheetPorts({
    registry: {
      load: async () => {
        throw new Error('registry unavailable')
      }
    },
    snapshots: null,
    recordedAt: null
  })
  expect((await apiRequest(app.api, request(route, id, draft.id))).status).toBe(500)
  setClauseSheetPorts({ registry: { load: async () => TEST_REGISTRY }, snapshots: null, recordedAt: null })
  await inOrg(async (tx) => {
    const r = await makeRun(tx, {
      projectId: made.project.id,
      sheetVersionId: made.sheets[0]!.liveVersionId,
      status: 'drafted',
      triggeredAt: TEST_NOW
    })
    await makeRunStep(tx, { runId: r.id, step: 'snapshot', output: {} })
  })
  const response = await apiRequest(app.api, request(route, id, draft.id))
  expect(response.status).toBe(422)
  expect(await slug(response)).toBe('not-publishable')
  const effects = await asLogin('postgres', (db) =>
    db.query<{ audits: string; events: string; ledger: string }>(
      `SELECT (SELECT count(*) FROM audit_event WHERE org_id = $1 AND action = 'clause_sheet.published' AND target_id = $2) audits, (SELECT count(*) FROM domain_event WHERE org_id = $1 AND type = 'clause_sheet.published' AND project_id = $3) events, (SELECT count(*) FROM ledger_entry WHERE org_id = $1 AND project_id = $3 AND kind = 'clause_version') ledger`,
      [orgId, id, made.project.id]
    )
  )
  expect(effects.rows[0]).toEqual({ audits: '0', events: '0', ledger: '0' })
})

test('middleware scopes idempotency by tenant and operation and hashes the selected sheet path', async () => {
  const app = apps(),
    a = await project(),
    b = await project(),
    foreign = await project(testOrg(OTHER).id)
  const key = randomUUID()
  const input = {
    as: owner,
    org: ORG,
    method: 'POST',
    path: `/v1/clause-sheets/${a.sheets[0]!.id}/drafts`,
    body: { content: raw() },
    idempotencyKey: key
  }
  const first = await apiRequest(app.v1, input)
  expect(first.status).toBe(201)
  const draft = (await first.json()) as { id: string }
  const sameTenant = await apiRequest(app.v1, { ...input, as: asSession({ org: ORG, role: 'admin' }) })
  expect(sameTenant.status).toBe(201)
  expect(await sameTenant.json()).toEqual(draft)
  const anotherSheet = await apiRequest(app.v1, { ...input, path: `/v1/clause-sheets/${b.sheets[0]!.id}/drafts` })
  expect(anotherSheet.status).toBe(422)
  expect(await slug(anotherSheet)).toBe('idempotency-mismatch')
  const otherTenant = await apiRequest(app.v1, {
    ...input,
    org: OTHER,
    as: asSession({ org: OTHER, role: 'owner' }),
    path: `/v1/clause-sheets/${foreign.sheets[0]!.id}/drafts`
  })
  expect(otherTenant.status).toBe(201)
  const preview = await apiRequest(
    app.api,
    request(
      routes.find((r) => r.operationId === 'getClauseSheetPublishPreview')!,
      a.sheets[0]!.id,
      draft.id
    )
  )
  expect(preview.status).toBe(200)
  const body = (await preview.json()) as { preview_hash: string }
  const published = await apiRequest(app.api, {
    ...request(
      routes.find((r) => r.operationId === 'publishClauseSheet')!,
      a.sheets[0]!.id,
      draft.id
    ),
    body: { draft_id: draft.id, preview_hash: body.preview_hash },
    idempotencyKey: key
  })
  expect(published.status).toBe(201)
  const viewer = await apiRequest(app.v1, { ...input, as: asSession({ org: ORG, role: 'viewer' }) })
  expect(viewer.status).toBe(403)
})
