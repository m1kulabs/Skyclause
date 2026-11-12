import { windowZoneExists } from '@skyclause/db'
import type { ServiceContext } from '../../tenancy'
import { ApiError } from '../../problems'
import type { FieldIssue, WindowFields } from './calendar-types'
import { validateWindowFields } from './validation'

const zones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
export const invalidWindow = (errors: FieldIssue[]) =>
  new ApiError(422, 'validation-failed', 'The request is invalid.', {
    errors: errors.map((error) => ({ in: 'body', ...error }))
  })
export const invalidField = (pointer: string, detail: string) => invalidWindow([{ pointer, detail }])

/** The common WIN-8 validator supplies structural machine codes; preserve the web form's original ordering. */
export function windowViolations(fields: WindowFields, now: Date): FieldIssue[] {
  const issues = validateWindowFields(fields, now)
  return [
    ...(!zones.has(fields.tz)
      ? [{ pointer: '/tz', code: 'invalid_tz' as const, detail: 'Not an IANA time zone' }]
      : []),
    ...issues.filter((issue) => issue.pointer === '/ends_at'),
    ...issues.filter((issue) => issue.pointer !== '/ends_at')
  ]
}
export async function validateFields(ctx: ServiceContext, fields: WindowFields, now: Date, timeChanged = true) {
  const issues = windowViolations(fields, now).filter(
    (issue) => timeChanged || (issue.code !== 'past' && issue.code !== 'too_far')
  )
  if (!issues.some((issue) => issue.pointer === '/tz') && !(await windowZoneExists(ctx.tx, fields.tz)))
    issues.push({ pointer: '/tz', code: 'invalid_tz', detail: 'Not a database time zone' })
  if (issues.length) throw invalidWindow(issues)
}
