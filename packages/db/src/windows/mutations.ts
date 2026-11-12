import { and, eq, isNull } from 'drizzle-orm'
import type { Principal } from '@skyclause/contracts'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../ledger'
import { call, icsFeed, window, windowSeries } from '../schema'
import type { WindowRow } from './index'
import {
  lockWindowCreation,
  lockWindowParent,
  registerWindowInsert,
  startWindowMutation,
  windowTenant
} from './repository'
import type { CalendarBatch, WindowChange } from './types'

function actorOf(principal: Principal): { actor_type: string; actor_id: string } {
  switch (principal.kind) {
    case 'session':
      return { actor_type: 'account', actor_id: principal.accountId }
    case 'api_key':
      return { actor_type: 'api_key', actor_id: principal.keyId }
    case 'oauth':
      return { actor_type: 'oauth_client', actor_id: principal.clientId }
    case 'guest_token':
      return { actor_type: 'guest_token', actor_id: principal.tokenId }
    case 'share_link':
      return { actor_type: 'share_link', actor_id: principal.linkId }
    case 'device':
      return { actor_type: 'device', actor_id: principal.keyId }
    case 'system':
      return { actor_type: 'system', actor_id: principal.job }
  }
}

function calendarData(row: WindowRow, calendar?: CalendarBatch) {
  if (!calendar) return {}
  const ids = [...new Set(calendar.windowIds)].sort()
  if (row.icsFeedId !== calendar.feedId || !ids.includes(row.id))
    throw new Error('calendar batch does not contain this window and feed')
  return {
    calendar: {
      feed_id: calendar.feedId,
      revision: calendar.revision,
      ...(ids[0] === row.id ? { window_ids: ids } : {})
    }
  }
}

async function event(
  tx: Tx,
  row: WindowRow,
  type: 'window.created' | 'window.updated' | 'window.cancelled',
  timesChanged: boolean,
  calendar?: CalendarBatch
) {
  await emitEvent(tx, {
    projectId: row.projectId,
    type,
    data: {
      window_id: row.id,
      via: row.via === 'app' ? 'form' : row.via,
      times_changed: timesChanged,
      series_id: row.seriesId,
      ...calendarData(row, calendar)
    }
  })
}

async function canRestore(tx: Tx, row: WindowRow): Promise<boolean> {
  if (!row.icsFeedId || !row.cancelledAt || row.cancellationOrigin !== 'source' || row.localOverride) return false
  const [feed] = await tx
    .select({ id: icsFeed.id })
    .from(icsFeed)
    .where(and(eq(icsFeed.id, row.icsFeedId), isNull(icsFeed.deletedAt)))
  if (!feed) return false
  if (row.seriesId) {
    const [series] = await tx
      .select({ id: windowSeries.id })
      .from(windowSeries)
      .where(and(eq(windowSeries.id, row.seriesId), isNull(windowSeries.cancelledAt)))
    if (!series) return false
  }
  return true
}

/** The same actual-difference calculation is used by batch planning before representative selection. */
export function windowPatchDifference(
  row: WindowRow,
  patch: Extract<WindowChange, { kind: 'update' }>['patch'],
  sourceFieldsOnly = false
): Partial<typeof window.$inferInsert> {
  const fields = ['title', 'kind', 'startsAt', 'endsAt', 'tz', 'localOverride'] as const
  return Object.fromEntries(
    fields
      .filter((key) => !sourceFieldsOnly || key !== 'localOverride')
      .map((key) => [key, patch[key]] as const)
      .filter(([key, value]) => {
        if (value === undefined) return false
        const previous = row[key as keyof typeof patch]
        return value instanceof Date && previous instanceof Date
          ? value.getTime() !== previous.getTime()
          : value !== previous
      })
  )
}

/** Authorized, service-validated mutations; all rows, outbox events and ledger history share the caller's Tx. */
export async function writeWindowChange(tx: Tx, change: WindowChange): Promise<WindowRow> {
  const orgId = windowTenant(tx)
  if (change.kind === 'create') {
    await lockWindowCreation(tx, change.values)
    startWindowMutation(tx)
    const [row] = await tx
      .insert(window)
      .values({ ...change.values, orgId, createdAt: change.now, updatedAt: change.now })
      .returning()
    registerWindowInsert(tx, row!.id)
    await event(tx, row!, 'window.created', false, change.calendar)
    return row!
  }
  const row = await lockWindowParent(tx, change.id)
  if (!row) throw new Error('window not found')
  startWindowMutation(tx)
  let patch: Partial<typeof window.$inferInsert>
  let type: 'window.updated' | 'window.cancelled' = 'window.updated'
  let timesChanged = false
  let hasSentCall = false
  if (change.kind === 'update') {
    if (row.cancelledAt) throw new Error('cannot update a cancelled window')
    patch = windowPatchDifference(row, change.patch)
    if (!Object.keys(patch).length) return row
    timesChanged = patch.startsAt !== undefined || patch.endsAt !== undefined
  } else if (change.kind === 'cancel') {
    if (row.cancelledAt || (change.origin === 'source' && row.localOverride)) return row
    const [sent] = await tx
      .select({ id: call.id })
      .from(call)
      .where(and(eq(call.windowId, row.id), eq(call.state, 'sent')))
      .limit(1)
    hasSentCall = Boolean(sent)
    if (row.guest && hasSentCall) throw new Error('cannot cancel a guest window with a sent call')
    patch = {
      cancelledAt: change.now,
      cancellationOrigin: change.origin,
      ...(change.origin === 'manual' ? { localOverride: true } : {})
    }
    type = 'window.cancelled'
  } else {
    if (!(await canRestore(tx, row))) return row
    const finalFields = windowPatchDifference(row, change.patch ?? {}, true)
    patch = { ...finalFields, cancelledAt: null, cancellationOrigin: null }
    timesChanged = finalFields.startsAt !== undefined || finalFields.endsAt !== undefined
  }
  const [updated] = await tx
    .update(window)
    .set({ ...patch, updatedAt: change.now })
    .where(and(eq(window.orgId, orgId), eq(window.id, row.id)))
    .returning()
  await event(tx, updated!, type, timesChanged, change.calendar)
  if (change.kind === 'cancel' && hasSentCall)
    await appendLedger(tx, {
      projectId: row.projectId,
      kind: 'window_cancelled',
      refs: { window_id: row.id },
      body: { ...actorOf(tx.principal), cancelled_at: change.now.toISOString() }
    })
  return updated!
}
