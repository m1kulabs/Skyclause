import { randomUUID } from 'node:crypto'
import {
  analyticsEvent,
  appendLedger,
  project,
  projectGate,
  recordAudit,
  withSystem,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeNight,
  makeOrganization,
  makeProjectSource,
  makeRun,
  makeReading,
  makeShadowState,
  makeSourceState,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { memberOf } from '@skyclause/db/test/harness/index'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { archiveProject, createProject, updateProject, problemType } from '../src'
import {
  apiRequest,
  asApiKey,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'projects-home'
const OTHER = 'projects-other'

const deps = testDeps({ withTenant, recordAudit })
const { v1, api } = createTestApi({ deps })

const owner = asSession({ org: ORG, role: 'owner' })
const admin = asSession({ org: ORG, role: 'admin' })
const cliAdmin = asSession({ org: ORG, role: 'admin', via: 'bearer' })
const editor = asSession({ org: ORG, role: 'editor' })
const approver = asSession({ org: ORG, role: 'approver' })
const viewer = asSession({ org: ORG, role: 'viewer' })

let orgId: string
let otherOrgId: string

const inOrg = <T>(fn: (tx: Tx) => Promise<T>, org = orgId) => withTenant({ orgId: org, principal: memberOf(org) }, fn)

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) {
    await makeOrganization({ id: testOrg(slug).id, slug })
  }
  orgId = testOrg(ORG).id
  otherOrgId = testOrg(OTHER).id
})

