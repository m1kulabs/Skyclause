// #161 c-grades: GET /v1/projects/{id}/grades and /review-items and PATCH /v1/review-items/{id} on the #79 §7 test
// database, through createTestApi with the real withTenant (only the auth seams are doubles). Grades are written with
// the graders' own recordGrade.
import type { z } from '@hono/zod-openapi'
import { REGISTRY, type Operations } from '@skyclause/contracts'
import {
  REVIEW_REASONS,
  clauseSheet,
  recordAudit,
  recordGrade,
  systemPrincipal,
  withTenant,
  type Tx
} from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeClauseSheet,
  makeFeatureFlag,
  makeForecast,
  makeListing,
  makeNight,
  makeOrganization,
  makeProject,
  makeProjectSource,
  makeRun,
  makeSheetVersion,
  makeSource,
  makeSourceState,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { sheetVersionIn } from '@skyclause/db/test/factories/rows'
import { eq } from 'drizzle-orm'
import { asLogin, expectOneAudit } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { apiRequest, asSession, createTestApi, crossOrgCase, testDeps, testOrg } from './harness'

// TEST_NOW is 10:00 MYT on 8 November 2026: a night on the 7th is past, one on the 8th is tonight.
const ORG = 'grades-home'
const PLAIN = 'grades-plain'
const OTHER = 'grades-other'
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit }) })
const viewer = asSession({ org: ORG, role: 'viewer' })
const approver = asSession({ org: ORG, role: 'approver' })

const asSystem = <T>(org: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(org).id, principal: systemPrincipal('test-grades') }, fn)
const get = (path: string, query?: Record<string, string>, o: { as?: typeof viewer; org?: string } = {}) =>
  apiRequest(v1, { as: o.as ?? viewer, method: 'GET', path, org: o.org ?? ORG, query })
const patch = (id: string, body: unknown, as = approver) =>
  apiRequest(v1, { as, method: 'PATCH', path: `/v1/review-items/${id}`, org: ORG, body })

type GradePage = z.infer<Operations['listGrades']['responses'][200]['content']['application/json']['schema']>
type ItemPage = z.infer<Operations['listReviewItems']['responses'][200]['content']['application/json']['schema']>
type Item = z.infer<Operations['updateReviewItem']['responses'][200]['content']['application/json']['schema']>

