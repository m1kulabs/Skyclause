// #537, from #161: a labelled replay of 2 November 2026 through grade-sky. The readings are the stored JPS capture of
// gauge 0232901RF (fixtures/fixtures.json); the engine is #131's, the grader and its tables are #161's. No call was made
// that day: the approved Commute disruption call for the 15:30 release wave is a test row, the one Storm confirmed's
// 15:00 crossing proposes. Doubles of unbuilt contracts only: #133's reading history serves the capture's rows, and the
// indicator registry (packages/sources) is the one window rain indicator Storm confirmed reads.
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import skyJson from '@skyclause/clauses/defaults/sky.json'
import type { IndicatorRegistry, ReadingHistory, SheetInput } from '@skyclause/clauses'
import { makeOrganization, makeProject, makeWindow } from '@skyclause/db/test/factories/index'
import { describe, expect, test } from 'vitest'
import { gradeEngine, type GradeEngine } from '../src/grades/engine'
import { gradeSky } from '../src/grades/sky'
import { inOrg, localDatesOf, myt, publishSheet, reviewItemsOf, rowsOf, skyBundle } from './grades-scene'

interface Capture {
  stationId: string
  data: Array<{ timestamp: string; rf: number; dailyrf: number }>
}
interface FixtureEntry {
  file: string
  url: string
  captured_at: string
  station_id: string
  sha256: string
}

const FILE = 'rainfall-graph-75-20261105T1312Z.json'
const entries = JSON.parse(readFileSync(new URL('fixtures/fixtures.json', import.meta.url), 'utf8')) as FixtureEntry[]
const entry = entries.find((e) => e.file === FILE)
const bytes = readFileSync(new URL(`fixtures/${FILE}`, import.meta.url))
const capture = JSON.parse(bytes.toString('utf8')) as Capture
// `timestamp` is MYT without an offset.
const instant = (timestamp: string) => new Date(`${timestamp}+08:00`)
const rain = (from: string, to: string) =>
  capture.data.filter((row) => row.timestamp > from && row.timestamp <= to).map((row) => row.rf)
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

describe('the JPS capture behind 2 November', () => {
  test('is byte for byte the file fixtures.json names, and the 15:30 window’s span peaks at 59.5 mm', () => {
    expect(entry?.station_id).toBe('0232901RF')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry?.sha256)
    // DESIGN: the span 15:00 to 16:30 peaks at 59.5 mm in the 60 minutes to 15:35, above Lebat's 31.
    expect(sum(rain('2026-11-02T14:35:00', '2026-11-02T15:35:00'))).toBe(59.5)
  })
})

// The registry (packages/sources) isn't built: the one window rain indicator Storm confirmed reads.
const registry: IndicatorRegistry = [
  { name: 'w.rain_max_60m_mm', celType: 'double', scope: 'window', unit: 'mm', sourceKind: 'jps_rain' }
]

describe('#161 after #131: 2 November 2026, graded on the stored JPS capture', () => {
  test('replay: a Commute disruption call for the 15:30 release wave is a hit', async () => {
    const org = await makeOrganization()
    // The default Sky sheet's Storm confirmed, as published, with the silent-input guard; the capture binds no other
    // input. Flash-flood risk would also fire on this day (63.5 mm in 4 hours by 16:10), so it stays out of the sheet
    // to leave the storm clause alone as the evidence.
    const sheet = skyJson as unknown as SheetInput
    const clauses = sheet.clauses.filter((clause) => ['storm_confirmed', 'silent_input'].includes(clause.key))
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
      return { projectId: project.id, versionId, windowId: wave.id, callId: call!.id }
    })

    // #133's history, serving what the live 5-minute poll would have stored: each reading, 5 minutes after its stamp.
    const sourceId = randomUUID()
    const readingIds = new Map<string, string>()
    const readings: ReadingHistory['readings'] = capture.data.map((row) => {
      const observedAt = instant(row.timestamp)
      const id = randomUUID()
      readingIds.set(row.timestamp, id)
      return {
        id,
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
    const asked: Array<{ projectId: string; from: string; to: string }> = []
    const engine: GradeEngine = {
      ...gradeEngine(),
      registry,
      history: async (_tx, query) => {
        asked.push(query)
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

    // Storm confirmed's span closes at 16:30, an hour after the wave; the grader evaluates there, from four days back.
    expect(asked).toEqual([
      { projectId: scene.projectId, from: '2026-10-29T07:30:00.000Z', to: '2026-11-02T08:30:00.000Z' }
    ])
    const grades = await rowsOf('grade', scene.projectId)
    expect(grades).toHaveLength(1)
    expect(grades[0]).toMatchObject({
      pack: 'sky',
      call_id: scene.callId,
      window_id: scene.windowId,
      outcome: 'hit',
      proposed_mode: 'commute_disruption',
      observed_mode: 'commute_disruption',
      mode_diff: 0,
      no_call: false,
      stale_inputs: false,
      sheet_version_id: scene.versionId
    })
    expect(await localDatesOf(scene.projectId)).toEqual(['2026-11-02'])
    // The evidence is the capture's own readings: exactly the 12 stamps (14:35, 15:35] behind the 59.5 mm peak.
    const peak = capture.data
      .filter((row) => row.timestamp > '2026-11-02T14:35:00' && row.timestamp <= '2026-11-02T15:35:00')
      .map((row) => readingIds.get(row.timestamp)!)
    expect(peak).toHaveLength(12)
    expect([...(grades[0]!.reading_ids as string[])].sort()).toEqual([...peak].sort())
    // A hit needs no person: no review item, and the grade enters the ledger.
    expect(await reviewItemsOf(scene.projectId)).toEqual([])
    expect(await rowsOf('ledger_entry', scene.projectId)).toMatchObject([
      {
        kind: 'grade',
        body: { pack: 'sky', mode: 'commute_disruption', observed_mode: 'commute_disruption', outcome: 'hit' }
      }
    ])
  })
})