describe('POST /api/orgs/{org}/projects and service seams (#137)', () => {
  test('creates a project with nullable optional fields, exact pack defaults, and idempotent replay on Idempotency-Key', async () => {
    const idempotencyKey = randomUUID()
    const payload = {
      name: 'Bukit Jalil Campus',
      slug: 'bukit-jalil-api',
      site_name: 'APU Campus',
      site_lat: 3.0553,
      site_lon: 101.7005,
      packs: ['sky', 'crowd']
    }

    const first = await apiRequest(api, {
      as: admin,
      method: 'POST',
      path: `/api/orgs/${ORG}/projects`,
      idempotencyKey,
      body: payload
    })
    expect(first.status).toBe(201)
    const created = (await first.json()) as Record<string, unknown>
    expect(created).toMatchObject({
      org_id: orgId,
      name: 'Bukit Jalil Campus',
      slug: 'bukit-jalil-api',
      time_zone: 'Asia/Kuala_Lumpur',
      public: false,
      semester_ends_on: null,
      site_name: 'APU Campus',
      site_lat: 3.0553,
      site_lon: 101.7005,
      archived_at: null,
      camera_day_start: null,
      camera_day_end: null,
      warning_area_terms: [],
      packs: [
        { pack: 'sky', enabled: true, schedule: null, sla_s: 600, sheet_id: expect.any(String) },
        { pack: 'crowd', enabled: false, schedule: null, sla_s: 7200, sheet_id: expect.any(String) }
      ]
    })

    // Replaying with the same Idempotency-Key returns the same project without creating another row or analytic.
    const replay = await apiRequest(api, {
      as: admin,
      method: 'POST',
      path: `/api/orgs/${ORG}/projects`,
      idempotencyKey,
      body: payload
    })
    expect(replay.status).toBe(201)
    const replayed = (await replay.json()) as Record<string, unknown>
    expect(replayed.id).toBe(created.id)

    const tracked = await withSystem('test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'project_created'), eq(analyticsEvent.projectId, String(created.id))))
    )
    expect(tracked).toHaveLength(1)
  })

  test('returns 422 slug-reserved, 422 slug-taken and 422 validation-failed with /slug pointer', async () => {
    for (const reserved of ['new', 'v1', 'commons']) {
      const res = await apiRequest(api, {
        as: owner,
        method: 'POST',
        path: `/api/orgs/${ORG}/projects`,
        idempotencyKey: randomUUID(),
        body: {
          name: 'Reserved Slug',
          slug: reserved,
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      })
      expect(res.status).toBe(422)
      const problem = (await res.json()) as Record<string, unknown>
      expect(problem).toMatchObject({
        type: problemType('slug-reserved'),
        status: 422,
        field: 'slug',
        reason: 'reserved',
        errors: [expect.objectContaining({ in: 'body', pointer: '/slug' })]
      })
    }

    const taken = await apiRequest(api, {
      as: admin,
      method: 'POST',
      path: `/api/orgs/${ORG}/projects`,
      idempotencyKey: randomUUID(),
      body: {
        name: 'Duplicate Slug',
        slug: 'bukit-jalil-api',
        site_name: 'APU',
        site_lat: 3.05,
        site_lon: 101.7,
        packs: ['sky']
      }
    })
    expect(taken.status).toBe(422)
    expect(await taken.json()).toMatchObject({
      type: problemType('slug-taken'),
      status: 422,
      field: 'slug',
      reason: 'taken',
      errors: [expect.objectContaining({ in: 'body', pointer: '/slug' })]
    })

    const malformed = await apiRequest(api, {
      as: admin,
      method: 'POST',
      path: `/api/orgs/${ORG}/projects`,
      idempotencyKey: randomUUID(),
      body: {
        name: 'Bad Slug',
        slug: 'UPPER_CASE',
        site_name: 'APU',
        site_lat: 3.05,
        site_lon: 101.7,
        packs: ['sky']
      }
    })
    expect(malformed.status).toBe(422)
    expect(await malformed.json()).toMatchObject({
      type: problemType('validation-failed'),
      status: 422,
      errors: [expect.objectContaining({ in: 'body', pointer: '/slug' })]
    })
  })

  test('createProject and archiveProject service seams run inside a caller transaction and roll back on caller failure', async () => {
    const rollbackSlug = 'service-seam-rollback'
    await expect(
      inOrg(async (tx) => {
        await createProject(
          { principal: memberOf(orgId), tx },
          {
            name: 'Rollback Seam',
            slug: rollbackSlug,
            site_name: 'APU',
            site_lat: 3.05,
            site_lon: 101.7,
            packs: ['sky']
          }
        )
        throw new Error('simulated onboarding failure')
      })
    ).rejects.toThrow('simulated onboarding failure')

    const survived = await inOrg((tx) => tx.select().from(project).where(eq(project.slug, rollbackSlug)))
    expect(survived).toHaveLength(0)

    const seamResult = await inOrg(async (tx) => {
      const created = await createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Caller Seam Project',
          slug: 'caller-seam',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
      const archived = await archiveProject({ principal: memberOf(orgId), tx }, { projectId: created.id })
      return { created, archived }
    })

    expect(seamResult.created.slug).toBe('caller-seam')
    expect(seamResult.archived.archived_at).toEqual(expect.any(String))
    const rollbackArchiveTarget = await inOrg((tx) =>
      createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Existing Archive Rollback',
          slug: 'existing-archive-rollback',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
    )
    await expect(
      inOrg(async (tx) => {
        await archiveProject({ principal: memberOf(orgId), tx }, { projectId: rollbackArchiveTarget.id })
        throw new Error('existing project archive rollback')
      })
    ).rejects.toThrow('existing project archive rollback')
    expect(await inOrg((tx) => projectGate(tx, rollbackArchiveTarget.id))).toBe('open')

    await expect(
      inOrg(async (tx) => {
        const target = await createProject(
          { principal: memberOf(orgId), tx },
          {
            name: 'Archive Rollback',
            slug: 'archive-rollback',
            site_name: 'APU',
            site_lat: 3.05,
            site_lon: 101.7,
            packs: ['sky']
          }
        )
        await archiveProject({ principal: memberOf(orgId), tx }, { projectId: target.id })
        throw new Error('caller archive rollback')
      })
    ).rejects.toThrow('caller archive rollback')
    expect(await inOrg((tx) => tx.select().from(project).where(eq(project.slug, 'archive-rollback')))).toEqual([])
  })
})

describe('PATCH /api/projects/{id}, archive, restore and ledger read while archived (#137)', () => {
  test('refuses unsupported packs/rota writes before any owned mutation, including empty arrays', async () => {
    const created = await inOrg((tx) =>
      createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Unsupported Settings',
          slug: 'unsupported-settings',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
    )
    const readRow = () => inOrg(async (tx) => (await tx.select().from(project).where(eq(project.id, created.id)))[0]!)
    const before = await readRow()
    for (const patch of [
      { packs: [] },
      { packs: [{ pack: 'sky' as const, enabled: false, schedule: null, sla_s: 900 }] },
      { rota_override: [] },
      { rota_override: null }
    ]) {
      const field = 'packs' in patch ? 'packs' : 'rota_override'
      const response = await apiRequest(api, {
        as: admin,
        org: ORG,
        method: 'PATCH',
        path: `/api/projects/${created.id}`,
        body: { name: 'Must not change', ...patch }
      })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        type: problemType('validation-failed'),
        field,
        errors: [expect.objectContaining({ pointer: `/${field}` })]
      })
      expect(await readRow()).toEqual(before)
      await expect(
        inOrg((tx) =>
          updateProject({ principal: memberOf(orgId), tx }, created.id, { name: 'Must not change', ...patch })
        )
      ).rejects.toMatchObject({ status: 422 })
      expect(await readRow()).toEqual(before)
    }
    const denied = await apiRequest(api, {
      as: editor,
      org: ORG,
      method: 'PATCH',
      path: `/api/projects/${created.id}`,
      body: { packs: [] }
    })
    expect(denied.status).toBe(403)
    const missing = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'PATCH',
      path: `/api/projects/${randomUUID()}`,
      body: { packs: [] }
    })
    expect(missing.status).toBe(404)
  })

  test('updates owned fields, enforces public_pages.edit on public toggle, and archives/restores idempotently', async () => {
    const createRes = await apiRequest(api, {
      as: cliAdmin,
      method: 'POST',
      path: `/api/orgs/${ORG}/projects`,
      idempotencyKey: randomUUID(),
      body: {
        name: 'Lifecycle API',
        slug: 'lifecycle-api',
        site_name: 'Site 1',
        site_lat: 3.05,
        site_lon: 101.7,
        packs: ['sky']
      }
    })
    expect(createRes.status).toBe(201)
    const created = (await createRes.json()) as { id: string }

    const patchRes = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'PATCH',
      path: `/api/projects/${created.id}`,
      body: {
        name: 'Lifecycle API Renamed',
        slug: 'lifecycle-api-renamed',
        time_zone: 'Asia/Singapore',
        semester_ends_on: '2027-01-15',
        site_name: 'Site 2',
        site_lat: 3.06,
        site_lon: 101.71,
        camera_day_start: '07:00',
        camera_day_end: '19:00',
        warning_area_terms: ['Kuala Lumpur', 'Petaling'],
        public: true
      }
    })
    expect(patchRes.status).toBe(200)
    expect(await patchRes.json()).toMatchObject({
      id: created.id,
      name: 'Lifecycle API Renamed',
      slug: 'lifecycle-api-renamed',
      time_zone: 'Asia/Singapore',
      semester_ends_on: '2027-01-15',
      site_name: 'Site 2',
      site_lat: 3.06,
      site_lon: 101.71,
      camera_day_start: '07:00',
      camera_day_end: '19:00',
      warning_area_terms: ['Kuala Lumpur', 'Petaling'],
      public: true,
      rota_override: null
    })

    // When public_pages.edit is denied, toggling public returns 403 insufficient-scope.
    const noPublicEditApi = createTestApi({
      deps: testDeps({
        withTenant,
        recordAudit,
        can: (principal, statement, target) =>
          statement === 'public_pages.edit' ? false : testCan(principal, statement, target)
      })
    })
    const deniedPublic = await apiRequest(noPublicEditApi.api, {
      as: admin,
      org: ORG,
      method: 'PATCH',
      path: `/api/projects/${created.id}`,
      body: { public: false }
    })
    expect(deniedPublic.status).toBe(403)
    const deniedMixedPublic = await apiRequest(noPublicEditApi.api, {
      as: admin,
      org: ORG,
      method: 'PATCH',
      path: `/api/projects/${created.id}`,
      body: { public: false, packs: [] }
    })
    expect(deniedMixedPublic.status).toBe(403)

    // Append a ledger entry before archiving, then archive twice and verify ledger stays readable.
    await inOrg((tx) => appendLedger(tx, { projectId: created.id, kind: 'call_sent', refs: {}, body: { ok: true } }))

    const arch1 = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'POST',
      path: `/api/projects/${created.id}/archive`
    })
    expect(arch1.status).toBe(200)
    const arch1Body = (await arch1.json()) as { archived_at: string | null }
    expect(arch1Body.archived_at).toEqual(expect.any(String))

    deps.clock.advance(60_000)
    const arch2 = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'POST',
      path: `/api/projects/${created.id}/archive`
    })
    expect(arch2.status).toBe(200)
    const arch2Body = (await arch2.json()) as { archived_at: string | null }
    expect(arch2Body.archived_at).toBe(arch1Body.archived_at)
    expect(await inOrg((tx) => projectGate(tx, created.id))).toBe('archived')

    const ledgerRes = await apiRequest(v1, {
      as: viewer,
      org: ORG,
      method: 'GET',
      path: `/v1/projects/${created.id}/ledger`
    })
    expect(ledgerRes.status).toBe(200)
    const ledgerBody = (await ledgerRes.json()) as { data: Array<{ id: string }> }
    expect(ledgerBody.data).toHaveLength(1)

    const rest1 = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'POST',
      path: `/api/projects/${created.id}/restore`
    })
    expect(rest1.status).toBe(200)
    expect(((await rest1.json()) as { archived_at: string | null }).archived_at).toBeNull()
    expect(await inOrg((tx) => projectGate(tx, created.id))).toBe('open')

    const rest2 = await apiRequest(api, {
      as: admin,
      org: ORG,
      method: 'POST',
      path: `/api/projects/${created.id}/restore`
    })
    expect(rest2.status).toBe(200)
    expect(((await rest2.json()) as { archived_at: string | null }).archived_at).toBeNull()
  })
})

