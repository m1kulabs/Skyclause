// #161 c-grades: the grade-sky job on the test database, with doubles of the engine's §1 contracts (ANL-1, ANL-2, CAL-5,
// CAL-6, GST-5). Assertions read rows as the superuser, scoped to each test's own project.
import { randomUUID } from 'node:crypto'
import type { SkyMode } from '@skyclause/clauses'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { gradeSky } from '../src/grades/sky'
import {
  HISTORY_SOURCES,
  inOrg,
  localDatesOf,
  myt,
  publishSheet,
  reviewItemsOf,
  rowsOf,
  shadowCrossed,
  skyBundle,
  skyEngine,
  skyProject,
  STORM_CONFIRMED,
  windowAt
} from './grades-scene'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const tx = <T>(fn: Parameters<typeof inOrg<T>>[1]) => inOrg(orgId, fn)
const gradesOf = async (projectId: string) =>
  (await rowsOf('grade', projectId)).map((g) => ({
    call: g.call_id,
    window: g.window_id,
    outcome: g.outcome,
    proposed: g.proposed_mode,
    observed: g.observed_mode
  }))

describe('ANL-1: every Sky window with a call by 23:59 has a grade by 06:45 next day', () => {
  test('23:55 grades spans that closed; spans past midnight, up to the run itself, wait for 06:30', async () => {
    const { projectId, versionId, early, late, dawn } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      // Storm confirmed's span ends an hour after each window: 22:30, 00:30 and 06:30.
      const early = await windowAt(t, projectId, '2026-11-09 20:00', '2026-11-09 21:30')
      const late = await windowAt(t, projectId, '2026-11-09 22:00', '2026-11-09 23:30')
      const dawn = await windowAt(t, projectId, '2026-11-10 04:30', '2026-11-10 05:30')
      await skyBundle(t, projectId, versionId, [
        { windowId: early.id, mode: 'commute_disruption' },
        { windowId: late.id, mode: 'outdoor_limited' },
        { windowId: dawn.id, mode: 'normal' }
      ])
      return { projectId, versionId, early, late, dawn }
    })
    const { engine, seen } = skyEngine(new Map([[early.id, 'commute_disruption' as SkyMode]]))

    await gradeSky(engine, myt('2026-11-09 23:55'))
    expect(await gradesOf(projectId)).toEqual([
      {
        call: expect.any(String),
        window: early.id,
        outcome: 'hit',
        proposed: 'commute_disruption',
        observed: 'commute_disruption'
      }
    ])

    await gradeSky(engine, myt('2026-11-10 06:30'))
    expect((await gradesOf(projectId)).map((g) => [g.window, g.outcome])).toEqual([
      [early.id, 'hit'],
      [late.id, 'false_alarm'],
      [dawn.id, 'correct_normal']
    ])
    // Each observation is the call's pinned version, evaluated at the last span end over the span's history.
    expect(seen.checked.every((sheet) => sheet.clauses[0]!.key === STORM_CONFIRMED.key)).toBe(true)
    expect(seen.evaluatedAt.filter((e) => [early.id, late.id, dawn.id].includes(e.windowId))).toEqual([
      { windowId: early.id, tEval: '2026-11-09T14:30:00.000Z' },
      { windowId: late.id, tEval: '2026-11-09T16:30:00.000Z' },
      { windowId: dawn.id, tEval: '2026-11-09T22:30:00.000Z' }
    ])
    expect((await rowsOf('grade', projectId)).map((g) => g.sheet_version_id)).toEqual([versionId, versionId, versionId])
    expect(await localDatesOf(projectId)).toEqual(['2026-11-09', '2026-11-09', '2026-11-10'])
  })

  test('the observation reads gauge, APIMS, warnings and devices past probation; never forecasts or a probation camera', async () => {
    const { projectId, window } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-08 09:00', '2026-11-08 11:00')
      await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'normal' }])
      return { projectId, window }
    })
    const readingIds = [randomUUID(), randomUUID()]
    const { engine, seen } = skyEngine(new Map(), new Map([[window.id, readingIds]]))
    await gradeSky(engine, myt('2026-11-08 23:55'))
    const history = seen.histories.find((h) => h.projectId === projectId)!
    expect(history).toEqual({
      projectId,
      from: '2026-11-04T01:00:00.000Z',
      to: '2026-11-08T04:00:00.000Z',
      kept: ['jps_rain', 'apims', 'met_warning', 'pi']
    })
    expect(HISTORY_SOURCES).toHaveLength(6)
    const [grade] = await rowsOf('grade', projectId)
    expect(grade).toMatchObject({ outcome: 'correct_normal', reading_ids: readingIds })
  })

  test('a required input missing over the span grades the call No call', async () => {
    const { projectId, window } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-07 09:00', '2026-11-07 11:00')
      await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'commute_disruption' }])
      return { projectId, window }
    })
    await gradeSky(skyEngine(new Map([[window.id, null]])).engine, myt('2026-11-07 23:55'))
    expect(await rowsOf('grade', projectId)).toMatchObject([
      { outcome: 'no_call', no_call: true, observed_mode: null, proposed_mode: 'commute_disruption' }
    ])
    expect(await reviewItemsOf(projectId)).toEqual([])
  })
})