beforeAll(async () => {
  for (const slug of [ORG, PLAIN, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  for (const slug of [ORG, OTHER]) {
    await asSystem(slug, (tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true }))
  }
})

const quiet = { modeDiff: 0, noCall: false, agrees: true, staleInputs: false, ledger: false }

/**
 * A project with a Sky call graded `false_alarm` on 5 November (review item: `false_alarm`) and a callless window
 * graded with `no_call` on 6 November; with `crowd`, SP17 bound, a night graded out of band on the 4th, a listed night
 * waiting for its file on the 7th and tonight's night.
 */
async function scene(org = ORG, o: { crowd?: boolean } = {}) {
  return asSystem(org, async (tx) => {
    const { id: projectId } = await makeProject(tx)
    const sheetVersionId = await sheetVersionIn(tx, projectId)
    const window = await makeWindow(tx, { projectId })
    const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId, status: 'drafted' })).id })
    const call = await makeCall(tx, { bundleId: bundle.id, windowId: window.id, mode: 'commute_disruption' })
    const sky = await recordGrade(tx, {
      ...quiet,
      projectId,
      pack: 'sky',
      callId: call.id,
      windowId: window.id,
      sheetVersionId,
      outcome: 'false_alarm',
      proposedMode: 'commute_disruption',
      observedMode: 'normal',
      localDate: '2026-11-05',
      reasons: ['false_alarm']
    })
    const fired = await makeWindow(tx, { projectId })
    const callless = await recordGrade(tx, {
      ...quiet,
      projectId,
      pack: 'sky',
      windowId: fired.id,
      sheetVersionId,
      outcome: 'correct_normal',
      observedMode: 'normal',
      agrees: false,
      localDate: '2026-11-06',
      reasons: ['no_call']
    })
    const base = { projectId, sky: sky!, callless: callless!, windowId: fired.id }
    if (!o.crowd) return { ...base, crowd: null, graded: null, pending: null, crowdVersionId: null }
    const crowdSheet = await makeClauseSheet(tx, { projectId, pack: 'crowd' })
    const crowdVersion = await makeSheetVersion(tx, { sheetId: crowdSheet.id, status: 'published' })
    await tx.update(clauseSheet).set({ liveVersionId: crowdVersion.id }).where(eq(clauseSheet.id, crowdSheet.id))
    const station = await makeSource(tx, { kind: 'rapidrail_od', externalId: `SP17 ${projectId}` })
    await makeProjectSource(tx, { projectId, sourceId: station.id, role: 'rail_station' })
    await makeSourceState(tx, { sourceId: station.id, pendingUntil: new Date('2026-11-08T14:00:00Z') })
    const listed = async (date: string) => {
      const night = await makeNight(tx, { projectId, date, arrivalStart: new Date(`${date}T10:00:00Z`) })
      await makeListing(tx, { projectId, nightId: night.id, state: 'listed' })
      const forecast = await makeForecast(tx, {
        nightId: night.id,
        forecast: 27_044,
        bandLow: 19_315,
        bandHigh: 32_100,
        createdAt: new Date(`${date}T01:00:00Z`)
      })
      return { night, forecast }
    }
    const graded = await listed('2026-11-04')
    const crowd = await recordGrade(tx, {
      ...quiet,
      projectId,
      pack: 'crowd',
      nightId: graded.night.id,
      sheetVersionId,
      outcome: 'out_of_band',
      agrees: false,
      localDate: '2026-11-04',
      actual: 33_804,
      forecastId: graded.forecast.id,
      bandLow: 19_315,
      bandHigh: 32_100,
      reasons: ['out_of_band']
    })
    const pending = await listed('2026-11-07')
    await listed('2026-11-08')
    return { ...base, crowd: crowd!, graded, pending, crowdVersionId: crowdVersion.id }
  })
}

describe('GET /v1/projects/{id}/grades', () => {
  test('lists grades newest first, with a listed night still waiting for its file as pending (ANL-3)', async () => {
    const s = await scene(ORG, { crowd: true })
    const response = await get(`/v1/projects/${s.projectId}/grades`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as GradePage
    expect(body.data.map((g) => [g.local_date, g.outcome])).toEqual([
      ['2026-11-07', 'pending'],
      ['2026-11-06', 'correct_normal'],
      ['2026-11-05', 'false_alarm'],
      ['2026-11-04', 'out_of_band']
    ])
    expect(body.data[0]).toMatchObject({
      id: s.pending!.night.id,
      night_id: s.pending!.night.id,
      call_id: null,
      pack: 'crowd',
      actual: null,
      reading_ids: [],
      pending_until: '2026-11-08T14:00:00Z',
      sheet_version_id: s.crowdVersionId,
      graded_at: '2026-11-08T02:00:00Z',
      forecast: { id: s.pending!.forecast.id, forecast: 27_044, band_low: 19_315, band_high: 32_100 }
    })
    expect(body.data[2]).toMatchObject({
      id: s.sky.gradeId,
      proposed_mode: 'commute_disruption',
      observed_mode: 'normal',
      forecast: null
    })
    expect(body.data[3]).toMatchObject({
      id: s.crowd!.gradeId,
      actual: 33_804,
      forecast: { id: s.graded!.forecast.id, band_high: 32_100 }
    })
    expect(body.data[3]).not.toHaveProperty('pending_until')
  })

  test('filters by pack, outcome and dates, and pages through grades and pending nights alike', async () => {
    const s = await scene(ORG, { crowd: true })
    const path = `/v1/projects/${s.projectId}/grades`
    const outcomes = async (query: Record<string, string>) =>
      ((await (await get(path, query)).json()) as GradePage).data.map((g) => g.outcome)
    expect(await outcomes({ pack: 'sky' })).toEqual(['correct_normal', 'false_alarm'])
    expect(await outcomes({ outcome: 'pending' })).toEqual(['pending'])
    expect(await outcomes({ outcome: 'out_of_band' })).toEqual(['out_of_band'])
    expect(await outcomes({ from: '2026-11-05', to: '2026-11-06' })).toEqual(['correct_normal', 'false_alarm'])

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const body = (await (await get(path, { limit: '1', ...(cursor ? { cursor } : {}) })).json()) as GradePage
      seen.push(...body.data.map((g) => g.outcome))
      cursor = body.next_cursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['pending', 'correct_normal', 'false_alarm', 'out_of_band'])
  })

  test('with pack_crowd off, a Crowd read answers 403 feature-off and the list holds Sky only', async () => {
    const s = await scene(PLAIN, { crowd: true })
    const plain = asSession({ org: PLAIN, role: 'viewer' })
    const path = `/v1/projects/${s.projectId}/grades`
    const refused = await get(path, { pack: 'crowd' }, { as: plain, org: PLAIN })
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ type: expect.stringMatching(/\/feature-off$/) })
    const body = (await (await get(path, undefined, { as: plain, org: PLAIN })).json()) as GradePage
    expect(body.data.map((g) => g.pack)).toEqual(['sky', 'sky'])
  })
})