describe('GET /v1/projects and GET /v1/projects/{id} with D3 summary and narrowed grants (#137)', () => {
  test('gets a project, filters by slug, paginates, and computes D3 summary', async () => {
    const { projectId, highCallId, crowdBundleId } = await inOrg(async (tx) => {
      const created = await createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Summary API Project',
          slug: 'summary-api-project',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky', 'crowd']
        },
        { now: deps.now() }
      )
      const bound = await makeProjectSource(tx, { projectId: created.id, role: 'rain_gauge' })
      await makeSourceState(tx, {
        sourceId: bound.sourceId,
        state: 'fresh',
        since: new Date(deps.now().getTime() - 120_000)
      })
      await makeReading(tx, { sourceId: bound.sourceId, observedAt: new Date(deps.now().getTime() - 120_000) })
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'sky',
        scopeKind: 'site',
        verdict: {
          scope: { kind: 'site', id: null },
          pack: 'sky',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })
      const win = await makeWindow(tx, {
        projectId: created.id,
        startsAt: new Date(deps.now().getTime() - 1_800_000),
        endsAt: new Date(deps.now().getTime() + 3_600_000)
      })
      const skyBundle = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: created.id, pack: 'sky' })).id,
        pack: 'sky',
        state: 'sent'
      })
      const highCall = await makeCall(tx, {
        bundleId: skyBundle.id,
        windowId: win.id,
        shadow: {
          scope: { kind: 'window', id: win.id },
          pack: 'sky',
          mode: 'hybrid_recommended',
          watch: true,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        mode: 'hybrid_recommended',
        watch: true,
        state: 'sent',
        approvedAt: new Date(deps.now().getTime() - 600_000),
        sentAt: new Date(deps.now().getTime() - 595_000)
      })
      const pastNight = await makeNight(tx, {
        projectId: created.id,
        date: '2026-11-01',
        doors: new Date('2026-11-01T10:00:00Z'),
        show: new Date('2026-11-01T12:00:00Z'),
        arrivalStart: new Date('2026-11-01T09:00:00Z'),
        arrivalEnd: new Date('2026-11-01T12:00:00Z'),
        exitStart: new Date('2026-11-01T14:00:00Z'),
        exitEnd: new Date('2026-11-01T16:00:00Z')
      })
      const crowdBundle = await makeBundle(tx, {
        runId: (await makeRun(tx, { projectId: created.id, pack: 'crowd' })).id,
        pack: 'crowd',
        state: 'sent'
      })
      await makeCall(tx, {
        bundleId: crowdBundle.id,
        nightId: pastNight.id,
        shadow: {
          scope: { kind: 'night', id: pastNight.id },
          pack: 'crowd',
          mode: 'surge_night',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        },
        mode: 'surge_night',
        watch: false,
        state: 'sent',
        expiresAt: new Date('2026-11-01T09:00:00Z'),
        approvedAt: new Date('2026-11-01T08:00:00Z'),
        sentAt: new Date('2026-11-01T08:00:05Z')
      })
      await makeShadowState(tx, {
        projectId: created.id,
        pack: 'crowd',
        scopeKind: 'site',
        verdict: {
          scope: { kind: 'site', id: null },
          pack: 'crowd',
          mode: 'normal',
          watch: false,
          no_call: null,
          recommendations: [],
          clauses: [],
          open_from: null
        }
      })
      return { projectId: created.id, highCallId: highCall.id, crowdBundleId: crowdBundle.id }
    })

    const single = await apiRequest(v1, {
      as: viewer,
      org: ORG,
      method: 'GET',
      path: `/v1/projects/${projectId}`
    })
    expect(single.status).toBe(200)
    expect(await single.json()).toMatchObject({
      id: projectId,
      slug: 'summary-api-project'
    })

    const withSummary = await apiRequest(v1, {
      as: viewer,
      org: ORG,
      method: 'GET',
      path: '/v1/projects',
      query: { slug: 'summary-api-project', include: 'summary' }
    })
    expect(withSummary.status).toBe(200)
    const pageBody = (await withSummary.json()) as {
      data: Array<{ id: string; summary: Record<string, unknown> }>
      next_cursor: string | null
    }
    expect(pageBody.data).toHaveLength(1)
    expect(pageBody.data[0]!.summary).toMatchObject({
      pack_states: [
        {
          pack: 'sky',
          basis: 'approved_call',
          call_id: highCallId,
          mode: 'hybrid_recommended',
          watch: true,
          no_call: null
        },
        {
          pack: 'crowd',
          basis: 'engine_verdict',
          call_id: null,
          mode: 'normal',
          watch: false,
          no_call: null
        }
      ],
      windows_at_risk: 1,
      signal_health: {
        state: 'fresh',
        inputs_reporting: 1,
        oldest_age_s: 120
      },
      latest_bundle: expect.objectContaining({ id: crowdBundleId }),
      next_night: null,
      next_storm_date: null,
      next_action: null
    })

    // Pagination check with limit=1
    const page1 = await apiRequest(v1, {
      as: viewer,
      org: ORG,
      method: 'GET',
      path: '/v1/projects',
      query: { limit: '1' }
    })
    expect(page1.status).toBe(200)
    const p1Body = (await page1.json()) as { data: Array<{ id: string }>; next_cursor: string | null }
    expect(p1Body.data).toHaveLength(1)
    expect(p1Body.next_cursor).toEqual(expect.any(String))

    const page2 = await apiRequest(v1, {
      as: viewer,
      org: ORG,
      method: 'GET',
      path: '/v1/projects',
      query: { limit: '1', cursor: p1Body.next_cursor! }
    })
    expect(page2.status).toBe(200)
    const p2Body = (await page2.json()) as { data: Array<{ id: string }> }
    expect(p2Body.data).toHaveLength(1)
    expect(p2Body.data[0]!.id).not.toBe(p1Body.data[0]!.id)
  })

  test('narrowed OAuth grant and reviewer share link only see permitted projects in the same org', async () => {
    const [p1, p2] = await inOrg(async (tx) => {
      const a = await createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Scoped One',
          slug: 'scoped-one',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
      const b = await createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Scoped Two',
          slug: 'scoped-two',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
      return [a, b] as const
    })

    const narrowedOAuth = asOAuth({ org: ORG, role: 'viewer', projectIds: [p1.id], scopes: ['read'] })
    const listRes = await apiRequest(v1, {
      as: narrowedOAuth,
      org: ORG,
      method: 'GET',
      path: '/v1/projects'
    })
    expect(listRes.status).toBe(200)
    const listed = (await listRes.json()) as { data: Array<{ id: string }> }
    expect(listed.data.map((d) => d.id)).toEqual([p1.id])

    const allowedGet = await apiRequest(v1, {
      as: narrowedOAuth,
      org: ORG,
      method: 'GET',
      path: `/v1/projects/${p1.id}`
    })
    expect(allowedGet.status).toBe(200)

    const deniedGet = await apiRequest(v1, {
      as: narrowedOAuth,
      org: ORG,
      method: 'GET',
      path: `/v1/projects/${p2.id}`
    })
    expect(deniedGet.status).toBe(404)

    const shareReviewer = asShareLink({ org: ORG, projectId: p1.id, access: 'reviewer' })
    const shareList = await apiRequest(v1, {
      as: shareReviewer,
      org: ORG,
      method: 'GET',
      path: '/v1/projects'
    })
    expect(shareList.status).toBe(200)
    expect(((await shareList.json()) as { data: Array<{ id: string }> }).data.map((d) => d.id)).toEqual([p1.id])

    const shareOther = await apiRequest(v1, {
      as: shareReviewer,
      org: ORG,
      method: 'GET',
      path: `/v1/projects/${p2.id}`
    })
    expect(shareOther.status).toBe(404)
  })
})

