import type { AgentInput } from '@skyclause/agent'
import type { CheckedSheet, IndicatorSnapshot, Window } from '@skyclause/clauses'
import {
  grade,
  localClock,
  member,
  night,
  project,
  projectSource,
  reading,
  rotaShift,
  source,
  startOfLocalDay,
  subscriber,
  window,
  type RunRow,
  type Tx
} from '@skyclause/db'
import { and, arrayOverlaps, asc, eq, gte, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'

// #151: what a run hands the agent (TRD "Agent inputs and output schema", #79 §2 AgentInput). IDs, roles and languages
// only: no window title, email or name enters a prompt (NFR-11).

const instant = (date: Date) => date.toISOString().replace('.000Z', 'Z')
/** `HH:MM` or `HH:MM:SS` as minutes since midnight. */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

export async function projectOf(tx: Tx, projectId: string) {
  const [row] = await tx.select().from(project).where(eq(project.id, projectId))
  if (!row) throw new Error(`project ${projectId} is not visible in this transaction`)
  return row
}

/**
 * The windows a run drafts for: the ones it names, or else the project's uncancelled windows still open at `now` that
 * start before the next local midnight ("today's Sky windows", CAL-1). Crowd runs draft for nights instead.
 */
export async function windowsAtRisk(tx: Tx, r: RunRow, now: Date): Promise<Window[]> {
  if (r.pack === 'crowd') return []
  let rows: Array<typeof window.$inferSelect>
  if (r.windowIds.length) {
    rows = await tx
      .select()
      .from(window)
      .where(and(inArray(window.id, r.windowIds), isNull(window.cancelledAt)))
      .orderBy(asc(window.startsAt), asc(window.id))
  } else {
    const { timeZone } = await projectOf(tx, r.projectId)
    const midnight = await startOfLocalDay(tx, addDays((await localClock(tx, now, timeZone)).date, 1), timeZone)
    rows = await tx
      .select()
      .from(window)
      .where(
        and(
          eq(window.projectId, r.projectId),
          isNull(window.cancelledAt),
          gte(window.endsAt, now),
          lt(window.startsAt, midnight)
        )
      )
      .orderBy(asc(window.startsAt), asc(window.id))
  }
  return rows.map((w) => ({
    id: w.id,
    startsAt: instant(w.startsAt),
    endsAt: instant(w.endsAt),
    kind: w.kind,
    tz: w.tz
  }))
}

/** Bound sources' URLs by source ID: the links a notice may carry and each shadow input's `source_url`. */
export async function boundSourceUrls(tx: Tx, projectId: string) {
  const rows = await tx
    .select({ id: source.id, url: source.url })
    .from(projectSource)
    .innerJoin(source, eq(source.id, projectSource.sourceId))
    .where(eq(projectSource.projectId, projectId))
  return new Map(rows.map((row) => [row.id, row.url]))
}

const APPROVER_ROLES = ['approver', 'admin', 'owner']

/** LOC-5: an approver on duty now (an unconditional shift of the project's or the organisation's rota) reads Malay. */
async function malayReaderOnDuty(tx: Tx, r: RunRow, now: Date, timeZone: string) {
  const { weekday, minutes } = await localClock(tx, now, timeZone)
  const shifts = await tx
    .select()
    .from(rotaShift)
    .where(and(isNull(rotaShift.condition), or(eq(rotaShift.projectId, r.projectId), isNull(rotaShift.projectId))))
  const onDuty = shifts.filter((s) => {
    const [start, end] = [minutesOf(s.localStart), minutesOf(s.localEnd)]
    const inside = start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end
    return s.days.includes(weekday) && inside
  })
  if (!onDuty.length) return false
  const readers = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, r.orgId),
        inArray(
          member.userId,
          onDuty.map((s) => s.accountId)
        ),
        inArray(member.role, APPROVER_ROLES),
        eq(member.readsMalay, true)
      )
    )
    .limit(1)
  return readers.length > 0
}

