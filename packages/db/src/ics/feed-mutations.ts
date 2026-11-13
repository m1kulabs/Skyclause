import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Tx } from '../client'
import { projectGate } from '../gate'
import { icsFeed, window, windowSeries } from '../schema'
import { importedWindowDefinitionSchema } from '../windows/lifecycle'
import { windowPatchDifference, writeWindowChange } from '../windows/mutations'
import {
  lockWindowParentSet,
  registerWindowSeriesInsert,
  windowTenant,
  withWindowLockSavepoint
} from '../windows/repository'
import type { WindowChange, WindowRow, WindowSeriesRow } from '../windows'
import { getIcsFeedRecord, type IcsFeedRow } from './feeds'
import {
  ICS_FEED_ERRORS,
  type IcsFeedApplyResult,
  type IcsFeedClaim,
  type IcsFeedClaimOptions,
  type IcsFeedErrorCode,
  type IcsFeedMutation,
  type IcsFeedPlan,
  type IcsFeedState,
  type IcsFeedWindowChange
} from './feed-types'

const MAX_CHANGED = 20_000
const MAX_CREATED = 10_000
const allocated = new WeakMap<Tx, number>()
const importedRule = z.object({ version: z.literal(1), source: z.literal('ics'), uid: z.string().min(1) }).strict()
const documentSchema = z.object({ version: z.literal(1), jcal: z.array(z.unknown()) }).strict()
const sourceFields = ['title', 'kind', 'startsAt', 'endsAt', 'tz']
const feedFields = [
  'document',
  'etag',
  'lastModified',
  'refreshedAt',
  'lastError',
  'skipped',
  'materialisedUntil',
  'deletedAt',
  'refreshClaim',
  'nextRefreshAt'
]
const seriesFields = ['rule', 'definition', 'localStart', 'localEnd', 'materialisedUntil', 'checkedOn', 'lastError']
function keysOnly(value: object, keys: readonly string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key)))
    throw new Error('calendar plan contains unsupported fields')
}
function errorText(code: IcsFeedErrorCode): string {
  if (!Object.hasOwn(ICS_FEED_ERRORS, code)) throw new Error('unknown calendar error code')
  return JSON.stringify({ version: 1, code })
}
function validFence(feed: IcsFeedRow | null, input: Pick<IcsFeedMutation, 'claimId' | 'now'>): feed is IcsFeedRow {
  return Boolean(
    feed &&
    !feed.deletedAt &&
    (!input.claimId || (feed.refreshClaim === input.claimId && feed.nextRefreshAt && feed.nextRefreshAt > input.now))
  )
}

