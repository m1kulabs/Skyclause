// #162 c-analysis-api: GET /v1/projects/{id}/analysis, GET /v1/analysis and POST /v1/projects/{id}/analysis/what-if
// on the #79 §7 test database, through createTestApi with the real withTenant (the auth seams and, for the what-if,
// #136's replay, #131's check, #133's history and the indicator registry are doubles). Figures are written by the
// analysis-materialise job's own materialiseAnalysis from factory rows.
import type { z } from '@hono/zod-openapi'
import { check, replay, type CheckedSheet, type IndicatorRegistry } from '@skyclause/clauses'
import type { Operations, Principal } from '@skyclause/contracts'
import { grade, materialiseAnalysis, recordAudit, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import {
  makeBundle,
  makeCall,
  makeFeatureFlag,
  makeGrade,
  makeNight,
  makeOrganization,
  makeProject,
  makeRun,
  makeSource,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { sheetVersionIn } from '@skyclause/db/test/factories/rows'
import { asLogin } from '@skyclause/db/test/harness/index'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
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
import { setWhatIfEngine } from '../src/services/analysis'

// TEST_NOW is 10:00 MYT on 8 November 2026; the figures were materialised at 00:30 MYT that day.
const ORG = 'analysis-home'
const PLAIN = 'analysis-plain'
const OTHER = 'analysis-other'
const MATERIALISED = new Date('2026-11-07T16:30:00Z')
// #94's `can` binds OAuth grants to their projects; the harness's stand-in doesn't, so this one adds it.
const can: typeof testCan = (p, s, t) =>
  testCan(p, s, t) &&
  (p.kind !== 'oauth' || p.projectIds === 'all' || !t?.projectId || p.projectIds.includes(t.projectId)) &&
  (p.kind !== 'share_link' || !t?.projectId || p.projectId === t.projectId)
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, can }) })
const viewer = asSession({ org: ORG, role: 'viewer' })

const asSystem = <T>(org: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(org).id, principal: systemPrincipal('analysis-materialise') }, fn)
const get = (path: string, query?: Record<string, string>, o: { as?: Principal; org?: string } = {}) =>
  apiRequest(v1, { as: o.as ?? viewer, method: 'GET', path, org: o.org ?? ORG, query })

type Analysis = z.infer<Operations['getProjectAnalysis']['responses'][200]['content']['application/json']['schema']>
type Metric = Analysis['metrics'][number]

beforeAll(async () => {
  for (const slug of [ORG, PLAIN, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  for (const slug of [ORG, OTHER]) {
    await asSystem(slug, (tx) => makeFeatureFlag(tx, { key: 'pack_crowd', enabled: true }))
  }
})

const newProject = (org = ORG) =>
  asSystem(org, (tx) => makeProject(tx, { createdAt: new Date('2026-09-01T00:00:00Z') })).then((p) => p.id)

/**
 * A Sky call of a 15:00 MYT window on `date`, approved at 14:00 and sent at 14:05, whose shadow verdict fired
 * `storm_watch`, graded `outcome` at 23:55 MYT that day (or at `gradedAt`).
 */
async function graded(
  org: string,
  projectId: string,
  outcome: 'hit' | 'false_alarm' | 'miss',
  date = '2026-11-05',
  gradedAt = new Date(`${date}T15:55:00Z`)
) {
  return asSystem(org, async (tx) => {
    const window = await makeWindow(tx, { projectId, startsAt: new Date(`${date}T07:00:00Z`) })
    const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId, status: 'drafted' })).id })
    const call = await makeCall(tx, {
      bundleId: bundle.id,
      windowId: window.id,
      shadow: { clauses: [{ key: 'storm_watch', result: 'fired' }] },
      approvedAt: new Date(`${date}T06:00:00Z`),
      sentAt: new Date(`${date}T06:05:00Z`)
    })
    return makeGrade(tx, { callId: call.id, windowId: window.id, outcome, localDate: date, createdAt: gradedAt })
  })
}