describe('review items', () => {
  test('ANL-2 and ANL-4: each item with its grade, reasons and an editable explanation', async () => {
    const s = await scene()
    const response = await get(`/v1/projects/${s.projectId}/review-items`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as ItemPage
    expect(body.data).toEqual([
      {
        id: s.callless.reviewItemId,
        grade_id: s.callless.gradeId,
        state: 'open',
        explanation: '',
        reasons: ['no_call'],
        explained_by: null,
        explained_at: null,
        opened_at: expect.any(String),
        grade: expect.objectContaining({ id: s.callless.gradeId, call_id: null, window_id: s.windowId })
      },
      expect.objectContaining({ id: s.sky.reviewItemId, reasons: ['false_alarm'] })
    ])
    const open = (await (await get(`/v1/projects/${s.projectId}/review-items`, { state: 'open' })).json()) as ItemPage
    expect(open.data).toHaveLength(2)
  })

  test('ANL-2: ?reason=no_call lists each window whose shadow verdict fired with no approved call', async () => {
    const s = await scene()
    const path = `/v1/projects/${s.projectId}/review-items`
    const byReason = async (reason: string) =>
      ((await (await get(path, { reason })).json()) as ItemPage).data.map((item) => item.id)
    expect(await byReason('no_call')).toEqual([s.callless.reviewItemId])
    expect(await byReason('false_alarm')).toEqual([s.sky.reviewItemId])
    expect(await byReason('out_of_band')).toEqual([])
    expect((await get(path, { reason: 'late' })).status).toBe(422)
  })

  test('an Approver sets the explanation; who and when are recorded, and it reads back', async () => {
    const s = await scene()
    const response = await patch(s.callless.reviewItemId!, { explanation: 'Gauge 0232901RF was down for repair' })
    expect(response.status).toBe(200)
    const accountId = approver.kind === 'session' ? approver.accountId : ''
    expect((await response.json()) as Item).toMatchObject({
      id: s.callless.reviewItemId,
      explanation: 'Gauge 0232901RF was down for repair',
      explained_by: accountId,
      explained_at: '2026-11-08T02:00:00Z',
      reasons: ['no_call']
    })
    const listed = (await (await get(`/v1/projects/${s.projectId}/review-items`)).json()) as ItemPage
    expect(listed.data[0]).toMatchObject({
      explanation: 'Gauge 0232901RF was down for repair',
      explained_by: accountId
    })
  })

  test('the PATCH is audited once, with when it was explained and none of the text', async () => {
    const s = await scene()
    await patch(s.sky.reviewItemId!, { explanation: 'Rain stopped at 15:20 MYT, before the release wave' })
    const audit = await expectOneAudit('review_item.explained', { targetId: s.sky.reviewItemId! })
    expect(audit).toMatchObject({
      org_id: testOrg(ORG).id,
      project_id: s.projectId,
      actor_type: 'account',
      target_type: 'review_item',
      before: { explained_at: null },
      after: { explained_at: '2026-11-08T02:00:00Z' }
    })
    expect(JSON.stringify(audit)).not.toContain('Rain stopped')

    await patch(s.sky.reviewItemId!, { explanation: 'Rain stopped at 15:20 MYT' })
    const audits = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        "SELECT before, after FROM audit_event WHERE action = 'review_item.explained' AND target_id = $1 ORDER BY id",
        [s.sky.reviewItemId]
      )
      return rows
    })
    expect(audits).toEqual([
      { before: { explained_at: null }, after: { explained_at: '2026-11-08T02:00:00Z' } },
      { before: { explained_at: '2026-11-08T02:00:00Z' }, after: { explained_at: '2026-11-08T02:00:00Z' } }
    ])
  })

  test('a refused or hidden PATCH writes no audit row', async () => {
    const s = await scene()
    await patch(s.sky.reviewItemId!, { state: 'closed' })
    const elsewhere = await scene(OTHER)
    expect((await patch(elsewhere.sky.reviewItemId!, { explanation: 'x' })).status).toBe(404)
    const count = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM audit_event WHERE action = 'review_item.explained' AND target_id = ANY($1)",
        [[s.sky.reviewItemId, elsewhere.sky.reviewItemId]]
      )
      return rows[0].n as number
    })
    expect(count).toBe(0)
  })

  test('only the explanation changes: a state in the body is refused', async () => {
    const s = await scene()
    const response = await patch(s.sky.reviewItemId!, { state: 'closed' })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ type: expect.stringMatching(/\/validation-failed$/) })
  })

  test('the reasons the contract lists are the ones the table stores', () => {
    const route = REGISTRY.find((r) => r.operationId === 'listReviewItems')!
    const schema = route.responses[200].content['application/json'].schema as unknown as z.ZodObject<{
      data: z.ZodArray<z.ZodObject<{ reasons: z.ZodOptional<z.ZodArray<z.ZodEnum>> }>>
    }>
    expect(schema.shape.data.element.shape.reasons.unwrap().element.options).toEqual([...REVIEW_REASONS])
  })
})

