import type { NightInput } from '@skyclause/clauses'
import type { ForecastSource } from '@skyclause/contracts'
import {
  CROWD_OUTLOOK_AT,
  crowdOutlooksDue,
  projectGate,
  runsServing,
  startOfLocalDay,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { requestUnlessRefused } from '../runs/consumers'
import { addDays, minutesOf } from '../runs/inputs'
import { log, type WorkerPart } from '../server'

// #160 c-crowd-outlook: Crowd runs nobody asks for (PRD CAL-2). At the first 15-minute batch (D45) at or after 07:00
// on a Crowd project's clock, one outlook run for its listed nights in the next 14 days.

const JOB = 'crowd-outlook'

/** #127's port, which returns listed nights only. */
export type ListedNights = Pick<ForecastSource, 'nights'>

/** Requests today's outlook for each project due one, under `withTenant` as system job `crowd-outlook`. */
async function requestOutlooks(forecast: ListedNights | null, now: Date) {
  const due = await withSystem(JOB, (tx) => crowdOutlooksDue(tx, now))
  if (!forecast) {
    // No outlook can run without the port: one line a batch, not one per project.
    if (due.length) {
      log('ERROR', 'no ForecastSource: #127 has not set one; no Crowd outlook this batch', {
        project_ids: due.map((p) => p.projectId)
      })
    }
    return
  }
  for (const p of due) {
    const dedupeKey = `schedule:${p.projectId}:crowd:${p.date}:${CROWD_OUTLOOK_AT}`
    await withTenant({ orgId: p.orgId, principal: systemPrincipal(JOB) }, async (tx) => {
      // A project that isn't open starts nothing (PRJ-8), and once today's outlook is in a run, later batches are
      // no-ops: neither reads nights.
      if ((await projectGate(tx, p.projectId)) !== 'open') return
      const [requested] = await runsServing(tx, dedupeKey, { projectId: p.projectId, pack: 'crowd' })
      if (requested) return
      // A failed read requests nothing: no run starts on stale or invented nights, and the next batch retries.
      let nights: NightInput[]
      try {
        nights = await forecast.nights(tx, { projectId: p.projectId, from: p.date, to: addDays(p.date, 13) })
      } catch (error) {
        log('ERROR', 'ForecastSource failed; no Crowd outlook this batch', {
          project_id: p.projectId,
          error: String(error)
        })
        return
      }
      const midnight = await startOfLocalDay(tx, p.date, p.timeZone)
      // A suspension since the gate was read above is refused here, and the batch goes on to the next project.
      await requestUnlessRefused(tx, {
        projectId: p.projectId,
        pack: 'crowd',
        trigger: 'schedule',
        triggerRef: CROWD_OUTLOOK_AT,
        nightIds: nights.map((n) => n.id),
        dedupeKey,
        triggeredAt: new Date(midnight.getTime() + minutesOf(CROWD_OUTLOOK_AT) * 60_000).toISOString()
      })
    })
  }
}

export function createOutlookPart(forecast: ListedNights | null): WorkerPart {
  return { owner: 'c-crowd-outlook', batch: { [JOB]: (now) => requestOutlooks(forecast, now) } }
}

/**
 * Production. #127's ForecastSource isn't built: until its owner passes it here, a batch with outlooks due logs one
 * error and requests nothing.
 */
export const outlook = createOutlookPart(null)
