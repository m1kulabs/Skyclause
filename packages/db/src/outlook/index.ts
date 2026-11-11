import { and, asc, eq, gte, isNull } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { isFlagEnabled } from '../flags'
import { clockOf } from '../runs/clock'
import { project, projectPack } from '../schema'

// #160 c-crowd-outlook: which projects are due the daily Crowd outlook run (PRD CAL-2).

/** The outlook's time on each project's clock (`Asia/Kuala_Lumpur` for every P1 project). */
export const CROWD_OUTLOOK_AT = '07:00'
const OUTLOOK_MINUTES = 7 * 60

/**
 * The projects due today's Crowd outlook at `now`, across organisations under `withSystem`, each with its local date:
 * the Crowd pack enabled, the project not archived, the organisation's `pack_crowd` on and 07:00 passed on the
 * project's clock. Every batch until midnight finds a project again, so a missed one catches up; the run's dedupe key
 * keeps it to one a day.
 */
export async function crowdOutlooksDue(tx: Tx<SystemPrincipal>, now: Date) {
  const c = clockOf(now, project.timeZone)
  const due = await tx
    .select({ projectId: project.id, orgId: project.orgId, timeZone: project.timeZone, date: c.date })
    .from(projectPack)
    .innerJoin(project, eq(project.id, projectPack.projectId))
    .where(
      and(
        eq(projectPack.pack, 'crowd'),
        eq(projectPack.enabled, true),
        isNull(project.archivedAt),
        gte(c.minutes, OUTLOOK_MINUTES)
      )
    )
    .orderBy(asc(project.id))
  const on = new Map<string, boolean>()
  for (const { orgId } of due) if (!on.has(orgId)) on.set(orgId, await isFlagEnabled(tx, 'pack_crowd', orgId))
  return due.filter((p) => on.get(p.orgId))
}
