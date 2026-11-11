// #592, from #161: a sheet holding Flash-flood risk and no Storm confirmed, graded on the stored 2 November 2026 JPS
// capture (gauge 0232901RF, the packages/db copy that fixtures.json lists with its URL, capture time and SHA-256).
// Flash-flood risk writes no span, so the clause engine reads it over the default span, 30 minutes before to 60 minutes
// after the window's end: for the 15:30 release wave 15:00 to 16:30, where the 4-hour total peaks at 63.5 mm by 16:10.
// By 15:30 the total is only 58.5 mm, under the clause's 60. The grader must wait for that default span to close.
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import skyJson from '@skyclause/clauses/defaults/sky.json'
import type { IndicatorRegistry, ReadingHistory, SheetInput } from '@skyclause/clauses'
import { makeOrganization, makeProject, makeWindow } from '@skyclause/db/test/factories/index'
import { expect, test } from 'vitest'
import { gradeEngine, type GradeEngine } from '../src/grades/engine'
import { gradeSky } from '../src/grades/sky'
import { inOrg, myt, publishSheet, rowsOf, skyBundle } from './grades-scene'

const capture = JSON.parse(
  readFileSync(
    new URL('../../../packages/db/test/fixtures/rainfall-graph-75-20261105T1312Z.json', import.meta.url),
    'utf8'
  )
) as { data: Array<{ timestamp: string; rf: number }> }

// The registry (packages/sources) isn't built: the one window rain indicator Flash-flood risk reads.
const registry: IndicatorRegistry = [
  { name: 'w.rain_max_4h_mm', celType: 'double', scope: 'window', unit: 'mm', sourceKind: 'jps_rain' }
]

test('a Commute disruption call on a sheet with Flash-flood risk and no Storm confirmed is graded on the default span', async () => {
  const org = await makeOrganization()
  const sheet = skyJson as unknown as SheetInput
  const clauses = sheet.clauses.filter((clause) => ['flash_flood_risk', 'silent_input'].includes(clause.key))
  expect(clauses.map((clause) => clause.span)).toEqual([undefined, undefined])
  const scene = await inOrg(org.id, async (tx) => {
    const project = await makeProject(tx)
    const versionId = await publishSheet(tx, project.id, 'sky', clauses)
    // A release wave is a zero-length `commute_wave` at the moment 89 sessions ended (D13, IDEA).
    const wave = await makeWindow(tx, {
      projectId: project.id,
      startsAt: myt('2026-11-02 15:30'),
      endsAt: myt('2026-11-02 15:30'),
      kind: 'commute_wave',
      title: '15:30 release wave'
    })
    const [call] = await skyBundle(tx, project.id, versionId, [{ windowId: wave.id, mode: 'commute_disruption' }])
    return { projectId: project.id, windowId: wave.id, callId: call!.id }
  })

  // #133's history, serving what the live 5-minute poll would have stored: each reading, 5 minutes after its stamp.
  const sourceId = randomUUID()
  const readings: ReadingHistory['readings'] = capture.data.map((row) => {
    const observedAt = new Date(`${row.timestamp}+08:00`)
    return {
      id: randomUUID(),
      sourceId,
      metric: 'rain_5m_mm',
      observedAt: observedAt.toISOString(),
      receivedAt: new Date(observedAt.getTime() + 5 * 60_000).toISOString(),
      value: row.rf,
      valueText: null,
      valueJson: null,
      itemKey: observedAt.toISOString(),
      revision: 1
    }
  })
  const asked: Array<{ from: string; to: string }> = []
  const engine: GradeEngine = {
    ...gradeEngine(),
    registry,
    history: async (_tx, query) => {
      asked.push({ from: query.from, to: query.to })
      return {
        sources: [
          {
            id: sourceId,
            kind: 'jps_rain',
            cadenceS: 300,
            staleAfterS: 600,
            freshness: 'observed',
            probation: false,
            meta: {}
          }
        ],
        polls: [],
        readings: readings.filter((r) => r.observedAt >= query.from && r.observedAt <= query.to)
      }
    }
  }

  await gradeSky(engine, myt('2026-11-02 23:55'))

  const grades = await rowsOf('grade', scene.projectId)
  expect(grades).toHaveLength(1)
  expect(grades[0]).toMatchObject({
    call_id: scene.callId,
    window_id: scene.windowId,
    outcome: 'hit',
    proposed_mode: 'commute_disruption',
    observed_mode: 'commute_disruption',
    no_call: false
  })
  // The default span closes at 16:30, not at the wave's 15:30.
  expect(asked.map((query) => query.to)).toEqual(['2026-11-02T08:30:00.000Z'])
})
