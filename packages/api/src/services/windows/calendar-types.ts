import type { Operations } from '@skyclause/contracts'
import type { z } from 'zod'

type WindowInput = z.infer<Operations['createWindow']['request']['body']['content']['application/json']['schema']>

export type FieldIssue = {
  pointer: string
  detail: string
  code?: 'invalid_instant' | 'end_before_start' | 'too_long' | 'too_far' | 'past' | 'invalid_tz'
}
export type LocalDate = string // validated YYYY-MM-DD
export type NativeRule = NonNullable<WindowInput['recurrence']>
export type WindowKind = WindowInput['kind']
export type WindowFields = Pick<WindowInput, 'starts_at' | 'ends_at' | 'kind' | 'tz'>

export interface LocalSpan {
  date: LocalDate
  start: string
  end: string
  endDayOffset: number
  tz: string
}
export type ResolveLocalSpan = (span: LocalSpan) => Promise<{ startsAt: Date; endsAt: Date }>
export interface CalendarOptions {
  projectTz: string
  kind: WindowKind
  now: Date
  through: Date
  resolveLocalSpan: ResolveLocalSpan
}
export interface CalendarIssue {
  uid: string | null
  recurrenceId: string | null
  pointer: string
  detail: string
}
export interface CalendarOccurrence {
  uid: string
  recurrenceId: string
  recurring: boolean
  startsAt: Date
  endsAt: Date
  title: string
  tz: string
}
export interface CalendarDocument {
  version: 1
  jcal: unknown[]
}
export interface ParsedCalendar {
  document: CalendarDocument
  occurrences: CalendarOccurrence[]
  skipped: CalendarIssue[]
  protectedIdentities: Array<{ uid: string; recurrenceId: string | null }>
}
