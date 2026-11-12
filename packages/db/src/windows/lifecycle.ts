import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Operations } from '@skyclause/contracts'
import type { Tx } from '../client'
import { icsFeed, window, windowSeries } from '../schema'
import type { WindowRow } from './index'
import { lockWindowParents, windowTenant } from './repository'
import { writeWindowChange } from './mutations'
import type { WindowChange, WindowMutationInsert } from './types'

type Body = z.infer<Operations['createWindow']['request']['body']['content']['application/json']['schema']>
type Rule = NonNullable<Body['recurrence']>
export type WindowSeriesRow = typeof windowSeries.$inferSelect
const manualDefaults = z
  .object({
    title: z.string().min(1).max(200).optional(),
    kind: z.enum(['class', 'event', 'commute_wave']).optional(),
    tz: z.string().min(1).optional(),
    localStart: z.string().optional(),
    localEnd: z.string().optional(),
    endDayOffset: z.number().int().optional(),
    dateOffsetDays: z.number().int().optional()
  })
  .strict()
const nativeDefinition = z
  .object({
    version: z.literal(1),
    source: z.literal('native'),
    anchor: z.iso.date(),
    dateOffsetDays: z.number().int(),
    endDayOffset: z.number().int(),
    title: z.string().min(1).max(200),
    kind: z.enum(['class', 'event', 'commute_wave']),
    tz: z.string().min(1),
    provenance: z
      .object({
        declaredBy: z.string().min(1),
        via: z.enum(['app', 'api', 'cli', 'mcp']),
        shareLinkId: z.null(),
        guest: z.literal(false)
      })
      .strict()
  })
  .strict()
const importedDefinition = z.object({ version: z.literal(1), source: z.literal('ics'), manualDefaults }).strict()
export type NativeWindowDefinition = z.infer<typeof nativeDefinition>
/** Manual defaults are applied after source expansion; source identity and membership remain authoritative. */
export type ImportedWindowDefinition = z.infer<typeof importedDefinition>
export type WindowSeriesDefinition = NativeWindowDefinition | ImportedWindowDefinition

export class WindowStateConflict extends Error {}

/** Legacy definitions have no trustworthy anchor or override intent. Never infer one from a selected member. */
export function readWindowSeriesDefinition(row: WindowSeriesRow): WindowSeriesDefinition {
  const parsed = (row.icsFeedId ? importedDefinition : nativeDefinition).safeParse(row.definition)
  if (!parsed.success)
    throw new WindowStateConflict('The series definition is unavailable. Reconcile its original declaration first.')
  return parsed.data
}

export async function getWindowRecord(tx: Tx, id: string): Promise<WindowRow | null> {
  const [row] = await tx
    .select()
    .from(window)
    .where(and(eq(window.orgId, windowTenant(tx)), eq(window.id, id), eq(window.moderation, 'visible')))
  return row ?? null
}

export interface WindowSet {
  selected: WindowRow
  series: WindowSeriesRow | null
  members: WindowRow[]
}
type SeriesPatch = Partial<
  Pick<
    typeof windowSeries.$inferInsert,
    'definition' | 'rule' | 'localStart' | 'localEnd' | 'materialisedUntil' | 'checkedOn' | 'cancelledAt'
  >
>
export interface WindowSetPlan {
  changes: WindowChange[]
  seriesPatch?: SeriesPatch
}

/**
 * Parent lock precedes membership discovery, including a concurrent extension's committed rows. The planner
 * validates the complete desired set without writes. The complete child/new-parent set is then prelocked before
 * metadata, child, event or ledger mutation. Returns the selected ID, even when historical preservation leaves it.
 */
