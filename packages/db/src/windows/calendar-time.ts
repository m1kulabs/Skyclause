import { sql } from 'drizzle-orm'
import type { Tx } from '../client'
import type { LocalSpan } from './types'

export class WindowLocalTimeError extends Error {}

/** PostgreSQL resolves each exact civil timestamp; a round trip refuses DST gaps. */
export async function resolveWindowLocalSpan(tx: Tx, span: LocalSpan): Promise<{ startsAt: Date; endsAt: Date }> {
  const { rows } = await tx.execute<{ startsAt: string; endsAt: string; valid: boolean }>(sql`
    WITH civil AS (
      SELECT (${span.date}::date + ${span.start}::time) AS start_local,
        ((${span.date}::date + ${span.endDayOffset}::integer) + ${span.end}::time) AS end_local
    ), resolved AS (
      SELECT *, start_local AT TIME ZONE ${span.tz} AS starts_at,
        end_local AT TIME ZONE ${span.tz} AS ends_at FROM civil
    ) SELECT starts_at AS "startsAt", ends_at AS "endsAt",
      (starts_at AT TIME ZONE ${span.tz} = start_local AND ends_at AT TIME ZONE ${span.tz} = end_local) AS valid
    FROM resolved
  `)
  const row = rows[0]!
  if (!row.valid) throw new WindowLocalTimeError('nonexistent local time')
  return { startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt) }
}

/** Exact stored wall clocks for template derivation, without process-local timezone arithmetic. */
export async function windowLocalSpan(
  tx: Tx,
  fields: { startsAt: Date; endsAt: Date; tz: string }
): Promise<LocalSpan> {
  const { rows } = await tx.execute<{ date: string; start: string; end: string; endDayOffset: number }>(sql`
    SELECT to_char(${fields.startsAt.toISOString()}::timestamptz AT TIME ZONE ${fields.tz}, 'YYYY-MM-DD') AS date,
      to_char(${fields.startsAt.toISOString()}::timestamptz AT TIME ZONE ${fields.tz}, 'HH24:MI:SS.MS') AS start,
      to_char(${fields.endsAt.toISOString()}::timestamptz AT TIME ZONE ${fields.tz}, 'HH24:MI:SS.MS') AS end,
      ((${fields.endsAt.toISOString()}::timestamptz AT TIME ZONE ${fields.tz})::date -
       (${fields.startsAt.toISOString()}::timestamptz AT TIME ZONE ${fields.tz})::date)::integer AS "endDayOffset"
  `)
  return { ...rows[0]!, tz: fields.tz }
}

export async function windowZoneExists(tx: Tx, tz: string): Promise<boolean> {
  const { rows } = await tx.execute<{ present: boolean }>(
    sql`SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name = ${tz}) AS present`
  )
  return rows[0]!.present
}
