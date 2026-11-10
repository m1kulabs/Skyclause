// #162 c-analysis-api: the analysis-materialise job's figures, from factory grades, calls, crossings and evidence
// requests (LED-6's times, #159's columns) on the #79 §7 test database.
import { and, asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { analysisMetric, grade, materialiseAnalysis, systemPrincipal, withTenant, type Tx } from '../src'
import {
  makeBundle,
  makeCall,
  makeCrossing,
  makeEvidenceRequest,
  makeForecast,
  makeGrade,
  makeNight,
  makeOrganization,
  makeProject,
  makeRun,
  makeShadowState,
  makeWindow
} from './factories'
import { sheetVersionIn } from './factories/rows'

let orgId: string
const asSystem = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('analysis-materialise') }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

// 00:30 MYT on 10 November 2026, the job's first run of the day.
const NOW = new Date('2026-11-09T16:30:00Z')
const at = (myt: string) => new Date(`${myt.replace(' ', 'T')}:00+08:00`)
const fired = (...keys: string[]) => ({ clauses: keys.map((key) => ({ key, result: 'fired' })) })

const rowsOf = (projectId: string) =>
  asSystem((tx) =>
    tx
      .select()
      .from(analysisMetric)
      .where(eq(analysisMetric.projectId, projectId))
      .orderBy(asc(analysisMetric.period), asc(analysisMetric.rangeFrom), asc(analysisMetric.metric))
  )
const figure = (rows: Awaited<ReturnType<typeof rowsOf>>, period: string, metric: string, o: object = {}) =>
  rows.filter(
    (r) => r.period === period && r.metric === metric && Object.entries(o).every(([k, v]) => r[k as 'pack'] === v)
  )
const one = (...args: Parameters<typeof figure>) => {
  const found = figure(...args)
  expect(found, `${args[1]} ${args[2]}`).toHaveLength(1)
  return found[0]!
}

async function project() {
  return asSystem((tx) => makeProject(tx, { createdAt: new Date('2026-09-01T00:00:00Z') }))
}

/** A call graded `outcome` on the window's local date, in a bundle of a run triggered as `run` says. */
async function gradedCall(
  tx: Tx,
  q: {
    projectId: string
    outcome: 'hit' | 'miss' | 'false_alarm' | 'correct_normal' | 'no_call'
    startsAt: string
    shadow?: object
    agrees?: boolean
    staleInputs?: boolean
    guest?: boolean
    draftOnly?: boolean
    crossingAt?: string
    approvedAt?: string
    sentAt?: string
  }
) {
  const window = await makeWindow(tx, {
    projectId: q.projectId,
    startsAt: at(q.startsAt),
    endsAt: new Date(at(q.startsAt).getTime() + 2 * 3_600_000),
    guest: q.guest ?? false
  })
  const crossing = q.crossingAt
    ? await makeCrossing(tx, { projectId: q.projectId, at: at(q.crossingAt), scopeKind: 'window', scopeId: window.id })
    : null
  const run = await makeRun(tx, {
    projectId: q.projectId,
    status: 'drafted',
    trigger: crossing ? 'crossing' : 'schedule',
    triggerRef: crossing?.id ?? null
  })
  const bundle = await makeBundle(tx, { runId: run.id, draftOnly: q.draftOnly ?? false })
  const call = await makeCall(tx, {
    bundleId: bundle.id,
    windowId: window.id,
    mode: q.outcome === 'hit' || q.outcome === 'false_alarm' ? 'commute_disruption' : 'normal',
    shadow: q.shadow ?? {},
    agrees: q.agrees ?? true,
    approvedAt: q.approvedAt ? at(q.approvedAt) : null,
    sentAt: q.sentAt ? at(q.sentAt) : null
  })
  return makeGrade(tx, {
    callId: call.id,
    windowId: window.id,
    outcome: q.outcome,
    agrees: q.agrees ?? true,
    staleInputs: q.staleInputs ?? false,
    noCall: q.outcome === 'no_call',
    localDate: q.startsAt.slice(0, 10)
  })
}

