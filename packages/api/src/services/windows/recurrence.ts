import type { FieldIssue, LocalDate, NativeRule } from './calendar-types'
import { parseLocalDate } from './validation'

const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

export function validateRecurrence(rule: NativeRule, anchor: LocalDate): FieldIssue[] {
  const issues: FieldIssue[] = []
  const anchorTime = parseLocalDate(anchor)
  if (anchorTime === null) issues.push({ pointer: '/starts_at', detail: 'Anchor must be a real local calendar date.' })
  if (rule.frequency !== 'weekly')
    issues.push({ pointer: '/recurrence/frequency', detail: 'Only weekly recurrence is supported.' })
  if (
    !Array.isArray(rule.days_of_week) ||
    !rule.days_of_week.length ||
    new Set(rule.days_of_week).size !== rule.days_of_week.length
  ) {
    issues.push({ pointer: '/recurrence/days_of_week', detail: 'Choose at least one weekday, without duplicates.' })
  }
  if (Array.isArray(rule.days_of_week))
    rule.days_of_week.forEach((day, index) => {
      if (!weekdays.includes(day))
        issues.push({ pointer: `/recurrence/days_of_week/${index}`, detail: 'Use a supported weekday name.' })
    })
  if (
    Array.isArray(rule.days_of_week) &&
    anchorTime !== null &&
    !rule.days_of_week.includes(weekdays[new Date(anchorTime).getUTCDay()]!)
  ) {
    issues.push({ pointer: '/recurrence/days_of_week', detail: 'The anchor date must match a chosen weekday.' })
  }
  if ((rule.until === undefined) === (rule.count === undefined)) {
    issues.push({ pointer: '/recurrence', detail: 'Choose exactly one of until or count.' })
  }
  if (rule.count !== undefined && (!Number.isSafeInteger(rule.count) || rule.count <= 0)) {
    issues.push({ pointer: '/recurrence/count', detail: 'Count must be a positive safe integer.' })
  }
  if (rule.until !== undefined) {
    const untilTime = parseLocalDate(rule.until)
    if (untilTime === null || (anchorTime !== null && untilTime < anchorTime)) {
      issues.push({
        pointer: '/recurrence/until',
        detail: 'Until must be a real local calendar date on or after the anchor.'
      })
    }
  }
  if (!Array.isArray(rule.skip_dates)) {
    issues.push({
      pointer: '/recurrence/skip_dates',
      detail: 'Skip dates must be an array of real local calendar dates.'
    })
  } else
    rule.skip_dates.forEach((date, index) => {
      if (parseLocalDate(date) === null)
        issues.push({
          pointer: `/recurrence/skip_dates/${index}`,
          detail: 'Skip date must be a real local calendar date.'
        })
    })
  for (const key of Object.keys(rule)) {
    if (!['frequency', 'days_of_week', 'until', 'count', 'skip_dates'].includes(key)) {
      issues.push({
        pointer: `/recurrence/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
        detail: 'Unknown recurrence field.'
      })
    }
  }
  return issues
}

/** Always enumerate from the original anchor; count is consumed before skip_dates are applied. */
export function expandWeeklyDates(rule: NativeRule, anchor: LocalDate, through: LocalDate): LocalDate[] {
  const issues = validateRecurrence(rule, anchor)
  if (issues.length) throw new RangeError(issues.map((issue) => `${issue.pointer}: ${issue.detail}`).join('; '))
  const throughTime = parseLocalDate(through)
  if (throughTime === null) throw new RangeError('Through must be a real local calendar date.')
  const end = Math.min(throughTime, rule.until === undefined ? throughTime : parseLocalDate(rule.until)!)
  const selected = new Set<string>(rule.days_of_week)
  const skipped = new Set(rule.skip_dates)
  const dates: LocalDate[] = []
  let scheduled = 0
  let steps = 0
  for (let timestamp = parseLocalDate(anchor)!; timestamp <= end; timestamp += 86400000) {
    if (++steps > 100_000) throw new RangeError('Native recurrence work limit exceeded')
    const date = new Date(timestamp)
    if (!selected.has(weekdays[date.getUTCDay()]!)) continue
    scheduled += 1
    const localDate = date.toISOString().slice(0, 10)
    if (!skipped.has(localDate)) dates.push(localDate)
    if (rule.count !== undefined && scheduled >= rule.count) break
  }
  return dates
}
