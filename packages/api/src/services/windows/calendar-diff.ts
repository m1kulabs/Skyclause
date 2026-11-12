import {
  resolveWindowLocalSpan,
  windowLocalSpan,
  type ImportedWindowDefinition,
  type Tx,
  type WindowRow
} from '@skyclause/db'
import type { CalendarOccurrence, WindowKind } from './calendar-types'

type Fields = Pick<WindowRow, 'startsAt' | 'endsAt' | 'title' | 'kind' | 'tz'>
type Member = Fields &
  Pick<
    WindowRow,
    'id' | 'icsUid' | 'icsRecurrenceId' | 'cancelledAt' | 'cancellationOrigin' | 'localOverride' | 'seriesId'
  >
export type DesiredOccurrence = CalendarOccurrence & { kind: WindowKind }

/** Defaults act on the current source local frame exactly once; source identity never changes. */
export async function applyCalendarDefaults(
  tx: Tx,
  occurrence: CalendarOccurrence,
  kind: WindowKind,
  defaults: ImportedWindowDefinition['manualDefaults']
): Promise<DesiredOccurrence> {
  const tz = defaults.tz ?? occurrence.tz
  let startsAt = occurrence.startsAt
  let endsAt = occurrence.endsAt
  if (
    defaults.tz !== undefined ||
    defaults.dateOffsetDays !== undefined ||
    defaults.localStart !== undefined ||
    defaults.localEnd !== undefined ||
    defaults.endDayOffset !== undefined
  ) {
    const span = await windowLocalSpan(tx, occurrence)
    const date = new Date(Date.parse(`${span.date}T00:00:00Z`) + (defaults.dateOffsetDays ?? 0) * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const resolved = await resolveWindowLocalSpan(tx, {
      date,
      start: defaults.localStart ?? span.start,
      end: defaults.localEnd ?? span.end,
      endDayOffset: defaults.endDayOffset ?? span.endDayOffset,
      tz
    })
    startsAt = resolved.startsAt
    endsAt = resolved.endsAt
  }
  return { ...occurrence, startsAt, endsAt, tz, title: defaults.title ?? occurrence.title, kind: defaults.kind ?? kind }
}
export type ExistingCalendarChange =
  | { kind: 'update'; id: string; patch: Partial<Fields> }
  | { kind: 'restore-source'; id: string; patch: Partial<Fields> }
  | { kind: 'cancel'; id: string; origin: 'source' }

const key = (uid: string, recurrenceId: string) => JSON.stringify([uid, recurrenceId])
const same = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b

/** Plans only existing-row mutations; creation and the immutable batch are allocated by the caller. */
export function planCalendarDiff(input: {
  now: Date
  through: Date
  members: Member[]
  occurrences: DesiredOccurrence[]
  protectedIdentities: Array<{ uid: string; recurrenceId: string | null }>
  stoppedSeriesIds: string[]
  stoppedUids?: string[]
}): { changes: ExistingCalendarChange[]; missing: DesiredOccurrence[] } {
  const members = new Map<string, Member>()
  for (const row of input.members) {
    if (row.icsUid === null || row.icsRecurrenceId === null) throw new Error('Calendar identity is unavailable.')
    const id = key(row.icsUid, row.icsRecurrenceId)
    if (members.has(id)) throw new Error('Duplicate calendar identity.')
    members.set(id, row)
  }
  const desired = new Map<string, DesiredOccurrence>()
  for (const occurrence of input.occurrences) {
    const id = key(occurrence.uid, occurrence.recurrenceId)
    if (desired.has(id)) throw new Error('Duplicate calendar identity.')
    desired.set(id, occurrence)
  }
  const protectedUids = new Set(
    input.protectedIdentities.filter((item) => item.recurrenceId === null).map((item) => item.uid)
  )
  const protectedKeys = new Set(
    input.protectedIdentities.flatMap((item) => (item.recurrenceId === null ? [] : [key(item.uid, item.recurrenceId)]))
  )
  const protectedIdentity = (uid: string, recurrenceId: string) =>
    protectedUids.has(uid) || protectedKeys.has(key(uid, recurrenceId))
  const stopped = new Set(input.stoppedSeriesIds)
  const stoppedUids = new Set(input.stoppedUids ?? [])
  const changes: ExistingCalendarChange[] = []
  const missing: DesiredOccurrence[] = []
  for (const [id, occurrence] of desired) {
    if (stoppedUids.has(occurrence.uid) || protectedIdentity(occurrence.uid, occurrence.recurrenceId)) continue
    const row = members.get(id)
    if (!row) {
      missing.push(occurrence)
      continue
    }
    if (row.localOverride || row.startsAt < input.now || (row.seriesId && stopped.has(row.seriesId))) continue
    if (row.cancelledAt && row.cancellationOrigin !== 'source') continue
    const patch: Partial<Fields> = {}
    for (const field of ['startsAt', 'endsAt', 'title', 'kind', 'tz'] as const)
      if (!same(row[field], occurrence[field])) Object.assign(patch, { [field]: occurrence[field] })
    if (row.cancelledAt) changes.push({ kind: 'restore-source', id: row.id, patch })
    else if (Object.keys(patch).length) changes.push({ kind: 'update', id: row.id, patch })
  }
  for (const [id, row] of members) {
    if (
      desired.has(id) ||
      row.cancelledAt ||
      row.localOverride ||
      row.startsAt < input.now ||
      row.startsAt > input.through ||
      (row.seriesId && stopped.has(row.seriesId))
    )
      continue
    if (!protectedIdentity(row.icsUid!, row.icsRecurrenceId!))
      changes.push({ kind: 'cancel', id: row.id, origin: 'source' })
  }
  return { changes, missing }
}