/** MET warning text verbatim (LOC-3): the readings behind a site warning indicator that is in force. */
async function metWarnings(tx: Tx, snapshot: IndicatorSnapshot) {
  const ids = Object.values(snapshot.site)
    .filter((v) => v.name.endsWith('met_warning_in_force') && v.value === true)
    .flatMap((v) => v.readingIds)
  if (!ids.length) return []
  const rows = await tx
    .select({ text: reading.valueText })
    .from(reading)
    .where(and(inArray(reading.id, ids), isNotNull(reading.valueText)))
    .orderBy(asc(reading.observedAt))
  return [...new Set(rows.map((row) => row.text!))]
}

/** Yesterday's grades in the project's zone: Sky windows that started yesterday, Crowd nights dated yesterday. */
async function yesterdayGrades(tx: Tx, r: RunRow, now: Date, timeZone: string) {
  const today = (await localClock(tx, now, timeZone)).date
  const yesterday = addDays(today, -1)
  const [from, to] = [await startOfLocalDay(tx, yesterday, timeZone), await startOfLocalDay(tx, today, timeZone)]
  const rows = await tx
    .select({ windowId: grade.windowId, nightId: grade.nightId, outcome: grade.outcome })
    .from(grade)
    .leftJoin(window, eq(window.id, grade.windowId))
    .leftJoin(night, eq(night.id, grade.nightId))
    .where(
      and(
        eq(grade.projectId, r.projectId),
        eq(grade.pack, r.pack),
        or(and(gte(window.startsAt, from), lt(window.startsAt, to)), eq(night.date, yesterday))
      )
    )
    .orderBy(asc(grade.createdAt))
  return rows.map((row) => ({ window_id: (row.windowId ?? row.nightId)!, outcome: row.outcome }))
}

/** Confirmed subscribers of each window, as opaque IDs with role and language (CAL-3). */
async function candidates(tx: Tx, r: RunRow, windows: Window[]) {
  const out: AgentInput['candidates'] = Object.fromEntries(windows.map((w) => [w.id, []]))
  if (!windows.length) return out
  const rows = await tx
    .select({
      id: subscriber.id,
      role: subscriber.role,
      language: subscriber.language,
      windowIds: subscriber.windowIds
    })
    .from(subscriber)
    .where(
      and(
        eq(subscriber.projectId, r.projectId),
        isNotNull(subscriber.confirmedAt),
        arrayOverlaps(
          subscriber.windowIds,
          windows.map((w) => w.id)
        )
      )
    )
    .orderBy(asc(subscriber.id))
  for (const row of rows) {
    const language = row.language === 'ms' ? 'ms' : 'en'
    for (const id of row.windowIds) out[id]?.push({ id: row.id, ...(row.role ? { role: row.role } : {}), language })
  }
  return out
}

/** Every input the agent sees, assembled before the call (TRD); `quotable` adds nothing beyond the snapshot's own. */
export async function agentInput(
  tx: Tx,
  o: {
    run: RunRow
    snapshot: IndicatorSnapshot
    windows: Window[]
    sheet: CheckedSheet
    now: Date
    origins: string[]
  }
): Promise<AgentInput> {
  const { run: r, snapshot, windows, sheet, now } = o
  const { timeZone } = await projectOf(tx, r.projectId)
  const urls = await boundSourceUrls(tx, r.projectId)
  return {
    pack: r.pack,
    sheet: {
      pack: sheet.pack,
      clauses: sheet.clauses
        .filter((c) => c.enabled)
        .map((c) => ({
          key: c.key,
          when: c.when,
          wording: { ...(c.wording.en ? { en: c.wording.en } : {}), ...(c.wording.ms ? { ms: c.wording.ms } : {}) }
        }))
    },
    snapshot: {
      projectId: snapshot.projectId,
      pack: snapshot.pack,
      tEval: snapshot.tEval,
      inputs: snapshot.inputs,
      site: snapshot.site,
      series: snapshot.series,
      nights: snapshot.nights,
      registryHash: snapshot.registryHash,
      hash: snapshot.hash
    },
    met_warnings: await metWarnings(tx, snapshot),
    windows: windows.map((w) => ({ id: w.id, starts_at: w.startsAt, ends_at: w.endsAt })),
    candidates: await candidates(tx, r, windows),
    yesterday_grades: await yesterdayGrades(tx, r, now, timeZone),
    quotable: [],
    malay_reader: await malayReaderOnDuty(tx, r, now, timeZone),
    source_urls: [...new Set(urls.values())],
    origins: o.origins
  }
}