test('CAL-6: a rejected call in a 3-call bundle is graded on what it proposed', async () => {
  const { projectId, windows, calls } = await tx(async (t) => {
    const { projectId, versionId } = await skyProject(t)
    const windows = [
      await windowAt(t, projectId, '2026-11-06 09:00', '2026-11-06 10:00'),
      await windowAt(t, projectId, '2026-11-06 11:00', '2026-11-06 12:00'),
      await windowAt(t, projectId, '2026-11-06 13:00', '2026-11-06 14:00')
    ]
    const calls = await skyBundle(t, projectId, versionId, [
      { windowId: windows[0]!.id, mode: 'commute_disruption' },
      { windowId: windows[1]!.id, mode: 'commute_disruption', state: 'rejected' },
      { windowId: windows[2]!.id, mode: 'normal' }
    ])
    return { projectId, windows, calls }
  })
  const storm = new Map(windows.map((w) => [w.id, 'commute_disruption' as SkyMode]))
  await gradeSky(skyEngine(storm).engine, myt('2026-11-06 23:55'))
  expect((await gradesOf(projectId)).sort((a, b) => String(a.window).localeCompare(String(b.window)))).toEqual([
    {
      call: calls[0]!.id,
      window: windows[0]!.id,
      outcome: 'hit',
      proposed: 'commute_disruption',
      observed: 'commute_disruption'
    },
    {
      call: calls[1]!.id,
      window: windows[1]!.id,
      outcome: 'miss',
      proposed: 'commute_disruption',
      observed: 'commute_disruption'
    },
    { call: calls[2]!.id, window: windows[2]!.id, outcome: 'miss', proposed: 'normal', observed: 'commute_disruption' }
  ])
})

describe('ANL-2: a window whose shadow verdict fired with no approved call is listed as no_call', () => {
  test('a window with no call at all gets its own grade and one review item', async () => {
    const { projectId, window } = await tx(async (t) => {
      const { projectId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-05 15:00', '2026-11-05 16:00')
      await shadowCrossed(t, projectId, window.id)
      // A quiet window with no call isn't graded.
      await windowAt(t, projectId, '2026-11-05 17:00', '2026-11-05 18:00')
      return { projectId, window }
    })
    await gradeSky(skyEngine(new Map([[window.id, 'commute_disruption' as SkyMode]])).engine, myt('2026-11-05 23:55'))
    const grades = await rowsOf('grade', projectId)
    expect(grades).toMatchObject([
      { call_id: null, night_id: null, window_id: window.id, outcome: 'miss', proposed_mode: null, agrees: false }
    ])
    expect(await reviewItemsOf(projectId)).toMatchObject([
      { grade_id: grades[0]!.id, state: 'open', reasons: ['miss', 'no_call'], explanation: null }
    ])
  })

  test('a rejected call of a fired window carries no_call; an approved one in the same window clears it', async () => {
    const { projectId, open, settled } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const open = await windowAt(t, projectId, '2026-11-04 09:00', '2026-11-04 10:00')
      const settled = await windowAt(t, projectId, '2026-11-04 11:00', '2026-11-04 12:00')
      for (const w of [open, settled]) await shadowCrossed(t, projectId, w.id, 'outdoor_limited')
      await skyBundle(t, projectId, versionId, [{ windowId: open.id, mode: 'outdoor_limited', state: 'rejected' }])
      await skyBundle(t, projectId, versionId, [
        { windowId: settled.id, mode: 'outdoor_limited', state: 'expired' },
        { windowId: settled.id, mode: 'outdoor_limited', state: 'approved' }
      ])
      return { projectId, open, settled }
    })
    await gradeSky(skyEngine(new Map()).engine, myt('2026-11-04 23:55'))
    const grades = await rowsOf('grade', projectId)
    const items = await reviewItemsOf(projectId)
    const reasonsOf = (windowId: string) =>
      grades
        .filter((g) => g.window_id === windowId)
        .map((g) => items.find((item) => item.grade_id === g.id)?.reasons ?? [])
    expect(reasonsOf(open.id)).toEqual([['no_call']])
    expect(reasonsOf(settled.id).map(String).sort()).toEqual(['expired_above_normal', 'false_alarm'])
  })
})

