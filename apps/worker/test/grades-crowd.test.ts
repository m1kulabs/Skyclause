// #161 c-grades: the grade-crowd job on the test database, with doubles of #127's ForecastSource and #131's evaluator.
// ANL-3 is a labelled replay of the committed Rapid Rail capture (fixtures/fixtures.json).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { makeOrganization } from '@skyclause/db/test/factories/index'
import { asLogin } from '@skyclause/db/test/harness/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { gradeCrowd } from '../src/grades/crowd'
import { sp17Exits } from './fixtures/sp17-exits'
import { crowdEngine, crowdProject, listedNight, localDatesOf, myt, reviewItemsOf, rowsOf } from './grades-scene'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

const nightsOf = (projectId: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ id: string; date: string; state: string }>(
      'SELECT id, date::text, state FROM night WHERE project_id = $1 ORDER BY date, id',
      [projectId]
    )
    return rows
  })

describe('the Rapid Rail capture behind ANL-3', () => {
  test('is byte for byte the file fixtures.json names, and its generator gives the spec’s SP17 figures', () => {
    const [entry] = JSON.parse(readFileSync(new URL('fixtures/fixtures.json', import.meta.url), 'utf8')) as Array<{
      file: string
      sha256: string
      station_id: string
    }>
    const bytes = readFileSync(new URL(`fixtures/${entry!.file}`, import.meta.url))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry!.sha256)
    expect(entry!.station_id).toBe('SP17')
    // #79 Testing Decisions: SP17 on 10 January 2026 = 38,447; rapidrail-od.md: 4 November 2026 = 33,804.
    expect(sp17Exits().get('2026-01-10')).toBe(38_447)
    expect(sp17Exits().get('2026-11-04')).toBe(33_804)
  })
})

describe('ANL-3', () => {
  test('replay: 4 November 2026 is graded against the 27,044 forecast written before the night, and is out of band', async () => {
    const { projectId, versionId } = await crowdProject(orgId)
    const { nightId, forecastIds } = await listedNight(orgId, projectId, '2026-11-04', '2026-11-04 18:00', [
      // IDEA's forecast, written at 01:07 MYT on the day; the later one came after arrivals began.
      { at: '2026-11-04 01:07', forecast: 27_044, low: 19_315, high: 32_100 },
      { at: '2026-11-04 19:00', forecast: 34_000, low: 30_000, high: 38_000 }
    ])
    const { engine, seen } = crowdEngine(sp17Exits())
    await gradeCrowd(engine, myt('2026-11-05 23:00'))

    const [grade] = await rowsOf('grade', projectId)
    // 33,804 exits lie above 32,100, the band's top: out of band.
    expect(grade).toMatchObject({
      pack: 'crowd',
      call_id: null,
      night_id: nightId,
      window_id: null,
      outcome: 'out_of_band',
      actual: 33_804,
      forecast_id: forecastIds[0],
      band_low: 19_315,
      band_high: 32_100,
      sheet_version_id: versionId,
      reading_ids: [seen.readingIds.get('2026-11-04')]
    })
    expect(await localDatesOf(projectId)).toEqual(['2026-11-04'])
    expect(seen.stations).toEqual(new Set(['SP17']))
    expect(await nightsOf(projectId)).toEqual([{ id: nightId, date: '2026-11-04', state: 'graded' }])
    const items = await reviewItemsOf(projectId)
    expect(items).toMatchObject([{ grade_id: grade!.id, reasons: ['out_of_band'] }])
    expect(await rowsOf('ledger_entry', projectId)).toMatchObject([
      {
        kind: 'night_graded',
        refs: { grade_id: grade!.id, night_id: nightId },
        body: { pack: 'crowd', outcome: 'out_of_band', actual: 33_804, band_low: 19_315, band_high: 32_100 }
      }
    ])
    expect((await rowsOf('domain_event', projectId)).map((e) => [e.type, e.data])).toEqual([
      ['night.graded', { night_id: nightId, outcome: 'out_of_band' }],
      ['review_item.opened', { review_item_id: items[0]!.id, outcome: 'out_of_band' }]
    ])
  })

  test('until the file covers the night nothing is written; the next run after it lands grades the night', async () => {
    const { projectId } = await crowdProject(orgId)
    const { nightId } = await listedNight(orgId, projectId, '2026-11-07', '2026-11-07 19:00', [
      { at: '2026-11-07 01:00', forecast: 21_000, low: 15_000, high: 27_000 }
    ])
    await gradeCrowd(crowdEngine(new Map()).engine, myt('2026-11-08 09:00'))
    expect(await rowsOf('grade', projectId)).toEqual([])
    expect(await nightsOf(projectId)).toEqual([{ id: nightId, date: '2026-11-07', state: 'awaiting_actuals' }])

    await gradeCrowd(crowdEngine(new Map([['2026-11-07', 24_500]])).engine, myt('2026-11-08 23:00'))
    expect(await rowsOf('grade', projectId)).toMatchObject([{ night_id: nightId, outcome: 'in_band', actual: 24_500 }])
    expect(await reviewItemsOf(projectId)).toEqual([])
  })

  test('tonight and later nights wait for D+1', async () => {
    const { projectId } = await crowdProject(orgId)
    await listedNight(orgId, projectId, '2026-11-12', '2026-11-12 19:00', [
      { at: '2026-11-12 01:00', forecast: 21_000, low: 15_000, high: 27_000 }
    ])
    await gradeCrowd(crowdEngine(new Map([['2026-11-12', 24_500]])).engine, myt('2026-11-12 23:30'))
    expect(await rowsOf('grade', projectId)).toEqual([])
  })
})

