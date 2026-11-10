import { sql } from 'drizzle-orm'

// #162: shared by the analysis reads and writes; not exported from @skyclause/db.

/** `instant` as a date in `timeZone` (a zone name or the `project.time_zone` column). */
export const localDate = (instant: unknown, timeZone: unknown) =>
  sql<string>`(${instant} AT TIME ZONE ${timeZone})::date::text`
