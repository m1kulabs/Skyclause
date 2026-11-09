import { canonicalHash, type IndicatorSnapshot, type NightInput, type SheetInput } from '@skyclause/clauses'
import {
  crowdNights,
  gradingProjects,
  insertUnlistedNight,
  isFlagEnabled,
  liveSheet,
  lockCrowdGrading,
  railStation,
  recordGrade,
  unlistedDates,
  withSystem,
  type NewGrade,
  type Tx
} from '@skyclause/db'
import { log } from '../server'
import { requireEngine, type GradeEngine } from './engine'
import { forEachProject } from './projects'
import { addDays, crowdOutcome } from './rules'

// #161 c-grades, TRD grading: the grade-crowd job (hourly). A night is graded on D+1 once the Rapid Rail file covers
// it; until then `exits` answers `pendingUntil` and nothing is written, so it reads "pending" (ANL-3).

const JOB = 'grade-crowd'
/** Days before today checked for unlisted surges, so a late file or a missed run still catches up. */
const UNLISTED_DAYS = 14
type Engine = ReturnType<typeof requireEngine<'forecast' | 'registry'>>

export async function gradeCrowd(e: GradeEngine, now: Date) {
  const engine = requireEngine(e, JOB, ['forecast', 'registry'])
  // §6: with `pack_crowd` off for an organisation, its projects are skipped.
  const projects = await withSystem(JOB, async (tx) => {
    const all = await gradingProjects(tx, now)
    const on = new Map<string, boolean>()
    for (const { orgId } of all) if (!on.has(orgId)) on.set(orgId, await isFlagEnabled(tx, 'pack_crowd', orgId))
    return all.filter((p) => on.get(p.orgId))
  })
  await forEachProject(JOB, projects, (tx, p) => gradeProject(tx, engine, { ...p, now }))
}

async function gradeProject(
  tx: Tx,
  engine: Engine,
  q: { projectId: string; timeZone: string; today: string; now: Date }
) {
  await lockCrowdGrading(tx, q.projectId)
  const station = await railStation(tx, q.projectId)
  if (!station) {
    log('INFO', `${JOB}: no rail station bound`, { projectId: q.projectId })
    return 0
  }
  const live = await liveSheet(tx, q.projectId, 'crowd')
  if (!live) throw new Error(`project ${q.projectId} has no live Crowd sheet`)
  type CrowdGrade = Pick<NewGrade, 'nightId' | 'outcome' | 'localDate' | 'actual' | 'readingIds' | 'reasons'> &
    Partial<Pick<NewGrade, 'forecastId' | 'bandLow' | 'bandHigh'>>
  const crowd = (g: CrowdGrade) =>
    recordGrade(tx, {
      projectId: q.projectId,
      pack: 'crowd',
      sheetVersionId: live.versionId,
      proposedMode: null,
      observedMode: null,
      modeDiff: 0,
      noCall: false,
      // A night's grade has no call to agree with the shadow verdict.
      agrees: false,
      staleInputs: false,
      ledger: true,
      ...g
    })
  const { today } = q
  let graded = 0

  for (const n of await crowdNights(tx, { projectId: q.projectId, before: today })) {
    const exits = await engine.forecast.exits(tx, { stationId: station.stationId, date: n.date })
    if ('pendingUntil' in exits) continue
    if (!n.forecast) {
      log('ERROR', `${JOB}: no forecast was written before the night's arrival`, { nightId: n.id })
      continue
    }
    const outcome = crowdOutcome(exits.value, { low: n.forecast.bandLow, high: n.forecast.bandHigh })
    const written = await crowd({
      nightId: n.id,
      outcome,
      localDate: n.date,
      actual: exits.value,
      forecastId: n.forecast.id,
      bandLow: n.forecast.bandLow,
      bandHigh: n.forecast.bandHigh,
      readingIds: [exits.readingId],
      reasons: outcome === 'out_of_band' ? ['out_of_band'] : []
    })
    if (written) graded++
  }

  const dates = await unlistedDates(tx, {
    projectId: q.projectId,
    timeZone: q.timeZone,
    from: addDays(today, -UNLISTED_DAYS),
    to: addDays(today, -1)
  })
  for (const { date, startsAt } of dates) {
    const exits = await engine.forecast.exits(tx, { stationId: station.stationId, date })
    if ('pendingUntil' in exits) continue
    const baseline = await engine.forecast.baseline(tx, { stationId: station.stationId, date })
    if (!baseline) {
      log('INFO', `${JOB}: no baseline, so no unlisted-surge check`, { projectId: q.projectId, date })
      continue
    }
    const night = { date, actual: exits.value, baseline: baseline.value, start: startsAt }
    if (!surgeFires(engine, live.content as SheetInput, q.projectId, night, q.now)) continue
    const nightId = await insertUnlistedNight(tx, { projectId: q.projectId, date })
    const written = await crowd({
      nightId,
      outcome: 'unlisted_surge',
      localDate: date,
      actual: exits.value,
      readingIds: [exits.readingId, ...baseline.readingIds],
      reasons: ['unlisted_surge']
    })
    if (written) graded++
  }
  return graded
}

/**
 * Whether the published sheet's `surge_night` clause fires for a date nobody listed, evaluated with the actual exits
 * as the night's figure against its baseline. The night has no listed times, so its date's start stands in.
 */
function surgeFires(
  engine: Engine,
  sheet: SheetInput,
  projectId: string,
  n: { date: string; actual: number; baseline: number; start: Date },
  now: Date
) {
  const clause = sheet.clauses.find((c) => c.key === 'surge_night' && c.enabled)
  if (!clause) return false
  const checked = engine.check({ pack: 'crowd', clauses: [clause] }, engine.registry)
  if (!checked.ok || !checked.sheet) {
    throw new Error(`surge_night doesn't check: ${checked.issues.map((i) => i.message).join('; ')}`)
  }
  const night: NightInput = {
    id: `unlisted:${n.date}`,
    date: n.date,
    baseline: n.baseline,
    uplift: n.actual - n.baseline,
    forecast: n.actual,
    band: null,
    doors: null,
    show: null,
    arrivalStart: n.start.toISOString(),
    arrivalEnd: null,
    exitStart: null,
    exitEnd: null,
    singleSource: false,
    forecastId: null,
    state: 'fresh'
  }
  const tEval = now.toISOString()
  const unhashed = { projectId, pack: 'crowd' as const, tEval, inputs: [], site: {}, series: {}, nights: [night] }
  const snapshot: IndicatorSnapshot = {
    ...unhashed,
    registryHash: checked.sheet.registryHash,
    hash: canonicalHash(unhashed)
  }
  const verdict = engine.evaluate(checked.sheet, snapshot, [], tEval).nights.find((v) => v.scope.id === night.id)
  return verdict?.clauses.some((c) => c.key === 'surge_night' && c.result === 'fired') ?? false
}
