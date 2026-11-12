import { sql } from 'drizzle-orm'
import type { Tx } from '../client'
import type { LocalSpan } from './types'

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
  if (!row.valid) throw new Error('nonexistent local time')
  return { startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt) }
}