describe('unlisted surges', () => {
  test('a date nobody listed whose exits fire surge_night gets an unlisted night, which its grade names', async () => {
    const { projectId } = await crowdProject(orgId)
    const exits = new Map([
      ['2026-11-15', 41_000],
      ['2026-11-16', 9_000]
    ])
    const baselines = new Map([
      ['2026-11-15', 3_928],
      ['2026-11-16', 3_928]
    ])
    const { engine } = crowdEngine(exits, { baselines })
    await gradeCrowd(engine, myt('2026-11-20 10:00'))

    const nights = await nightsOf(projectId)
    expect(nights).toEqual([{ id: expect.any(String), date: '2026-11-15', state: 'unlisted' }])
    const grades = await rowsOf('grade', projectId)
    expect(grades).toMatchObject([{ night_id: nights[0]!.id, outcome: 'unlisted_surge', actual: 41_000 }])
    expect(await reviewItemsOf(projectId)).toMatchObject([{ grade_id: grades[0]!.id, reasons: ['unlisted_surge'] }])

    // Re-runs: the date is covered now, so nothing more is written.
    await gradeCrowd(engine, myt('2026-11-20 11:00'))
    await gradeCrowd(engine, myt('2026-11-21 11:00'))
    expect(await nightsOf(projectId)).toHaveLength(1)
    expect(await rowsOf('grade', projectId)).toHaveLength(1)
    expect(await rowsOf('ledger_entry', projectId)).toHaveLength(1)
  })

  test('a listed night’s date is never an unlisted surge', async () => {
    const { projectId } = await crowdProject(orgId)
    const { nightId } = await listedNight(orgId, projectId, '2026-11-25', '2026-11-25 19:00', [
      { at: '2026-11-25 01:00', forecast: 40_000, low: 35_000, high: 45_000 }
    ])
    const date = new Map([['2026-11-25', 41_000]])
    await gradeCrowd(crowdEngine(date, { baselines: new Map([['2026-11-25', 3_928]]) }).engine, myt('2026-11-26 10:00'))
    expect(await rowsOf('grade', projectId)).toMatchObject([{ night_id: nightId, outcome: 'in_band' }])
    expect(await nightsOf(projectId)).toHaveLength(1)
  })
})

test('with pack_crowd off, grade-crowd skips the organisation', async () => {
  const off = (await makeOrganization()).id
  const { projectId } = await crowdProject(off, { crowdOn: false })
  await listedNight(off, projectId, '2026-11-04', '2026-11-04 18:00', [
    { at: '2026-11-04 01:07', forecast: 27_044, low: 19_315, high: 32_100 }
  ])
  await gradeCrowd(crowdEngine(sp17Exits()).engine, myt('2026-11-05 23:00'))
  expect(await rowsOf('grade', projectId)).toEqual([])
})

test('without ForecastSource the job refuses, naming #127', async () => {
  const { engine } = crowdEngine(new Map())
  await expect(gradeCrowd({ ...engine, forecast: null }, myt('2026-11-05 23:00'))).rejects.toThrow(/#127/)
})