export async function mutateWindowSet(
  tx: Tx,
  input: { id: string; scope: 'occurrence' | 'series'; now: Date },
  plan: (state: WindowSet) => Promise<WindowSetPlan>,
  beforeApply?: (creates: readonly WindowMutationInsert[]) => Promise<void>
): Promise<WindowRow | null> {
  const orgId = windowTenant(tx)
  const found = await getWindowRecord(tx, input.id)
  if (!found) return null
  await lockWindowParents(tx, [], [found])
  const selected = await getWindowRecord(tx, input.id)
  if (!selected) return null
  const [series] = selected.seriesId
    ? await tx
        .select()
        .from(windowSeries)
        .where(and(eq(windowSeries.orgId, orgId), eq(windowSeries.id, selected.seriesId)))
    : []
  const [feed] = selected.icsFeedId
    ? await tx
        .select()
        .from(icsFeed)
        .where(and(eq(icsFeed.orgId, orgId), eq(icsFeed.id, selected.icsFeedId)))
    : []
  if (
    (selected.seriesId && (!series || series.projectId !== selected.projectId)) ||
    (selected.icsFeedId && (!feed || feed.projectId !== selected.projectId || feed.deletedAt))
  )
    throw new WindowStateConflict('The window parent is unavailable or inactive.')
  const members =
    input.scope === 'series' && series
      ? await tx
          .select()
          .from(window)
          .where(and(eq(window.orgId, orgId), eq(window.seriesId, series.id)))
          .orderBy(window.id)
      : [selected]
  // Stabilize all existing children before planning, as occurrence edits take the same parents before child locks.
  const locked = await lockWindowParents(
    tx,
    members.map((row) => row.id)
  )
  const current = locked.find((row) => row.id === selected.id)
  if (!current || current.moderation !== 'visible') return null
  const proposed = await plan({ selected: current, series: series ?? null, members: locked })
  const allowed = new Set(locked.map((row) => row.id))
  for (const change of proposed.changes) {
    if (change.kind !== 'create') {
      if (!allowed.has(change.id)) throw new Error('window plan escaped the locked scope')
    } else if (
      !series ||
      input.scope !== 'series' ||
      change.values.projectId !== selected.projectId ||
      change.values.seriesId !== series.id ||
      (change.values.icsFeedId ?? null) !== series.icsFeedId ||
      (change.values.icsUid ?? null) !== series.icsUid
    )
      throw new Error('window plan escaped the authorized parents')
  }
  if (proposed.seriesPatch && (!series || input.scope !== 'series'))
    throw new Error('window plan escaped the series scope')
  const creates = proposed.changes.flatMap((change) => (change.kind === 'create' ? [change.values] : []))
  await lockWindowParents(
    tx,
    locked.map((row) => row.id),
    creates
  )
  await beforeApply?.(creates)
  if (proposed.seriesPatch && series) {
    await tx
      .update(windowSeries)
      .set({ ...proposed.seriesPatch, updatedAt: input.now })
      .where(and(eq(windowSeries.orgId, orgId), eq(windowSeries.id, series.id)))
    if (series.icsFeedId)
      await tx
        .update(icsFeed)
        .set({ refreshClaim: null, updatedAt: input.now })
        .where(and(eq(icsFeed.orgId, orgId), eq(icsFeed.id, series.icsFeedId)))
  }
  for (const change of proposed.changes) await writeWindowChange(tx, change)
  return getWindowRecord(tx, input.id)
}

/** All occurrence plans are validated by the service before inserting this exclusively owned new parent. */
export async function createNativeWindowSeries(
  tx: Tx,
  input: {
    projectId: string
    rule: Rule
    definition: NativeWindowDefinition
    localStart: string
    localEnd: string
    materialisedUntil: string
    checkedOn: string
    now: Date
    occurrences: WindowMutationInsert[]
  },
  beforeApply?: () => Promise<void>
): Promise<WindowRow[]> {
  const definition = nativeDefinition.parse(input.definition)
  if (!input.occurrences.length) throw new WindowStateConflict('A series needs at least one materialized occurrence.')
  const dates = new Set<string>()
  for (const row of input.occurrences) {
    if (
      row.projectId !== input.projectId ||
      row.seriesId ||
      row.icsFeedId ||
      row.icsUid ||
      row.icsRecurrenceId ||
      row.title !== definition.title ||
      row.kind !== definition.kind ||
      row.tz !== definition.tz ||
      row.declaredBy !== definition.provenance.declaredBy ||
      row.via !== definition.provenance.via ||
      row.guest ||
      row.shareLinkId ||
      !row.seriesOccurrenceDate ||
      !z.iso.date().safeParse(row.seriesOccurrenceDate).success ||
      dates.has(row.seriesOccurrenceDate)
    )
      throw new Error('occurrence does not match the native declaration')
    dates.add(row.seriesOccurrenceDate)
  }
  const [series] = await tx
    .insert(windowSeries)
    .values({
      orgId: windowTenant(tx),
      projectId: input.projectId,
      rule: input.rule,
      definition,
      localStart: input.localStart,
      localEnd: input.localEnd,
      materialisedUntil: input.materialisedUntil,
      checkedOn: input.checkedOn,
      createdAt: input.now,
      updatedAt: input.now
    })
    .returning()
  const creates = input.occurrences.map((row) => ({ ...row, seriesId: series!.id }))
  await lockWindowParents(tx, [], creates)
  await beforeApply?.()
  const rows: WindowRow[] = []
  for (const values of creates) rows.push(await writeWindowChange(tx, { kind: 'create', values, now: input.now }))
  return rows
}
