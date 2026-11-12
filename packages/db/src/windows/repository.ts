import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '../client'
import { icsFeed, window, windowSeries } from '../schema'
import type { WindowRow } from './index'
import type { WindowMutationInsert } from './types'

export function windowTenant(tx: Tx): string {
  if (!tx.orgId) throw new Error('window mutations need a withTenant transaction')
  return tx.orgId
}

// Repeated mutation calls reuse the batch's locks rather than acquiring parents after windows.
const locked = new WeakMap<Tx, Set<string>>()
const mutationStarted = new WeakSet<Tx>()

/** Freeze the complete planned parent and existing-window set before the first write or event. */
export function startWindowMutation(tx: Tx) {
  mutationStarted.add(tx)
}
/** A row inserted by this transaction is already exclusively owned; later edits need no new row lock. */
export function registerWindowInsert(tx: Tx, id: string) {
  const held = locked.get(tx) ?? new Set<string>()
  held.add(`window:${id}`)
  locked.set(tx, held)
}

const keys = (kind: string, ids: readonly string[]) => ids.map((id) => `${kind}:${id}`)

/**
 * Lock the complete planned batch before mutation: all feeds, then series, then windows in UUID order.
 * `creates` includes parents of new rows, whose window IDs need no row lock yet. Returns existing tenant rows.
 */
export async function lockWindowParents(
  tx: Tx,
  ids: readonly string[],
  creates: readonly WindowMutationInsert[] = []
): Promise<WindowRow[]> {
  const orgId = windowTenant(tx)
  const held = locked.get(tx) ?? new Set<string>()
  const rows = ids.length
    ? await tx
        .select()
        .from(window)
        .where(and(eq(window.orgId, orgId), inArray(window.id, [...ids])))
    : []
  const parents = [...rows, ...creates]
  const seriesIds = [...new Set(parents.flatMap((row) => (row.seriesId ? [row.seriesId] : [])))].sort()
  const series = seriesIds.length
    ? await tx
        .select()
        .from(windowSeries)
        .where(and(eq(windowSeries.orgId, orgId), inArray(windowSeries.id, seriesIds)))
    : []
  const feedIds = [
    ...new Set([
      ...parents.flatMap((row) => (row.icsFeedId ? [row.icsFeedId] : [])),
      ...series.flatMap((row) => (row.icsFeedId ? [row.icsFeedId] : []))
    ])
  ].sort()
  const parentKeys = [...keys('feed', feedIds), ...keys('series', seriesIds)]
  if (
    (mutationStarted.has(tx) || [...held].some((key) => key.startsWith('window:'))) &&
    parentKeys.some((key) => !held.has(key))
  )
    throw new Error('lock the complete window batch before mutation')
  const newFeeds = feedIds.filter((id) => !held.has(`feed:${id}`))
  const newSeries = seriesIds.filter((id) => !held.has(`series:${id}`))
  if (newFeeds.length && [...held].some((key) => key.startsWith('series:')))
    throw new Error('lock the complete window batch before mutation')
  const newIds = [...new Set(ids)].filter((id) => !held.has(`window:${id}`)).sort()
  if (mutationStarted.has(tx) && newIds.length) throw new Error('lock the complete window batch before mutation')
  for (const [kind, additions] of [
    ['feed', newFeeds],
    ['series', newSeries],
    ['window', newIds]
  ] as const) {
    const last = [...held]
      .filter((key) => key.startsWith(`${kind}:`))
      .sort()
      .at(-1)
    if (last && additions.some((id) => `${kind}:${id}` < last))
      throw new Error('lock the complete window batch before mutation')
  }
  if (newFeeds.length)
    await tx
      .select({ id: icsFeed.id })
      .from(icsFeed)
      .where(and(eq(icsFeed.orgId, orgId), inArray(icsFeed.id, newFeeds)))
      .orderBy(asc(icsFeed.id))
      .for('update')
  if (newSeries.length)
    await tx
      .select({ id: windowSeries.id })
      .from(windowSeries)
      .where(and(eq(windowSeries.orgId, orgId), inArray(windowSeries.id, newSeries)))
      .orderBy(asc(windowSeries.id))
      .for('update')
  if (newIds.length)
    await tx
      .select({ id: window.id })
      .from(window)
      .where(and(eq(window.orgId, orgId), inArray(window.id, newIds)))
      .orderBy(asc(window.id))
      .for('update')
  for (const key of [...parentKeys, ...keys('window', newIds)]) held.add(key)
  locked.set(tx, held)
  return ids.length
    ? tx
        .select()
        .from(window)
        .where(and(eq(window.orgId, orgId), inArray(window.id, [...ids])))
        .orderBy(asc(window.id))
    : []
}

export async function lockWindowParent(tx: Tx, id: string): Promise<WindowRow | null> {
  const orgId = windowTenant(tx)
  if (locked.get(tx)?.has(`window:${id}`)) {
    const [row] = await tx
      .select()
      .from(window)
      .where(and(eq(window.orgId, orgId), eq(window.id, id)))
    return row ?? null
  }
  return (await lockWindowParents(tx, [id]))[0] ?? null
}

/** New rows take the same parent locks as edits, then validate those locked parents. */
export async function lockWindowCreation(tx: Tx, values: WindowMutationInsert) {
  const orgId = windowTenant(tx)
  await lockWindowParents(tx, [], [values])
  const [series] = values.seriesId
    ? await tx
        .select()
        .from(windowSeries)
        .where(and(eq(windowSeries.orgId, orgId), eq(windowSeries.id, values.seriesId)))
    : []
  const [feed] = values.icsFeedId
    ? await tx
        .select()
        .from(icsFeed)
        .where(and(eq(icsFeed.orgId, orgId), eq(icsFeed.id, values.icsFeedId)))
    : []
  if (
    (values.seriesId && (!series || series.projectId !== values.projectId)) ||
    (values.icsFeedId && (!feed || feed.projectId !== values.projectId))
  )
    throw new Error('window parent project is unavailable')
  if (series?.cancelledAt || feed?.deletedAt) throw new Error('inactive window parent')
  if (series && (series.icsFeedId !== (values.icsFeedId ?? null) || series.icsUid !== (values.icsUid ?? null)))
    throw new Error('window series identity does not match')
}