describe('what a grade writes', () => {
  test('a ledger entry with no personal data, call.graded, review_item.opened and call_graded analytics', async () => {
    const { projectId, call } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-03 09:00', '2026-11-03 10:00')
      const [call] = await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'hybrid_recommended' }])
      return { projectId, call: call! }
    })
    await gradeSky(skyEngine(new Map()).engine, myt('2026-11-03 23:55'))
    const [grade] = await rowsOf('grade', projectId)
    const [item] = await reviewItemsOf(projectId)
    expect(grade).toMatchObject({
      outcome: 'false_alarm',
      proposed_mode: 'hybrid_recommended',
      observed_mode: 'normal'
    })
    expect(await rowsOf('ledger_entry', projectId)).toMatchObject([
      {
        kind: 'grade',
        refs: { grade_id: grade!.id, call_id: call.id, window_id: call.windowId },
        body: {
          pack: 'sky',
          mode: 'hybrid_recommended',
          observed_mode: 'normal',
          outcome: 'false_alarm',
          no_call: false,
          mode_diff: 0
        }
      }
    ])
    expect((await rowsOf('domain_event', projectId)).map((e) => [e.type, e.data])).toEqual([
      ['call.graded', { call_id: call.id, outcome: 'false_alarm' }],
      ['review_item.opened', { review_item_id: item!.id, outcome: 'false_alarm' }]
    ])
    expect((await rowsOf('analytics_event', projectId)).map((e) => [e.name, e.props])).toEqual([
      ['call_graded', { pack: 'sky', grade: 'false_alarm' }]
    ])
  })

  test('CAL-5: a Closed (all-Normal) bundle’s call is graded and reviewed, with no ledger entry', async () => {
    const { projectId, window } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-02 15:00', '2026-11-02 16:00')
      await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'normal', state: 'drafted' }], {
        state: 'closed'
      })
      return { projectId, window }
    })
    await gradeSky(skyEngine(new Map([[window.id, 'commute_disruption' as SkyMode]])).engine, myt('2026-11-02 23:55'))
    expect(await rowsOf('grade', projectId)).toMatchObject([{ outcome: 'miss' }])
    expect(await reviewItemsOf(projectId)).toMatchObject([{ reasons: ['miss'] }])
    expect(await rowsOf('ledger_entry', projectId)).toEqual([])
  })

  test('GST-5: a guest window’s grade gets no ledger entry and no review item, even a miss', async () => {
    const { projectId, window } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-11-01 15:00', '2026-11-01 16:00', { guest: true })
      await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'normal' }], { draftOnly: true })
      return { projectId, window }
    })
    await gradeSky(skyEngine(new Map([[window.id, 'hybrid_recommended' as SkyMode]])).engine, myt('2026-11-01 23:55'))
    expect(await rowsOf('grade', projectId)).toMatchObject([{ outcome: 'miss' }])
    expect(await reviewItemsOf(projectId)).toEqual([])
    expect(await rowsOf('ledger_entry', projectId)).toEqual([])
  })

  test('agrees comes from the call and stale_inputs from its shadow check', async () => {
    const { projectId } = await tx(async (t) => {
      const { projectId, versionId } = await skyProject(t)
      const window = await windowAt(t, projectId, '2026-10-31 15:00', '2026-10-31 16:00')
      const stale = {
        scope: { kind: 'window', id: window.id },
        mode: 'commute_disruption',
        watch: false,
        noCall: null,
        clauses: [
          {
            key: 'storm_confirmed',
            result: 'fired',
            blockedBy: [],
            inputs: [{ name: 'w.rain_max_60m_mm', state: 'stale' }]
          }
        ]
      }
      await skyBundle(t, projectId, versionId, [
        {
          windowId: window.id,
          mode: 'commute_disruption',
          agrees: false,
          fired: [{ clause: 'storm_confirmed', inputs: ['w.rain_max_60m_mm'] }],
          shadow: stale
        }
      ])
      return { projectId }
    })
    await gradeSky(skyEngine(new Map()).engine, myt('2026-10-31 23:55'))
    expect(await rowsOf('grade', projectId)).toMatchObject([{ agrees: false, stale_inputs: true }])
  })
})

