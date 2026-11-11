import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { SystemPrincipal, Tx } from '../client'
import { project, projectPack } from '../schema'

// #151: the local clock runs read in a project's time zone (its date, ISO weekday and minutes since midnight), worked
// out by Postgres from the zone database.

export interface LocalClock {
  /** `YYYY-MM-DD` in the zone. */
  date: string
  /** ISO weekday, Monday 1 to Sunday 7. */
  weekday: number
  minutes: number
}

/** `at` on the clock of `zone`, a zone name or column, as SQL expressions. */
export const clockOf = (at: Date, zone: unknown) => {
  const local = sql`(${at.toISOString()}::timestamptz AT TIME ZONE ${zone})`
  return {
    date: sql<string>`to_char(${local}, 'YYYY-MM-DD')`,
    weekday: sql<number>`extract(isodow FROM ${local})::int`,
    minutes: sql<number>`(extract(hour FROM ${local}) * 60 + extract(minute FROM ${local}))::int`
  }
}

/** `at` on the wall clock of `timeZone`. */
export async function localClock(tx: Tx, at: Date, timeZone: string): Promise<LocalClock> {
  const c = clockOf(at, timeZone)
  const { rows } = await tx.execute<{ date: string; weekday: number; minutes: number }>(
    sql`SELECT ${c.date} AS date, ${c.weekday} AS weekday, ${c.minutes} AS minutes`
  )
  return { date: rows[0]!.date, weekday: Number(rows[0]!.weekday), minutes: Number(rows[0]!.minutes) }
}

/**
 * The Sky packs that may run on a schedule (enabled, project not archived), across organisations under `withSystem`,
 * each with its stored schedule and `now` on its project's clock.
 */
export function scheduledSkyPacks(tx: Tx<SystemPrincipal>, now: Date) {
  const c = clockOf(now, project.timeZone)
  return tx
    .select({
      projectId: project.id,
      orgId: project.orgId,
      timeZone: project.timeZone,
      schedule: projectPack.schedule,
      date: c.date,
      weekday: c.weekday,
      minutes: c.minutes
    })
    .from(projectPack)
    .innerJoin(project, eq(project.id, projectPack.projectId))
    .where(and(eq(projectPack.pack, 'sky'), eq(projectPack.enabled, true), isNull(project.archivedAt)))
    .orderBy(asc(project.id))
}