const materialise = (org: string, projectId: string, now = MATERIALISED) =>
  asSystem(org, (tx) => materialiseAnalysis(tx, { projectId, now }))

/** Every metric object in a body, wherever it sits. */
function metricsIn(body: Analysis): Metric[] {
  return [...body.metrics, ...body.series.flatMap((s) => s.metrics), ...(body.evidence_minutes ?? [])] as Metric[]
}

describe('GET /v1/projects/{id}/analysis', () => {
  test('ANL-5: every figure carries n, and n = 0 has no value and no interval; a new project is n = 0 everywhere', async () => {
    const projectId = await newProject()
    for (const materialised of [false, true]) {
      if (materialised) await materialise(ORG, projectId)
      const response = await get(`/v1/projects/${projectId}/analysis`)
      expect(response.status).toBe(200)
      const body = (await response.json()) as Analysis
      expect(body.metrics.length).toBeGreaterThan(0)
      expect(body.evidence_minutes!.map((m) => m.metric)).toEqual(['evidence_minutes_p50', 'evidence_minutes_p95'])
      for (const m of metricsIn(body)) {
        expect(m).toMatchObject({ n: 0, value: null, low: null, high: null })
      }
      expect(body).toMatchObject({ series: [], grades: { data: [], next_cursor: null }, kill_line_exceeded: false })
      // 30 days by default, ending on the project's local date; "Updated daily" reads the last run, or the
      // project's creation when no run has reached it yet (when nothing could have been graded).
      expect(body).toMatchObject({
        from: '2026-10-10',
        to: '2026-11-08',
        updated_at: materialised ? '2026-11-07T16:30:00Z' : '2026-09-01T00:00:00Z'
      })
    }
  })

  test('serves the materialised figures with n and the Wilson interval, the series and the counted grades', async () => {
    const projectId = await newProject()
    const hit = await graded(ORG, projectId, 'hit')
    await graded(ORG, projectId, 'hit', '2026-11-06')
    await graded(ORG, projectId, 'false_alarm', '2026-11-06')
    await materialise(ORG, projectId)
    // Graded by the 06:30 MYT catch-up, after the run: neither in the figures nor in the table until the next run.
    await graded(ORG, projectId, 'miss', '2026-11-07', new Date('2026-11-07T22:30:00Z'))

    const body = (await (await get(`/v1/projects/${projectId}/analysis`, { period: '7d' })).json()) as Analysis
    expect(body).toMatchObject({ from: '2026-11-02', to: '2026-11-08', updated_at: '2026-11-07T16:30:00Z' })
    const precision = body.metrics.find((m) => m.pack === 'sky' && m.metric === 'precision' && !m.clause_key)!
    expect(precision.x).toBe(2)
    expect(precision.n).toBe(3)
    expect(precision.value).toBeCloseTo(2 / 3, 12)
    expect(precision.low).toBeGreaterThan(0)
    expect(precision.high).toBeLessThan(1)
    expect(body.metrics).toContainEqual(
      expect.objectContaining({ pack: 'sky', clause_key: 'storm_watch', metric: 'precision', x: 2, n: 3 })
    )
    expect(body.metrics).toContainEqual(
      expect.objectContaining({ pack: 'sky', metric: 'approved_to_sent_p50', x: null, n: 3, value: 5, low: null })
    )
    expect(body.series.map((s) => s.at)).toEqual(['2026-11-04T16:00:00Z', '2026-11-05T16:00:00Z'])
    expect(body.series[1]!.metrics).toContainEqual(expect.objectContaining({ metric: 'precision', x: 1, n: 2 }))
    expect(body.grades.data.map((g) => [g.outcome, g.pack])).toEqual([
      ['false_alarm', 'sky'],
      ['hit', 'sky'],
      ['hit', 'sky']
    ])
    expect(body.grades.data[2]!.id).toBe(hit.id)
    expect(body.kill_line_exceeded).toBe(false)
  })

  test('reads only the materialised rows (NFR-9): a figure changed in the table is what it serves', async () => {
    const projectId = await newProject()
    await materialise(ORG, projectId)
    await asLogin('postgres', (client) =>
      client.query(
        "UPDATE analysis_metric SET x = 1, n = 12, value = 1.0 / 12, low = 0.01, high = 0.35 WHERE project_id = $1 AND period = '30d' AND metric = 'agreement'",
        [projectId]
      )
    )
    const body = (await (await get(`/v1/projects/${projectId}/analysis`)).json()) as Analysis
    expect(body.metrics.find((m) => m.metric === 'agreement')).toMatchObject({ x: 1, n: 12, low: 0.01, high: 0.35 })
    // 11 of 12 disagree: past the kill line of 1 in 10.
    expect(body.kill_line_exceeded).toBe(true)
  })

  test('with pack_crowd off, Crowd figures are 403 feature-off and the rest holds Sky only', async () => {
    const projectId = await newProject(PLAIN)
    const night = await asSystem(PLAIN, (tx) => makeNight(tx, { projectId, date: '2026-11-04' }))
    await asSystem(PLAIN, async (tx) =>
      tx.insert(grade).values({
        orgId: testOrg(PLAIN).id,
        projectId,
        pack: 'crowd',
        nightId: night.id,
        sheetVersionId: await sheetVersionIn(tx, projectId),
        outcome: 'in_band',
        modeDiff: 0,
        noCall: false,
        agrees: false,
        staleInputs: false,
        localDate: '2026-11-04',
        createdAt: new Date('2026-11-04T15:55:00Z')
      })
    )
    await materialise(PLAIN, projectId)
    const plain = asSession({ org: PLAIN, role: 'viewer' })
    const crowd = await get(`/v1/projects/${projectId}/analysis`, { pack: 'crowd' }, { as: plain, org: PLAIN })
    expect(crowd.status).toBe(403)
    expect(await crowd.json()).toMatchObject({ type: expect.stringMatching(/\/feature-off$/) })
    const body = (await (
      await get(`/v1/projects/${projectId}/analysis`, {}, { as: plain, org: PLAIN })
    ).json()) as Analysis
    expect(new Set(body.metrics.map((m) => m.pack))).toEqual(new Set(['sky']))
    expect(body.series.flatMap((s) => s.metrics).filter((m) => m.pack === 'crowd')).toEqual([])
    expect(body.grades.data).toEqual([])
  })

  test('a range is a period: from and to are refused', async () => {
    const projectId = await newProject()
    const response = await get(`/v1/projects/${projectId}/analysis`, { from: '2026-11-01' })
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      type: expect.stringMatching(/\/validation-failed$/),
      errors: [{ in: 'query', pointer: '/from' }]
    })
  })
})