describe('analysis-materialise', () => {
  test('a new project gets every figure at n = 0, over periods that end on its local date', async () => {
    const { id: projectId } = await project()
    await asSystem((tx) => materialiseAnalysis(tx, { projectId, now: NOW }))
    const rows = await rowsOf(projectId)
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set(['7d', '30d', '90d', 'all']))
    for (const r of rows) {
      expect(r).toMatchObject({ n: 0, value: null, low: null, high: null, rangeTo: '2026-11-10', computedAt: NOW })
    }
    expect(one(rows, '7d', 'precision').rangeFrom).toBe('2026-11-04')
    expect(one(rows, '30d', 'precision').rangeFrom).toBe('2026-10-12')
    expect(one(rows, '90d', 'precision').rangeFrom).toBe('2026-08-13')
    // All time starts on the project's creation date, 1 September 2026 in MYT.
    expect(one(rows, 'all', 'precision').rangeFrom).toBe('2026-09-01')
    expect(rows.filter((r) => r.period === '7d')).toHaveLength(17)
  })

  test('figures come from non-guest grades, call times from crossings, and evidence times', async () => {
    const { id: projectId } = await project()
    await asSystem(async (tx) => {
      // 5 November: a crossing-triggered hit sent in 12 + 3 minutes; a scheduled false alarm the agent disagreed with.
      await gradedCall(tx, {
        projectId,
        outcome: 'hit',
        startsAt: '2026-11-05 15:00',
        shadow: fired('storm_watch'),
        crossingAt: '2026-11-05 14:00',
        approvedAt: '2026-11-05 14:12',
        sentAt: '2026-11-05 14:15'
      })
      await gradedCall(tx, {
        projectId,
        outcome: 'false_alarm',
        startsAt: '2026-11-05 17:00',
        shadow: fired('storm_watch'),
        agrees: false,
        approvedAt: '2026-11-05 15:00',
        sentAt: '2026-11-05 15:04'
      })
      // A stale-input Correct Normal: out of agreement, in the No call count's n.
      await gradedCall(tx, {
        projectId,
        outcome: 'correct_normal',
        startsAt: '2026-11-06 09:00',
        agrees: false,
        staleInputs: true
      })
      // A guest window and a Closed draft-only bundle count nowhere (GST-5), approval times included.
      await gradedCall(tx, {
        projectId,
        outcome: 'hit',
        startsAt: '2026-11-06 15:00',
        guest: true,
        crossingAt: '2026-11-06 14:00',
        approvedAt: '2026-11-06 14:01'
      })
      await gradedCall(tx, { projectId, outcome: 'false_alarm', startsAt: '2026-11-06 17:00', draftOnly: true })
      // 6 November: the shadow verdict fired haze_watch, no call was drafted, and the haze came (ANL-2).
      const callless = await makeWindow(tx, { projectId, startsAt: at('2026-11-06 07:00') })
      await makeShadowState(tx, {
        projectId,
        scopeKind: 'window',
        scopeId: callless.id,
        verdict: { mode: 'hybrid_recommended', ...fired('haze_watch') }
      })
      await tx.insert(grade).values({
        orgId,
        projectId,
        pack: 'sky',
        windowId: callless.id,
        sheetVersionId: await sheetVersionIn(tx, projectId),
        outcome: 'miss',
        modeDiff: 0,
        noCall: false,
        agrees: false,
        staleInputs: false,
        localDate: '2026-11-06'
      })
      // 3 November: inside 30 days, outside 7.
      await gradedCall(tx, { projectId, outcome: 'hit', startsAt: '2026-11-03 15:00', shadow: fired('storm_watch') })
      // ANL-3's 4 November night, as graded from the SP17 capture: 33,804 exits against the 27,044 forecast.
      const night = await makeNight(tx, { projectId, date: '2026-11-04' })
      const forecast = await makeForecast(tx, {
        nightId: night.id,
        forecast: 27_044,
        bandLow: 19_315,
        bandHigh: 32_100
      })
      await tx.insert(grade).values({
        orgId,
        projectId,
        pack: 'crowd',
        nightId: night.id,
        sheetVersionId: await sheetVersionIn(tx, projectId),
        outcome: 'out_of_band',
        modeDiff: 0,
        noCall: false,
        agrees: false,
        staleInputs: false,
        localDate: '2026-11-04',
        actual: 33_804,
        forecastId: forecast.id,
        bandLow: 19_315,
        bandHigh: 32_100
      })
      // LED-6: received 09:00, drafted 09:42 MYT; a request not yet drafted has no minutes.
      await makeEvidenceRequest(tx, {
        projectId,
        receivedAt: at('2026-11-07 09:00'),
        draftedAt: at('2026-11-07 09:42')
      })
      await makeEvidenceRequest(tx, { projectId, receivedAt: at('2026-11-07 10:00') })
      await materialiseAnalysis(tx, { projectId, now: NOW })
    })
    const rows = await rowsOf(projectId)
    const sky = { pack: 'sky', clause: null }
    expect(one(rows, '7d', 'precision', sky)).toMatchObject({ x: 1, n: 2, value: 0.5 })
    expect(one(rows, '7d', 'recall', sky)).toMatchObject({ x: 1, n: 2 })
    expect(one(rows, '7d', 'false_alarm_ratio', sky)).toMatchObject({ x: 1, n: 2 })
    expect(one(rows, '7d', 'no_call', sky)).toMatchObject({ x: 0, n: 4 })
    expect(one(rows, '7d', 'agreement', sky)).toMatchObject({ x: 1, n: 2 })
    expect(one(rows, '30d', 'precision', sky)).toMatchObject({ x: 2, n: 3 })
    expect(one(rows, '7d', 'precision', { clause: 'storm_watch' })).toMatchObject({ x: 1, n: 2 })
    expect(one(rows, '7d', 'recall', { clause: 'haze_watch' })).toMatchObject({ x: 0, n: 1 })
    expect(one(rows, '7d', 'precision', { clause: 'haze_watch' })).toMatchObject({ n: 0, value: null, low: null })
    expect(one(rows, '7d', 'band_coverage')).toMatchObject({ pack: 'crowd', x: 0, n: 1 })
    expect(one(rows, '7d', 'ape_median').value).toBeCloseTo(6_760 / 33_804, 12)
    expect(one(rows, '7d', 'crossing_to_approved_p50', sky)).toMatchObject({ n: 1, value: 12, samples: [12] })
    expect(one(rows, '7d', 'approved_to_sent_p50', sky)).toMatchObject({ n: 2, value: 3.5 })
    expect(one(rows, '7d', 'evidence_minutes_p50')).toMatchObject({ pack: null, n: 1, value: 42 })
    // The series: one row set per date with figures, holding only figures with n > 0.
    const days = rows.filter((r) => r.period === 'day')
    expect([...new Set(days.map((r) => r.rangeFrom))]).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07'
    ])
    expect(days.every((r) => r.n > 0 && r.rangeFrom === r.rangeTo && r.clause === null)).toBe(true)
    expect(one(rows, 'day', 'precision', { rangeFrom: '2026-11-05' })).toMatchObject({ x: 1, n: 2 })
  })

  test('a re-run replaces the figures in place, and a failed run leaves the last ones', async () => {
    const { id: projectId } = await project()
    await asSystem((tx) => gradedCall(tx, { projectId, outcome: 'hit', startsAt: '2026-11-05 15:00' }))
    await asSystem((tx) => materialiseAnalysis(tx, { projectId, now: NOW }))
    const first = await rowsOf(projectId)
    await asSystem((tx) => materialiseAnalysis(tx, { projectId, now: NOW }))
    const strip = (rows: typeof first) => rows.map(({ id: _id, ...rest }) => rest)
    expect(strip(await rowsOf(projectId))).toEqual(strip(first))

    await asSystem((tx) => gradedCall(tx, { projectId, outcome: 'false_alarm', startsAt: '2026-11-06 15:00' }))
    await expect(
      asSystem(async (tx) => {
        await materialiseAnalysis(tx, { projectId, now: new Date('2026-11-09T22:40:00Z') })
        throw new Error('the job failed after writing')
      })
    ).rejects.toThrow('the job failed after writing')
    expect(strip(await rowsOf(projectId))).toEqual(strip(first))

    const later = new Date('2026-11-09T22:40:00Z')
    await asSystem((tx) => materialiseAnalysis(tx, { projectId, now: later }))
    const rows = await rowsOf(projectId)
    expect(one(rows, '7d', 'precision', { pack: 'sky', clause: null })).toMatchObject({ x: 1, n: 2, computedAt: later })
    expect(rows.filter((r) => r.period !== 'day')).toHaveLength(first.filter((r) => r.period !== 'day').length)
    const others = await asSystem((tx) =>
      tx
        .select()
        .from(analysisMetric)
        .where(and(eq(analysisMetric.projectId, projectId), eq(analysisMetric.computedAt, NOW)))
    )
    expect(others).toEqual([])
  })
})
