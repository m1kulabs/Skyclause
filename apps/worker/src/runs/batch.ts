import {
  project,
  run,
  runPublisher,
  scheduledSkyPacks,
  startOfLocalDay,
  systemPrincipal,
  withSystem,
  withTenant
} from '@skyclause/db'
import { and, asc, eq, lt } from 'drizzle-orm'
import { z } from 'zod'
import { log } from '../server'
import { requestUnlessRefused } from './consumers'
import { minutesOf } from './inputs'

// #151, D45: the run orchestrator's work in the 15-minute batch: the Sky schedule (CAL-1) and the republish of runs
// still queued. Each lists its targets under `withSystem`, then works per organisation in `withTenant` as `system`, one
// call after another, as `shareSystemConnection` needs.

/** PRD CAL-1: 06:45 Monday to Friday in the project's zone, when `project_pack.schedule` is unset. */
export const DEFAULT_SKY_SCHEDULE = '45 6 * * 1-5'

/** One cron field: numbers, ranges and lists, each at most `max`; null when it reads otherwise. */
const cronField = (field: string, max: number) => {
  const values = field.split(',').flatMap((part) => {
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])]
      return from <= to ? Array.from({ length: to - from + 1 }, (_, i) => from + i) : [NaN]
    }
    return /^\d+$/.test(part) ? [Number(part)] : [NaN]
  })
  return values.every((v) => v <= max) && !values.some(Number.isNaN) ? values : null
}

/**
 * `project_pack.schedule`: a five-field cron string with minute and hour lists, `*` for day of month and month, and
 * a weekday list or range (0 and 7 are Sunday). Returns the day's slots as `HH:MM` and the ISO weekdays, or null.
 */
export function parseSchedule(text: string): { slots: string[]; weekdays: Set<number> } | null {
  const fields = text.trim().split(/\s+/)
  if (fields.length !== 5 || fields[2] !== '*' || fields[3] !== '*') return null
  const [minutes, hours] = [cronField(fields[0]!, 59), cronField(fields[1]!, 23)]
  const days = fields[4] === '*' ? [1, 2, 3, 4, 5, 6, 7] : cronField(fields[4]!, 7)
  if (!minutes || !hours || !days) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const slots = hours.flatMap((h) => minutes.map((m) => `${pad(h)}:${pad(m)}`)).sort()
  return { slots: [...new Set(slots)], weekdays: new Set(days.map((d) => (d === 0 ? 7 : d))) }
}

const Schedule = z.string().nullable()

/**
 * CAL-1: at the first batch at or after each slot of a Sky project's schedule, a `schedule` run for today's windows.
 * Its dedupe key, `schedule:{project}:sky:{date}:{HH:MM}`, makes every later batch that day a no-op, so a missed batch
 * catches up the same day. An unreadable schedule is logged and that project skipped.
 */
export async function requestScheduledRuns(now: Date) {
  const job = 'runs-sky-schedule'
  const targets = await withSystem(job, (tx) => scheduledSkyPacks(tx, now))
  for (const t of targets) {
    const stored = Schedule.safeParse(t.schedule)
    const schedule = stored.success ? parseSchedule(stored.data ?? DEFAULT_SKY_SCHEDULE) : null
    if (!schedule) {
      log('ERROR', 'unreadable Sky schedule; no schedule run', { project_id: t.projectId, schedule: t.schedule })
      continue
    }
    if (!schedule.weekdays.has(t.weekday)) continue
    for (const slot of schedule.slots.filter((s) => minutesOf(s) <= t.minutes)) {
      await withTenant({ orgId: t.orgId, principal: systemPrincipal(job) }, async (tx) => {
        const midnight = await startOfLocalDay(tx, t.date, t.timeZone)
        await requestUnlessRefused(tx, {
          projectId: t.projectId,
          pack: 'sky',
          trigger: 'schedule',
          triggerRef: slot,
          dedupeKey: `schedule:${t.projectId}:sky:${t.date}:${slot}`,
          triggeredAt: new Date(midnight.getTime() + minutesOf(slot) * 60_000).toISOString()
        })
      })
    }
  }
}

/**
 * Runs `queued` for over 60 s, published again: their message was lost, or their project and pack's running run
 * finished without publishing them. Throws without a publisher, so a missing one fails the batch (D9).
 */
export async function republishQueuedRuns(now: Date) {
  const publish = runPublisher()
  if (!publish) throw new Error('no run publisher: the composition root must call setRunPublisher')
  const job = 'runs-republish'
  const orgs = await withSystem(job, (tx) => tx.selectDistinct({ orgId: project.orgId }).from(project))
  let published = 0
  for (const { orgId } of orgs) {
    const queued = await withTenant({ orgId, principal: systemPrincipal(job) }, (tx) =>
      tx
        .select({ id: run.id })
        .from(run)
        .where(and(eq(run.status, 'queued'), lt(run.createdAt, new Date(now.getTime() - 60_000))))
        .orderBy(asc(run.createdAt))
    )
    for (const { id } of queued) {
      await publish({ run_id: id, org_id: orgId })
      published++
    }
  }
  return published
}