test('re-runs are no-ops: one grade per call and per window, nothing written twice', async () => {
  const { projectId, window } = await tx(async (t) => {
    const { projectId, versionId } = await skyProject(t)
    const window = await windowAt(t, projectId, '2026-10-30 09:00', '2026-10-30 10:00')
    await skyBundle(t, projectId, versionId, [{ windowId: window.id, mode: 'normal' }])
    const quiet = await windowAt(t, projectId, '2026-10-30 11:00', '2026-10-30 12:00')
    await shadowCrossed(t, projectId, quiet.id)
    return { projectId, window }
  })
  const { engine } = skyEngine(new Map([[window.id, 'commute_disruption' as SkyMode]]))
  const counts = async () =>
    Promise.all(
      ['grade', 'ledger_entry', 'domain_event', 'analytics_event'].map(async (t) => (await rowsOf(t, projectId)).length)
    )
  await gradeSky(engine, myt('2026-10-30 23:55'))
  const first = await counts()
  // The miss writes call.graded and review_item.opened; the callless window only review_item.opened.
  expect(first).toEqual([2, 2, 3, 2])
  await gradeSky(engine, myt('2026-10-31 06:30'))
  await gradeSky(engine, myt('2026-10-31 23:55'))
  expect(await counts()).toEqual(first)
  expect(await reviewItemsOf(projectId)).toHaveLength(2)
})

test('a version the call didn’t pin is never used, and a superseded call isn’t graded', async () => {
  const { projectId, pinned } = await tx(async (t) => {
    const { projectId } = await skyProject(t)
    const pinned = await publishSheet(t, projectId, 'sky', [{ ...STORM_CONFIRMED, key: 'pinned' }], {
      live: false,
      n: 2
    })
    const window = await windowAt(t, projectId, '2026-10-29 09:00', '2026-10-29 10:00')
    await skyBundle(t, projectId, pinned, [
      { windowId: window.id, mode: 'normal' },
      { windowId: window.id, mode: 'outdoor_limited', state: 'superseded' }
    ])
    return { projectId, pinned }
  })
  const { engine, seen } = skyEngine(new Map())
  await gradeSky(engine, myt('2026-10-29 23:55'))
  expect(await rowsOf('grade', projectId)).toMatchObject([{ sheet_version_id: pinned, proposed_mode: 'normal' }])
  expect(seen.checked.map((sheet) => sheet.clauses[0]!.key)).toContain('pinned')
})

test('without the reading history or the indicator registry the job refuses, naming what’s missing', async () => {
  const { engine } = skyEngine(new Map())
  await expect(gradeSky({ ...engine, history: null }, myt('2026-10-28 23:55'))).rejects.toThrow(/#133/)
  await expect(gradeSky({ ...engine, registry: null }, myt('2026-10-28 23:55'))).rejects.toThrow(/registry/)
})
