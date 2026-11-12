import type { Mode } from '@skyclause/contracts'
import { and, asc, eq, gt, inArray, or, sql } from 'drizzle-orm'
import type { Tx } from '../client'
import { bundle, call, project, window } from '../schema'

// #139 b-windows-api: the `window` reads and the single-window insert. Authorize the project before calling.

export type WindowRow = typeof window.$inferSelect
export type WindowInsert = Pick<
  typeof window.$inferInsert,
  'projectId' | 'title' | 'kind' | 'startsAt' | 'endsAt' | 'tz' | 'via' | 'declaredBy' | 'shareLinkId'
>

/** A call that is not Normal (Watch is `watch` on a Normal call; a null mode is No call). */
const aboveNormal = (alias: string) => sql.raw(`${alias}.mode IS NOT NULL AND ${alias}.mode <> 'normal'`)

/** The latest call per pack for a window: newest drafted first, then newest ID (UUIDv7). */
const latestPerPack = (windowId: ReturnType<typeof sql>) => sql`(
  SELECT DISTINCT ON (b.pack) c.mode
  FROM ${call} c JOIN ${bundle} b ON b.id = c.bundle_id
  WHERE c.window_id = ${windowId}
  ORDER BY b.pack, c.drafted_at DESC, c.id DESC
)`

export async function insertWindow(tx: Tx, values: WindowInsert): Promise<WindowRow> {
  const [row] = await tx
    .insert(window)
    .values({ ...values, orgId: tx.orgId! })
    .returning()
  return row!
}

export interface WindowListQuery {
  projectId: string
  limit: number
  after?: { startsAt: Date; id: string }
  /** Inclusive local dates, read in the project's time zone. */
  from?: string
  to?: string
  kind?: WindowRow['kind']
  atRisk?: boolean
}

/** `limit + 1` windows of the project by `starts_at` then `id`; at-risk windows are ones whose latest call is above Normal. */
export async function listWindowRecords(tx: Tx, query: WindowListQuery): Promise<WindowRow[]> {
  const zone = sql`(SELECT ${project.timeZone} FROM ${project} WHERE ${project.id} = ${window.projectId})`
  const risky = sql`EXISTS (SELECT 1 FROM ${latestPerPack(sql`${window.id}`)} l WHERE ${aboveNormal('l')})`
  return tx
    .select()
    .from(window)
    .where(
      and(
        eq(window.projectId, query.projectId),
        query.kind ? eq(window.kind, query.kind) : undefined,
        query.from ? sql`${window.startsAt} >= (${query.from}::date::timestamp AT TIME ZONE ${zone})` : undefined,
        query.to ? sql`${window.startsAt} < ((${query.to}::date + 1)::timestamp AT TIME ZONE ${zone})` : undefined,
        query.atRisk === undefined ? undefined : query.atRisk ? risky : sql`NOT ${risky}`,
        query.after
          ? or(
              gt(window.startsAt, query.after.startsAt),
              and(eq(window.startsAt, query.after.startsAt), gt(window.id, query.after.id))
            )
          : undefined
      )
    )
    .orderBy(asc(window.startsAt), asc(window.id))
    .limit(query.limit + 1)
}

export interface WindowCallRecord {
  windowId: string
  id: string
  bundleId: string
  pack: 'sky' | 'crowd'
  state: typeof call.$inferSelect.state
  mode: Mode | null
}

/** The latest call of each pack for each window in `windowIds`. */
export async function latestWindowCalls(tx: Tx, windowIds: string[]): Promise<WindowCallRecord[]> {
  if (!windowIds.length) return []
  return tx
    .selectDistinctOn([call.windowId, bundle.pack], {
      windowId: sql<string>`${call.windowId}`,
      id: call.id,
      bundleId: call.bundleId,
      pack: bundle.pack,
      state: call.state,
      mode: call.mode
    })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .where(inArray(call.windowId, windowIds))
    .orderBy(call.windowId, bundle.pack, sql`${call.draftedAt} DESC`, sql`${call.id} DESC`) as Promise<
    WindowCallRecord[]
  >
}

export { resolveWindowLocalSpan, windowLocalSpan, windowZoneExists, WindowLocalTimeError } from './calendar-time'
export { writeWindowChange } from './mutations'
export { lockWindowParent, lockWindowParents } from './repository'
export type { CalendarBatch, LocalSpan, WindowChange, WindowMutationInsert } from './types'
export {
  createNativeWindowSeries,
  getWindowRecord,
  mutateWindowSet,
  readWindowSeriesDefinition,
  WindowStateConflict
} from './lifecycle'
export type {
  WindowSet,
  WindowSetPlan,
  WindowSeriesRow,
  NativeWindowDefinition,
  ImportedWindowDefinition,
  WindowSeriesDefinition
} from './lifecycle'