describe('permissions, surface gates and cross-org 404 (#137)', () => {
  test('denies Editor/Approver/Viewer and API key/OAuth tokens on /api project writes', async () => {
    const target = await inOrg((tx) =>
      createProject(
        { principal: memberOf(orgId), tx },
        {
          name: 'Auth Target',
          slug: 'auth-target',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      )
    )

    for (const nonManager of [editor, approver, viewer]) {
      const createDenied = await apiRequest(api, {
        as: nonManager,
        method: 'POST',
        path: `/api/orgs/${ORG}/projects`,
        idempotencyKey: randomUUID(),
        body: {
          name: 'Denied',
          slug: 'denied-slug',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      })
      expect(createDenied.status).toBe(403)

      const patchDenied = await apiRequest(api, {
        as: nonManager,
        org: ORG,
        method: 'PATCH',
        path: `/api/projects/${target.id}`,
        body: { name: 'Denied Patch' }
      })
      expect(patchDenied.status).toBe(403)
    }

    const apiKey = asApiKey({ org: ORG, role: 'owner', scopes: ['read', 'draft', 'admin'] })
    const oauthToken = asOAuth({ org: ORG, role: 'owner', scopes: ['read', 'draft'] })
    for (const tokenPrincipal of [apiKey, oauthToken]) {
      const tokenWrite = await apiRequest(api, {
        as: tokenPrincipal,
        org: ORG,
        method: 'PATCH',
        path: `/api/projects/${target.id}`,
        body: { name: 'Denied Token' }
      })
      expect(tokenWrite.status).toBe(403)
    }
  })

  test('every #137 operation answers 404 for another organisation', async () => {
    const otherProject = await inOrg(
      (tx) =>
        createProject(
          { principal: memberOf(otherOrgId), tx },
          {
            name: 'Other Org Project',
            slug: 'other-org-project',
            site_name: 'APU',
            site_lat: 3.05,
            site_lon: 101.7,
            packs: ['sky']
          }
        ),
      otherOrgId
    )

    const cases = [
      crossOrgCase('createProject', {
        app: api,
        as: admin,
        params: { org: OTHER },
        body: {
          name: 'Cross Org Create',
          slug: 'cross-org-create',
          site_name: 'APU',
          site_lat: 3.05,
          site_lon: 101.7,
          packs: ['sky']
        }
      }),
      crossOrgCase('updateProject', {
        app: api,
        as: admin,
        org: ORG,
        params: { id: otherProject.id },
        body: { name: 'Cross Org Rename' }
      }),
      crossOrgCase('archiveProject', {
        app: api,
        as: admin,
        org: ORG,
        params: { id: otherProject.id }
      }),
      crossOrgCase('restoreProject', {
        app: api,
        as: admin,
        org: ORG,
        params: { id: otherProject.id }
      }),
      crossOrgCase('listProjects', {
        app: v1,
        as: viewer,
        org: OTHER,
        params: {}
      }),
      crossOrgCase('getProject', {
        app: v1,
        as: viewer,
        org: ORG,
        params: { id: otherProject.id }
      })
    ]

    for (const c of cases) {
      await c.run()
    }
  })
})
