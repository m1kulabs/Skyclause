// #161 ANL-4: "each such grade has exactly one review item", as a property over generated Sky and Crowd scenarios run
// through both jobs, re-runs included.
import type { SkyMode } from '@skyclause/clauses'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import fc from 'fast-check'
import { beforeAll, expect, test } from 'vitest'
import { gradeCrowd } from '../src/grades/crowd'
import { gradeSky } from '../src/grades/sky'
import {
  crowdEngine,
  crowdProject,
  inOrg,
  listedNight,
  myt,
  shadowCrossed,
  skyBundle,
  skyEngine,
  skyProject,
  windowAt
} from './grades-scene'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

const skyMode = fc.constantFrom<SkyMode>('normal', 'outdoor_limited', 'commute_disruption', 'hybrid_recommended')
const scenario = fc.record({
  windows: fc.array(
    fc.record({
      guest: fc.boolean(),
      shadowFired: fc.boolean(),
      closed: fc.boolean(),
      observed: fc.option(skyMode, { nil: null }),
      calls: fc.array(
        fc.record({
          mode: fc.option(skyMode, { nil: null }),
          state: fc.constantFrom('approved' as const, 'rejected' as const, 'expired' as const, 'drafted' as const)
        }),
        { maxLength: 2 }
      )
    }),
    { minLength: 1, maxLength: 3 }
  ),
  nights: fc.array(fc.integer({ min: 5_000, max: 50_000 }), { maxLength: 2 }),
  unlisted: fc.array(fc.integer({ min: 0, max: 20_000 }), { maxLength: 2 })
})

/** Each grade of the project with its review items and, for a night's grade, the night's state. */
const gradesOf = (projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{
      outcome: string
      guest: boolean | null
      items: number
      night: string | null
    }>(
      `SELECT g.outcome, w.guest, n.state AS night,
         (SELECT count(*)::int FROM review_item r WHERE r.grade_id = g.id) AS items
       FROM grade g LEFT JOIN "window" w ON w.id = g.window_id LEFT JOIN night n ON n.id = g.night_id
       WHERE g.project_id = $1 ORDER BY g.id`,
      [projectId]
    )
    return rows
  })

const NEEDS_A_PERSON = ['miss', 'false_alarm', 'out_of_band', 'unlisted_surge']

test('every miss, false alarm, out-of-band night or unlisted surge off a guest window has exactly one review item', async () => {
  await fc.assert(
    fc.asyncProperty(scenario, async (s) => {
      const sky = await inOrg(orgId, async (tx) => {
        const { projectId, versionId } = await skyProject(tx)
        const observed = new Map<string, SkyMode | null>()
        let subjects = 0
        for (const [i, w] of s.windows.entries()) {
          const hour = String(8 + 2 * i).padStart(2, '0')
          const window = await windowAt(tx, projectId, `2026-12-01 ${hour}:00`, `2026-12-01 ${hour}:45`, {
            guest: w.guest
          })
          observed.set(window.id, w.observed)
          if (w.shadowFired) await shadowCrossed(tx, projectId, window.id)
          if (w.calls.length) {
            const calls = w.calls.map((c) => ({
              windowId: window.id,
              ...c,
              noCall: c.mode === null ? ['w.rain_max_60m_mm'] : null
            }))
            await skyBundle(tx, projectId, versionId, calls, {
              state: w.closed ? 'closed' : 'approved',
              draftOnly: w.guest
            })
          }
          subjects += w.calls.length || (w.shadowFired ? 1 : 0)
        }
        return { projectId, observed, subjects }
      })
      const crowd = await crowdProject(orgId)
      for (const i of s.nights.keys()) {
        await listedNight(orgId, crowd.projectId, `2026-12-0${i + 1}`, `2026-12-0${i + 1} 19:00`, [
          { at: `2026-12-0${i + 1} 01:07`, forecast: 27_044, low: 19_315, high: 32_100 }
        ])
      }
      const exits = new Map<string, number>()
      s.nights.forEach((actual, i) => exits.set(`2026-12-0${i + 1}`, actual))
      const baselines = new Map<string, number>()
      s.unlisted.forEach((uplift, i) => {
        exits.set(`2026-11-2${i + 1}`, 3_928 + uplift)
        baselines.set(`2026-11-2${i + 1}`, 3_928)
      })

      const { engine: skyDouble } = skyEngine(sky.observed)
      const { engine: crowdDouble } = crowdEngine(exits, { baselines })
      for (const at of ['2026-12-03 23:55', '2026-12-04 06:30', '2026-12-04 23:55']) {
        await gradeSky(skyDouble, myt(at))
        await gradeCrowd(crowdDouble, myt(at))
      }

      const skyGrades = await gradesOf(sky.projectId)
      expect(skyGrades).toHaveLength(sky.subjects)
      const crowdGrades = await gradesOf(crowd.projectId)
      expect(crowdGrades).toHaveLength(s.nights.length + s.unlisted.filter((uplift) => uplift >= 10_000).length)
      for (const g of [...skyGrades, ...crowdGrades]) {
        if (g.guest) expect(g.items).toBe(0)
        else if (NEEDS_A_PERSON.includes(g.outcome)) expect(g.items).toBe(1)
        else expect(g.items).toBeLessThanOrEqual(1)
        if (g.outcome === 'unlisted_surge') expect(g.night).toBe('unlisted')
      }
    }),
    { numRuns: 25 }
  )
}, 120_000)
