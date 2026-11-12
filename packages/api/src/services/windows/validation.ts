import type { FieldIssue, WindowFields } from './calendar-types'

/** UTC midnight is only a civil-date arithmetic coordinate, never a project-zone conversion. */
export function parseLocalDate(value: string): number | null {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null
  return timestamp
}

function parseWindowInstant(value: string): number | null {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(value)) return null
  if (parseLocalDate(value.slice(0, 10)) === null) return null
  return Date.parse(value)
}

/** WIN-8 elapsed-time checks; the service seam verifies that the project zone exists. */
export function validateWindowFields(fields: WindowFields, now: Date): FieldIssue[] {
  const issues: FieldIssue[] = []
  const start = parseWindowInstant(fields.starts_at)
  const end = parseWindowInstant(fields.ends_at)
  if (start === null) {
    issues.push({
      pointer: '/starts_at',
      detail: 'Use a valid UTC instant with a positive four-digit year and at most millisecond precision.'
    })
  } else if (start < now.getTime() || start > now.getTime() + 90 * 86400000) {
    issues.push({ pointer: '/starts_at', detail: 'Start must be between now and 90 elapsed days ahead, inclusive.' })
  }
  if (end === null) {
    issues.push({
      pointer: '/ends_at',
      detail: 'Use a valid UTC instant with a positive four-digit year and at most millisecond precision.'
    })
  } else if (
    start !== null &&
    (end < start || (end === start && fields.kind !== 'commute_wave') || end - start > 12 * 3600000)
  ) {
    issues.push({
      pointer: '/ends_at',
      detail: 'End must follow start by at most 12 hours; only commute waves may have zero duration.'
    })
  }
  return issues
}