describe('GET /v1/analysis', () => {
  test('pools the projects the principal may view and leaves the others out', async () => {
    const seen = await newProject()
    const hidden = await newProject()
    await graded(ORG, seen, 'hit')
    await graded(ORG, seen, 'false_alarm')
    await graded(ORG, hidden, 'false_alarm')
    await graded(ORG, hidden, 'false_alarm')
    await materialise(ORG, seen)
    await materialise(ORG, hidden)
    const grant = asOAuth({ org: ORG, role: 'viewer', resource: 'api', projectIds: [seen], scopes: ['read'] })
    const body = (await (await get('/v1/analysis', { period: '7d' }, { as: grant })).json()) as Analysis
    expect(body.metrics.find((m) => m.pack === 'sky' && m.metric === 'precision' && !m.clause_key)).toMatchObject({
      x: 1,
      n: 2
    })
    expect(body.grades.data.map((g) => g.outcome).sort()).toEqual(['false_alarm', 'hit'])

    const link = asShareLink({ org: ORG, projectId: hidden, access: 'reviewer' })
    const linked = (await (await get('/v1/analysis', { period: '7d' }, { as: link })).json()) as Analysis
    expect(linked.metrics.find((m) => m.pack === 'sky' && m.metric === 'precision' && !m.clause_key)).toMatchObject({
      x: 0,
      n: 2
    })
  })

  test('an organisation with no project it may view reads n = 0 as of the request', async () => {
    const grant = asOAuth({ org: ORG, role: 'viewer', resource: 'api', projectIds: [], scopes: ['read'] })
    const body = (await (await get('/v1/analysis', {}, { as: grant })).json()) as Analysis
    for (const m of metricsIn(body)) expect(m).toMatchObject({ n: 0, value: null, low: null, high: null })
    expect(body).toMatchObject({ updated_at: '2026-11-08T02:00:00Z', to: '2026-11-08' })
  })

  test('with pack_crowd off, ?pack=crowd is 403 feature-off', async () => {
    const plain = asSession({ org: PLAIN, role: 'viewer' })
    const response = await get('/v1/analysis', { pack: 'crowd' }, { as: plain, org: PLAIN })
    expect(response.status).toBe(403)
  })
})

