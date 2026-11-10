// Real #131 engine through the #161 consumer. Only the history provider is an
// isolated test double; every simulated five-minute observation is explicit.
import { randomUUID } from 'node:crypto'
import skyJson from '@skyclause/clauses/defaults/sky.json'
import type { IndicatorRegistry, ReadingHistory, SheetInput } from '@skyclause/clauses'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { expect, test } from 'vitest'
import { gradeEngine, type GradeEngine } from '../src/grades/engine'
import { gradeSky } from '../src/grades/sky'
import { inOrg, myt, publishSheet, rowsOf, skyBundle, windowAt } from './grades-scene'

const registry: IndicatorRegistry = [
  { name: 'w.rain_max_60m_mm', celType: 'double', scope: 'window', unit: 'mm', sourceKind: 'jps_rain' },
  { name: 'w.rain_max_4h_mm', celType: 'double', scope: 'window', unit: 'mm', sourceKind: 'jps_rain' }
]

test('grade-sky checks the pinned JSON sheet then uses real snapshot/evaluate and records their evidence', async () => {
  const org = await makeOrganization()
  const sheet = skyJson as unknown as SheetInput
  const clauses = sheet.clauses.filter((clause) =>
    ['storm_confirmed', 'flash_flood_risk', 'silent_input'].includes(clause.key)
  )
  const scene = await inOrg(org.id, async (tx) => {
    const project = await makeProject(tx)
    const versionId = await publishSheet(tx, project.id, 'sky', clauses)
    const window = await windowAt(tx, project.id, '2030-11-02 09:00', '2030-11-02 11:00')
    await skyBundle(tx, project.id, versionId, [{ windowId: window.id, mode: 'commute_disruption' }])
    return { projectId: project.id, versionId, window }
  })
  const from = myt('2030-11-02 06:35').getTime()
  const to = myt('2030-11-02 12:00').getTime()
  const burst = myt('2030-11-02 10:30').getTime()
  const sourceId = randomUUID()
  const readings: ReadingHistory['readings'] = []
  for (let ms = from; ms <= to; ms += 300000) {
    const observedAt = new Date(ms).toISOString()
    readings.push({
      id: randomUUID(),
      sourceId,
      metric: 'rain_5m_mm',
      observedAt,
      receivedAt: observedAt,
      value: ms === burst ? 40 : 0,
      valueText: null,
      valueJson: null,
      itemKey: observedAt,
      revision: 1
    })
  }
  const history: ReadingHistory = {
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
    readings
  }
  const engine: GradeEngine = {
    ...gradeEngine(),
    registry,
    history: async (_tx, query) => {
      expect(query.projectId).toBe(scene.projectId)
      expect(query.to).toBe(new Date(to).toISOString())
      return history
    }
  }
  await gradeSky(engine, myt('2030-11-02 23:55'))
  const grades = await rowsOf('grade', scene.projectId)
  expect(grades).toHaveLength(1)
  expect(grades[0]).toMatchObject({
    outcome: 'hit',
    proposed_mode: 'commute_disruption',
    observed_mode: 'commute_disruption',
    no_call: false,
    sheet_version_id: scene.versionId
  })
  expect(grades[0]!.reading_ids).toHaveLength(48)
  expect(grades[0]!.reading_ids).toContain(readings.find((reading) => Date.parse(reading.observedAt) === burst)!.id)
})
