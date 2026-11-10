import {
  insertShiftReminder,
  orgSlug,
  projectIds,
  shiftOn,
  shiftsStarting,
  type ShiftOccurrence,
  type Tx
} from '@skyclause/db'
import { renderApproverAlert } from '@skyclause/delivery'
import { z } from 'zod'
import type { QueueHandler } from '../server'
import { channelsFor, compose, inOrg, post, record, type AlertsDeps } from './send'

// #155, CAL-19 and D22: a reminder 30 minutes before every shift, and another when a conditional shift switches on.
// The 15-minute batch plans the next 24 hours from `rota_shift` (D45); each reminder is a `shift-reminders` task.

export const SHIFT_REMINDERS = 'shift-reminders'
const MINUTE = 60_000

/**
 * Whether a conditional shift is on for its date: the project's `ShiftConditions` (`unknown` counts as active), or, on
 * the organisation rota, true if any project says true, else `unknown` if any project (or none) can't say.
 */
async function conditionOn(tx: Tx, deps: AlertsDeps, o: ShiftOccurrence): Promise<boolean | 'unknown'> {
  if (!o.condition) return true
  const ids = o.projectId ? [o.projectId] : await projectIds(tx)
  const states: Array<boolean | 'unknown'> = []
  for (const projectId of ids) {
    states.push(await deps.conditions.isActive(tx, { projectId, condition: o.condition, date: o.localDate }))
  }
  if (states.includes(true)) return true
  return !ids.length || states.includes('unknown') ? 'unknown' : false
}

/**
 * Schedules each shift starting in `(now, now + 24 h]`: `before_shift` at its start less 30 minutes (now, if that has
 * passed), only while a conditional shift is on or `unknown`; and `switched_on` at once when a forecast or listing
 * has switched a conditional shift on (`true`). A kind already sent for that date is skipped.
 */
export async function planReminders(tx: Tx, deps: AlertsDeps, now: Date) {
  for (const o of await shiftsStarting(tx, now, new Date(now.getTime() + 24 * 60 * MINUTE))) {
    const on = await conditionOn(tx, deps, o)
    if (on === false) continue
    const task = (kind: 'before_shift' | 'switched_on', at: Date) =>
      deps.schedule({
        queue: SHIFT_REMINDERS,
        name: `reminder-${o.shiftId}-${o.localDate}-${kind}`,
        at,
        body: { org_id: tx.orgId, rota_shift_id: o.shiftId, local_date: o.localDate, kind }
      })
    if (!o.sent.includes('before_shift')) {
      await task('before_shift', new Date(Math.max(now.getTime(), o.startsAt.getTime() - 30 * MINUTE)))
    }
    if (o.condition && on === true && !o.sent.includes('switched_on')) await task('switched_on', now)
  }
}

const ReminderBody = z.object({
  org_id: z.string(),
  rota_shift_id: z.string(),
  local_date: z.string(),
  kind: z.enum(['before_shift', 'switched_on'])
})

/**
 * One reminder, once per shift, date and kind (`shift_reminder`), by push and email. It sends inside its
 * transaction: if nothing accepted a channel it throws, the row rolls back and Cloud Tasks retries the task. A shift
 * that has started, or a condition now off, sends nothing.
 */
export function reminderTask(deps: AlertsDeps): QueueHandler {
  return async ({ body }) => {
    const { org_id, rota_shift_id, local_date, kind } = ReminderBody.parse(body)
    await inOrg(org_id, async (tx) => {
      const o = await shiftOn(tx, rota_shift_id, local_date)
      const now = deps.now()
      if (!o || now >= o.startsAt) return
      const on = await conditionOn(tx, deps, o)
      if (on === false || (kind === 'switched_on' && on !== true)) return
      const reminderId = await insertShiftReminder(tx, {
        rotaShiftId: o.shiftId,
        accountId: o.accountId,
        localDate: o.localDate,
        kind,
        dueAt: kind === 'before_shift' ? new Date(o.startsAt.getTime() - 30 * MINUTE) : now
      })
      if (!reminderId) return
      const url = `${deps.appOrigin()}/${await orgSlug(tx)}/settings/rota`
      const rendered = renderApproverAlert({
        kind,
        template: o.template,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        url
      })
      const outgoing = []
      for (const { accountId, channel } of await channelsFor(tx, deps, [o.accountId])) {
        outgoing.push(
          await compose(tx, {
            projectId: o.projectId,
            subject: null,
            channel,
            accountId,
            needsReviewAt: null,
            key: `reminder:${reminderId}:${channel}`,
            rendered,
            url,
            tag: `reminder-${o.shiftId}`,
            ttlS: (o.startsAt.getTime() - now.getTime()) / 1000
          })
        )
      }
      const answers = await post(deps, outgoing)
      await record(tx, deps, answers)
      if (answers.some((a) => a.status === 'queued')) throw new Error(`shift reminder ${reminderId} was not accepted`)
    })
  }
}