/** Bounded allocation before planning writes; one extra UUID is available for an immutable revision. */
export async function allocateCalendarIds(tx: Tx, count: number): Promise<{ revision: string; ids: string[] }> {
  windowTenant(tx)
  const total = (allocated.get(tx) ?? 0) + count
  if (!Number.isInteger(count) || count < 0 || total > MAX_CHANGED)
    throw new Error('calendar allocation exceeds 20000 IDs')
  allocated.set(tx, total)
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT uuidv7() AS id FROM generate_series(0, ${count}::integer)`
  )
  return { revision: rows[0]!.id, ids: rows.slice(1).map((row) => row.id) }
}

/** Default one immediately attemptable lease; SKIP LOCKED keeps concurrent claimers disjoint. */
export async function claimDueIcsFeeds(tx: Tx, input: IcsFeedClaimOptions): Promise<IcsFeedClaim[]> {
  const orgId = windowTenant(tx)
  if ((await projectGate(tx, input.projectId)) !== 'open') return []
  const limit = input.limit ?? 1
  if (!Number.isInteger(limit) || limit < 1 || limit > 10)
    throw new Error('calendar claim limit must be between 1 and 10')
  const due = await tx
    .select()
    .from(icsFeed)
    .where(
      and(
        eq(icsFeed.orgId, orgId),
        eq(icsFeed.projectId, input.projectId),
        isNull(icsFeed.deletedAt),
        lte(icsFeed.nextRefreshAt, input.now),
        input.includeFiles ? undefined : isNotNull(icsFeed.url)
      )
    )
    .orderBy(asc(icsFeed.nextRefreshAt), asc(icsFeed.id))
    .limit(limit)
    .for('update', { skipLocked: true })
  const claims: IcsFeedClaim[] = []
  for (const feed of due) {
    const { revision: claimId } = await allocateCalendarIds(tx, 0)
    await tx
      .update(icsFeed)
      .set({
        refreshClaim: claimId,
        lastAttemptAt: input.now,
        nextRefreshAt: new Date(input.now.getTime() + 3_600_000),
        updatedAt: input.now
      })
      .where(eq(icsFeed.id, feed.id))
    claims.push({
      orgId,
      projectId: feed.projectId,
      feedId: feed.id,
      claimId,
      url: feed.url,
      etag: feed.etag,
      lastModified: feed.lastModified
    })
  }
  return claims
}

/** A fenced, fixed diagnostic never overwrites confirmed source validators or source contents. */
export async function recordIcsFeedError(
  tx: Tx,
  input: { feedId: string; claimId: string; now: Date; code: IcsFeedErrorCode }
): Promise<IcsFeedApplyResult> {
  const lastError = errorText(input.code)
  return withWindowLockSavepoint(tx, async (child) => {
    await lockWindowParentSet(child, { feedIds: [input.feedId] })
    const feed = await getIcsFeedRecord(child, input.feedId)
    if (!validFence(feed, input)) return { status: 'stale' }
    const [updated] = await child
      .update(icsFeed)
      .set({ lastError, refreshClaim: null, updatedAt: input.now })
      .where(eq(icsFeed.id, feed.id))
      .returning()
    return { status: 'applied', feed: updated!, changedIds: [] }
  })
}

function validatePlan(
  feed: IcsFeedRow,
  series: WindowSeriesRow[],
  members: WindowRow[],
  plan: IcsFeedPlan
): IcsFeedWindowChange[] {
  keysOnly(plan, ['seriesCreates', 'seriesUpdates', 'changes', 'feedPatch'])
  const creates = plan.seriesCreates ?? []
  if (creates.length > MAX_CREATED || plan.changes.filter((change) => change.kind === 'create').length > MAX_CREATED)
    throw new Error('calendar creates exceed 10000 per kind')
  const seriesById = new Map(series.map((row) => [row.id, row]))
  const knownSeries = new Map(
    series.map((row) => [
      row.id,
      { projectId: row.projectId, icsFeedId: row.icsFeedId, icsUid: row.icsUid, cancelledAt: row.cancelledAt }
    ])
  )
  const ids = new Set<string>()
  const uids = new Set(series.flatMap((row) => (row.icsUid === null ? [] : [row.icsUid])))
  for (const values of creates) {
    z.uuidv7().parse(values.id)
    if (
      ids.has(values.id) ||
      seriesById.has(values.id) ||
      values.projectId !== feed.projectId ||
      values.icsFeedId !== feed.id ||
      !values.icsUid ||
      uids.has(values.icsUid)
    )
      throw new Error('calendar series escapes feed scope or duplicates identity')
    const rule = importedRule.parse(values.rule)
    if (rule.uid !== values.icsUid || Buffer.byteLength(rule.uid, 'utf8') > 1024)
      throw new Error('calendar series identity is invalid')
    importedWindowDefinitionSchema.parse(values.definition)
    if (values.cancelledAt) throw new Error('source plan cannot manually stop a series')
    ids.add(values.id)
    uids.add(values.icsUid)
    knownSeries.set(values.id, {
      projectId: feed.projectId,
      icsFeedId: feed.id,
      icsUid: values.icsUid,
      cancelledAt: null
    })
  }
  const updatedSeries = new Set<string>()
  for (const update of plan.seriesUpdates ?? []) {
    const row = seriesById.get(update.id)
    if (!row || row.projectId !== feed.projectId || row.cancelledAt || updatedSeries.has(update.id))
      throw new Error('calendar series update escapes active scope')
    keysOnly(update.patch, seriesFields)
    if (update.patch.definition !== undefined) importedWindowDefinitionSchema.parse(update.patch.definition)
    if (update.patch.rule !== undefined && importedRule.parse(update.patch.rule).uid !== row.icsUid)
      throw new Error('calendar series identity is immutable')
    updatedSeries.add(update.id)
  }
  const patch = plan.feedPatch ?? {}
  keysOnly(patch, feedFields)
  if (patch.document !== undefined && patch.document !== null) documentSchema.parse(patch.document)
  if (patch.skipped !== undefined && !Array.isArray(patch.skipped)) throw new Error('calendar skipped must be an array')
  if (patch.lastError !== undefined && patch.lastError !== null) {
    const error: unknown = JSON.parse(patch.lastError)
    const parsed = z
      .object({
        version: z.literal(1),
        code: z.enum(Object.keys(ICS_FEED_ERRORS) as [IcsFeedErrorCode, ...IcsFeedErrorCode[]])
      })
      .strict()
      .parse(error)
    if (errorText(parsed.code) !== patch.lastError) throw new Error('calendar error is not canonical')
  }
  const memberById = new Map(members.map((row) => [row.id, row]))
  const actions = new Set<string>()
  const identities = new Set(
    members
      .filter((row) => row.icsUid !== null && row.icsRecurrenceId !== null)
      .map((row) => JSON.stringify([row.icsUid, row.icsRecurrenceId]))
  )
  for (const change of plan.changes) {
    if (patch.deletedAt && change.kind !== 'cancel') throw new Error('feed removal only cancels source rows')
    const id = change.kind === 'create' ? change.values.id : change.id
    if (!id || actions.has(id)) throw new Error('calendar requires one action per window')
    actions.add(id)
    if (change.kind === 'create') {
      const values = change.values
      z.uuidv7().parse(id)
      if (
        memberById.has(id) ||
        values.projectId !== feed.projectId ||
        values.icsFeedId !== feed.id ||
        !values.icsUid ||
        values.icsRecurrenceId === undefined ||
        values.icsRecurrenceId === null ||
        values.localOverride
      )
        throw new Error('calendar window escapes feed scope')
      const identity = JSON.stringify([values.icsUid, values.icsRecurrenceId])
      if (
        identities.has(identity) ||
        Buffer.byteLength(values.icsUid, 'utf8') > 1024 ||
        Buffer.byteLength(values.icsRecurrenceId, 'utf8') > 1024
      )
        throw new Error('calendar window identity is duplicated or invalid')
      identities.add(identity)
      if (values.seriesId) {
        const parent = knownSeries.get(values.seriesId)
        if (!parent || parent.cancelledAt || parent.icsUid !== values.icsUid || parent.icsFeedId !== feed.id)
          throw new Error('calendar window series escapes active scope')
      }
    } else {
      const row = memberById.get(id)
      if (!row || row.projectId !== feed.projectId) throw new Error('calendar window update escapes feed scope')
      if (row.seriesId) {
        const parent = seriesById.get(row.seriesId)
        const legacyDeletion = Boolean(patch.deletedAt && row.icsUid === null && row.icsRecurrenceId === null)
        if (
          !parent ||
          parent.orgId !== feed.orgId ||
          parent.projectId !== feed.projectId ||
          parent.icsFeedId !== feed.id ||
          (!legacyDeletion && parent.icsUid !== row.icsUid)
        )
          throw new Error('calendar window parent escapes locked scope')
      }
      if (!patch.deletedAt && (row.icsUid === null || row.icsRecurrenceId === null))
        throw new Error('calendar source identity is unavailable')
      if (change.kind === 'cancel' && change.origin !== 'source')
        throw new Error('calendar cancellation must preserve source origin')
      if (change.kind === 'update' || change.kind === 'restore-source') keysOnly(change.patch ?? {}, sourceFields)
    }
  }
  return plan.changes
}

function hasEffect(
  change: IcsFeedWindowChange,
  members: Map<string, WindowRow>,
  series: Map<string, WindowSeriesRow>,
  now: Date
): boolean {
  if (change.kind === 'create') return true
  const row = members.get(change.id)!
  if (row.seriesId) {
    const parent = series.get(row.seriesId)
    if (!parent) throw new Error('calendar window parent escapes locked scope')
    if (parent.cancelledAt) return false
  }
  if (row.localOverride || row.startsAt < now) return false
  if (change.kind === 'cancel') return row.cancelledAt === null
  if (change.kind === 'restore-source') return row.cancelledAt !== null && row.cancellationOrigin === 'source'
  return row.cancelledAt === null && Object.keys(windowPatchDifference(row, change.patch, true)).length > 0
}

/** Complete feed-locked plan/validate/apply; callbacks plan/read only, with an explicit real budget hook after validation. */
export async function mutateIcsFeed(
  tx: Tx,
  input: IcsFeedMutation,
  plan: (state: IcsFeedState, tx: Tx) => Promise<IcsFeedPlan>
): Promise<IcsFeedApplyResult> {
  return withWindowLockSavepoint(tx, async (child) => {
    const orgId = windowTenant(child)
    await lockWindowParentSet(child, { feedIds: [input.feedId] })
    const feed = await getIcsFeedRecord(child, input.feedId)
    if (!validFence(feed, input)) return { status: 'stale' }
    if (input.claimId && (await projectGate(child, feed.projectId)) !== 'open') return { status: 'stale' }
    const series = await child
      .select()
      .from(windowSeries)
      .where(
        and(
          eq(windowSeries.orgId, orgId),
          eq(windowSeries.icsFeedId, feed.id),
          eq(windowSeries.projectId, feed.projectId)
        )
      )
      .orderBy(asc(windowSeries.id))
    await lockWindowParentSet(child, { seriesIds: series.map((row) => row.id) })
    const members = await child
      .select()
      .from(window)
      .where(and(eq(window.orgId, orgId), eq(window.icsFeedId, feed.id), eq(window.projectId, feed.projectId)))
      .orderBy(asc(window.id))
    await lockWindowParentSet(child, { windowIds: members.map((row) => row.id) })
    const planned = await plan(structuredClone({ feed, series, members }), child)
    const memberById = new Map(members.map((row) => [row.id, row]))
    const seriesById = new Map(series.map((row) => [row.id, row]))
    const changes = validatePlan(feed, series, members, planned).filter((change) =>
      hasEffect(change, memberById, seriesById, input.now)
    )
    const changedIds = changes.map((change) => (change.kind === 'create' ? change.values.id! : change.id)).sort()
    if (changedIds.length > MAX_CHANGED) throw new Error('calendar change set exceeds 20000 IDs')
    const { revision } = await allocateCalendarIds(child, 0)
    if (input.claimId && (await projectGate(child, feed.projectId)) !== 'open') return { status: 'stale' }
    await input.beforeApply?.(
      changes.flatMap((change) => (change.kind === 'create' ? [change.values] : [])),
      child
    )
    for (const values of planned.seriesCreates ?? []) {
      const [row] = await child
        .insert(windowSeries)
        .values({ ...values, orgId, createdAt: input.now, updatedAt: input.now })
        .returning()
      registerWindowSeriesInsert(child, row!.id)
    }
    for (const update of planned.seriesUpdates ?? [])
      await child
        .update(windowSeries)
        .set({ ...update.patch, updatedAt: input.now })
        .where(and(eq(windowSeries.orgId, orgId), eq(windowSeries.id, update.id)))
    const calendar = { feedId: feed.id, revision, windowIds: changedIds }
    for (const change of changes)
      await writeWindowChange(child, { ...change, now: input.now, calendar } as WindowChange)
    const [updated] = await child
      .update(icsFeed)
      .set({ ...planned.feedPatch, refreshClaim: null, updatedAt: input.now })
      .where(and(eq(icsFeed.orgId, orgId), eq(icsFeed.id, feed.id)))
      .returning()
    return { status: 'applied', feed: updated!, changedIds }
  })
}