describe('POST /v1/projects/{id}/analysis/what-if', () => {
  const at = '2026-11-05T07:00:00Z'
  const range = { from: '2026-11-05T00:00:00Z', to: '2026-11-06T00:00:00Z', step: 'PT60M' as const }
  const sheet = { pack: 'sky' as const, clauses: [] }
  const post = (projectId: string, body: unknown, o: { as?: Principal; org?: string } = {}) =>
    apiRequest(v1, {
      as: o.as ?? viewer,
      method: 'POST',
      path: `/v1/projects/${projectId}/analysis/what-if`,
      org: o.org ?? ORG,
      body
    })
  type WhatIf = z.infer<Operations['evaluateWhatIf']['responses'][200]['content']['application/json']['schema']>

  /** A window graded with `observed` as the stored observed mode, and what the double replays for it. */
  async function scene() {
    const projectId = await newProject()
    const gauge = await asSystem(ORG, (tx) => makeSource(tx, { url: 'https://infobanjirjps.selangor.gov.my/' }))
    const windows = await asSystem(ORG, async (tx) => {
      const observed = async (mode: 'normal' | 'commute_disruption' | 'hybrid_recommended') => {
        const w = await makeWindow(tx, { projectId, startsAt: new Date(at), endsAt: new Date('2026-11-05T09:00:00Z') })
        const bundle = await makeBundle(tx, { runId: (await makeRun(tx, { projectId, status: 'drafted' })).id })
        const c = await makeCall(tx, { bundleId: bundle.id, windowId: w.id })
        await makeGrade(tx, {
          callId: c.id,
          windowId: w.id,
          outcome: 'correct_normal',
          observedMode: mode,
          localDate: '2026-11-05',
          createdAt: new Date('2026-11-05T15:55:00Z')
        })
        return w.id
      }
      return {
        hit: await observed('commute_disruption'),
        miss: await observed('hybrid_recommended'),
        noCall: await observed('normal')
      }
    })
    const input = {
      name: 'site.rain_60m_mm',
      value: 42.5,
      unit: 'mm',
      state: 'fresh' as const,
      since: '2026-11-05T06:00:00Z',
      ageS: 120.4,
      sourceIds: [gauge.id],
      readingIds: [],
      observedAt: '2026-11-05T06:55:00Z'
    }
    const verdict = (id: string, mode: 'normal' | 'commute_disruption' | null, fired: string[]) => ({
      scope: { kind: 'window' as const, id },
      pack: 'sky' as const,
      mode,
      watch: false,
      noCall:
        mode === null
          ? { inputs: [{ name: 'site.rain_60m_mm', sourceId: gauge.id, state: 'error' as const, since: at }] }
          : null,
      recommendations: [],
      clauses: fired.map((key) => ({ key, result: 'fired' as const, blockedBy: [], inputs: [input] })),
      openFrom: null
    })
    const replayed: Array<{ windows: string[]; range: unknown }> = []
    setWhatIfEngine({
      registry: {} as IndicatorRegistry,
      history: async () => ({ sources: [], polls: [], readings: [] }),
      check: (input) => ({ ok: true, publishable: true, issues: [], sheet: input as unknown as CheckedSheet }),
      replay: (_sheet, _history, _registry, ws, r) => {
        replayed.push({ windows: ws.map((w) => w.id), range: r })
        const verdicts = (tEval: string, hitMode: 'normal' | 'commute_disruption') => ({
          tEval,
          pack: 'sky' as const,
          contentHash: 'content',
          snapshotHash: 'snapshot',
          site: [],
          windows: [
            verdict(windows.hit, hitMode, hitMode === 'normal' ? [] : ['storm_confirmed']),
            verdict(windows.miss, 'normal', []),
            verdict(windows.noCall, null, [])
          ],
          nights: [],
          hash: tEval
        })
        return {
          label: 'replay',
          steps: [
            { tEval: '2026-11-05T06:00:00Z', verdicts: verdicts('2026-11-05T06:00:00Z', 'normal') },
            { tEval: '2026-11-05T07:00:00Z', verdicts: verdicts('2026-11-05T07:00:00Z', 'commute_disruption') }
          ],
          summary: { normal: 3, commute_disruption: 1, no_call: 2 }
        }
      }
    })
    return { projectId, windows, gauge, replayed }
  }

  afterAll(() => setWhatIfEngine({ registry: null, history: null, check, replay }))

  test('ANL-6: the answer is a labelled replay, scored against the stored observed modes', async () => {
    const s = await scene()
    const response = await post(s.projectId, { sheet, range })
    expect(response.status).toBe(200)
    const body = (await response.json()) as WhatIf
    expect(body.label).toBe('replay')
    expect(s.replayed).toEqual([{ windows: [s.windows.hit, s.windows.miss, s.windows.noCall], range }])
    expect(body.steps.map((step) => step.t_eval)).toEqual(['2026-11-05T06:00:00Z', '2026-11-05T07:00:00Z'])
    expect(body.steps[1]!.verdicts.windows[0]!.clauses[0]!.inputs[0]).toMatchObject({
      age_s: 120,
      source_ids: [s.gauge.id],
      source_url: 'https://infobanjirjps.selangor.gov.my/'
    })
    expect(body.summary).toEqual({ normal: 3, commute_disruption: 1, no_call: 2 })
    const of = (metric: string, clause: string | null = null) =>
      body.metrics!.find((m) => m.metric === metric && m.clause_key === clause)
    // The hit window proposed Commute disruption at 07:00 and it came; the miss window stayed Normal under Hybrid.
    expect(of('precision')).toMatchObject({ pack: 'sky', x: 1, n: 1 })
    expect(of('recall')).toMatchObject({ x: 1, n: 2 })
    expect(of('false_alarm_ratio')).toMatchObject({ x: 0, n: 1 })
    expect(of('no_call')).toMatchObject({ x: 1, n: 3 })
    expect(of('precision', 'storm_confirmed')).toMatchObject({ x: 1, n: 1 })
    expect(body.metrics!.map((m) => m.metric)).not.toContain('agreement')
  })

  test('touches no live figure: GET …/analysis is byte-identical after it, and no grade or figure is written', async () => {
    const s = await scene()
    await materialise(ORG, s.projectId)
    const count = () =>
      asLogin('postgres', async (client) => {
        const { rows } = await client.query(
          'SELECT (SELECT count(*) FROM grade WHERE project_id = $1)::int AS grades, (SELECT count(*) FROM analysis_metric WHERE project_id = $1)::int AS figures, (SELECT max(computed_at) FROM analysis_metric WHERE project_id = $1) AS computed',
          [s.projectId]
        )
        return rows[0]
      })
    const before = await (await get(`/v1/projects/${s.projectId}/analysis`)).text()
    const counted = await count()
    expect((await post(s.projectId, { sheet, range })).status).toBe(200)
    expect(await (await get(`/v1/projects/${s.projectId}/analysis`)).text()).toBe(before)
    expect(await count()).toEqual(counted)
  })

  test('refuses a range over 90 days or out of order, and a Crowd sheet with pack_crowd off', async () => {
    const s = await scene()
    // 7 August to 6 November is 91 days; from the 8th it is 90.
    for (const r of [
      { ...range, from: '2026-08-07T00:00:00Z' },
      { ...range, to: range.from }
    ]) {
      const response = await post(s.projectId, { sheet, range: r })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ in: 'body', pointer: '/range' }] })
    }
    expect((await post(s.projectId, { sheet, range: { ...range, from: '2026-08-08T00:00:00Z' } })).status).toBe(200)
    const projectId = await newProject(PLAIN)
    const plain = asSession({ org: PLAIN, role: 'viewer' })
    const crowd = await post(projectId, { sheet: { pack: 'crowd', clauses: [] }, range }, { as: plain, org: PLAIN })
    expect(crowd.status).toBe(403)
  })

  test('answers 501 not-built, naming the owner, until the reading history and registry are composed', async () => {
    const projectId = await newProject()
    setWhatIfEngine({ registry: null, history: null, check, replay })
    const response = await post(projectId, { sheet, range })
    expect(response.status).toBe(501)
    expect(await response.json()).toMatchObject({ type: expect.stringMatching(/\/not-built$/), owner: 'b-evaluator' })
    setWhatIfEngine({
      registry: [],
      history: async () => ({ sources: [], polls: [], readings: [] })
    })
    const unbuilt = await post(projectId, { sheet, range })
    expect(unbuilt.status).toBe(501)
    expect(await unbuilt.json()).toMatchObject({ owner: 'b-replay' })
  })
})