describe('access', () => {
  test('a Viewer reads both lists; an Editor’s PATCH is 403', async () => {
    const s = await scene()
    for (const path of ['grades', 'review-items']) {
      expect((await get(`/v1/projects/${s.projectId}/${path}`)).status).toBe(200)
    }
    const editor = asSession({ org: ORG, role: 'editor' })
    expect((await patch(s.sky.reviewItemId!, { explanation: 'x' }, editor)).status).toBe(403)
    expect((await patch(s.sky.reviewItemId!, { explanation: 'x' }, viewer)).status).toBe(403)
  })

  test('each operation answers 404 for another organisation’s rows and for unknown IDs', async () => {
    const elsewhere = await scene(OTHER)
    for (const operationId of ['listGrades', 'listReviewItems']) {
      await crossOrgCase(operationId, { app: v1, as: viewer, org: ORG, params: { id: elsewhere.projectId } }).run()
    }
    await crossOrgCase('updateReviewItem', {
      app: v1,
      as: approver,
      org: ORG,
      params: { id: elsewhere.sky.reviewItemId! },
      body: { explanation: 'x' }
    }).run()
    for (const id of ['not-a-uuid', '01900000-0000-7000-8000-000000000000']) {
      expect((await get(`/v1/projects/${id}/grades`)).status).toBe(404)
      expect((await get(`/v1/projects/${id}/review-items`)).status).toBe(404)
      expect((await patch(id, { explanation: 'x' })).status).toBe(404)
    }
  })
})
