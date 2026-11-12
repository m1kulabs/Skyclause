import type { window } from '../schema'

/** Full, service-validated lifecycle insert. The transaction supplies the organisation. */
export type WindowMutationInsert = Omit<typeof window.$inferInsert, 'orgId'>

/** Civil clock values retain seconds/fractions; endDayOffset describes an overnight end. */
export interface LocalSpan {
  date: string
  start: string
  end: string
  endDayOffset: number
  tz: string
}

/** Immutable full changed set, allocated before the first mutation in the batch. */
export interface CalendarBatch {
  readonly feedId: string
  readonly revision: string
  readonly windowIds: readonly string[]
}

type WindowPatch = Partial<
  Pick<WindowMutationInsert, 'title' | 'kind' | 'startsAt' | 'endsAt' | 'tz' | 'localOverride'>
>
export type WindowChange =
  | { kind: 'create'; values: WindowMutationInsert; now: Date; calendar?: CalendarBatch }
  | { kind: 'update'; id: string; patch: WindowPatch; now: Date; calendar?: CalendarBatch }
  | { kind: 'cancel'; id: string; origin: 'manual' | 'series' | 'source'; now: Date; calendar?: CalendarBatch }
  | { kind: 'restore-source'; id: string; now: Date; calendar: CalendarBatch }