describe('access', () => {
  const operations = ['getProjectAnalysis', 'getOrganisationAnalysis', 'evaluateWhatIf'] as const
  const whatIfBody = {
    sheet: { pack: 'sky', clauses: [] },
    range: { from: '2026-11-05T00:00:00Z', to: '2026-11-06T00:00:00Z', step: 'PT60M' }
  }
  const paths = {
    getProjectAnalysis: (id: string) => `/v1/projects/${id}/analysis`,
    getOrganisationAnalysis: () => '/v1/analysis',
    evaluateWhatIf: (id: string) => `/v1/projects/${id}/analysis/what-if`
  }
  const request = (operationId: (typeof operations)[number], projectId: string, as?: Principal) =>
    apiRequest(v1, {
      as,
      method: operationId === 'evaluateWhatIf' ? 'POST' : 'GET',
      path: paths[operationId](projectId),
      org: ORG,
      body: operationId === 'evaluateWhatIf' ? whatIfBody : undefined
    })

  test.each(operations)('%s answers 404 for another organisation', async (operationId) => {
    const elsewhere = await newProject(OTHER)
    await crossOrgCase(operationId, {
      app: v1,
      as: viewer,
      org: OTHER,
      params: { id: elsewhere },
      body: operationId === 'evaluateWhatIf' ? whatIfBody : undefined
    }).run()
  })

  test('the project operations answer 404 for an unknown ID and another organisation’s project', async () => {
    const elsewhere = await newProject(OTHER)
    for (const operationId of ['getProjectAnalysis', 'evaluateWhatIf'] as const) {
      await crossOrgCase(operationId, {
        app: v1,
        as: viewer,
        org: ORG,
        params: { id: elsewhere },
        body: operationId === 'evaluateWhatIf' ? whatIfBody : undefined
      }).run()
      for (const id of ['not-a-uuid', '01900000-0000-7000-8000-000000000000']) {
        expect((await request(operationId, id, viewer)).status).toBe(404)
      }
    }
  })

  test.each(operations)('%s refuses an unauthenticated call', async (operationId) => {
    const projectId = await newProject()
    expect((await request(operationId, projectId, undefined)).status).toBe(401)
  })

  test.each(operations)(
    '%s is denied below ledger.view: a key without read, a view-only share link',
    async (operationId) => {
      const projectId = await newProject()
      const key = asApiKey({ org: ORG, role: 'owner', scopes: ['draft'] })
      expect((await request(operationId, projectId, key)).status).toBe(403)
      const link = asShareLink({ org: ORG, projectId, access: 'view' })
      expect((await request(operationId, projectId, link)).status).toBe(403)
    }
  )
})
