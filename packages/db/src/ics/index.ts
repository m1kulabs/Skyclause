import { log } from '@skyclause/config'
import { and, asc, eq, inArray, isNotNull, or, type SQL } from 'drizzle-orm'
import type { Tx } from '../client'
import { bundle, call, listing, night, publicProject, window } from '../schema'

// #154 c-ics-feed: the conditions calendar's reads and its `ics` consumer's writes of `call.ics_uid` and
// `call.ics_sequence` (#79 §3, §5). An entry is one window and pack, or one night: its calls share a UID (D20), and
// it renders its latest sent call, the head.

const UID_DOMAIN = 'skyclause.m1ku.tech'

type CallRow = typeof call.$inferSelect
type Mode = CallRow['mode']

/** What makes an entry: any mode but Normal, so a No call (null mode) makes one too (TRD "Channels and sends"). */
const hasConditions = (mode: Mode) => mode !== 'normal'

/** An entry's calls: a window's calls of one pack, or a night's. */
type Group = { windowId: string; pack: 'sky' | 'crowd' } | { nightId: string }

/**
 * Calls the feed may show (CAL-14, GST-5): sent, outside a `draft_only` bundle and a guest window. Every call is a
 * window's or a night's here, which the joins require.
 */
const eligible = and(
  eq(call.state, 'sent'),
  eq(bundle.draftOnly, false),
  or(isNotNull(call.nightId), eq(window.guest, false))
)

type Identity = { icsUid: string; icsSequence: number }

/**
 * The ticket's identity rule over a group's sent calls in order: a call keeps a stored identity; otherwise it takes
 * the previous call's UID at `sequence + 1`, or starts at 0 as `call-{id}` or, for a night, `night-{night_id}` (D20).
 */
function identities(calls: CallRow[]): Identity[] {
  let previous: Identity | null = null
  return calls.map((sent) => {
    if (sent.icsUid) previous = { icsUid: sent.icsUid, icsSequence: sent.icsSequence }
    else if (previous) previous = { icsUid: previous.icsUid, icsSequence: previous.icsSequence + 1 }
    else
      previous = {
        icsUid: sent.nightId ? `night-${sent.nightId}@${UID_DOMAIN}` : `call-${sent.id}@${UID_DOMAIN}`,
        icsSequence: 0
      }
    return previous
  })
}

/** A group's eligible calls, oldest sent first, locked so two consumers can't both raise the same sequence. */
async function groupCalls(tx: Tx, group: Group): Promise<CallRow[]> {
  const where: SQL | undefined =
    'nightId' in group
      ? eq(call.nightId, group.nightId)
      : and(eq(call.windowId, group.windowId), eq(bundle.pack, group.pack))
  const rows = await tx
    .select({ call })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .leftJoin(window, eq(window.id, call.windowId))
    .where(and(where, eligible))
    .orderBy(asc(call.sentAt), asc(call.id))
    .for('update', { of: call })
  return rows.map((row) => row.call)
}

/** `call.sent` (ticket decision): a sent call takes its identity once; an ineligible or unsent call takes none. */
export async function assignIcsIdentity(tx: Tx, callId: string, now: Date): Promise<void> {
  const [target] = await tx
    .select({ windowId: call.windowId, nightId: call.nightId, pack: bundle.pack, icsUid: call.icsUid })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .where(eq(call.id, callId))
  if (!target || target.icsUid) return
  const group: Group | null = target.nightId
    ? { nightId: target.nightId }
    : target.windowId
      ? { windowId: target.windowId, pack: target.pack }
      : null
  if (!group) return
  const calls = await groupCalls(tx, group)
  const index = calls.findIndex((c) => c.id === callId)
  if (index === -1) return
  const identity = identities(calls.slice(0, index + 1))[index]!
  await tx
    .update(call)
    .set({ ...identity, updatedAt: now })
    .where(eq(call.id, callId))
}

/** Raises the entry's sequence on its head, the latest sent call; a group with no entry is left alone. */
async function bumpEntry(tx: Tx, group: Group, now: Date) {
  const calls = await groupCalls(tx, group)
  if (!calls.some((c) => hasConditions(c.mode))) return
  const head = identities(calls).at(-1)!
  await tx
    .update(call)
    .set({ icsUid: head.icsUid, icsSequence: head.icsSequence + 1, updatedAt: now })
    .where(eq(call.id, calls.at(-1)!.id))
}

/** `window.cancelled`, or `window.updated` with new times: each pack's entry on the window changes. */
export async function bumpWindowEntries(tx: Tx, windowId: string, now: Date): Promise<void> {
  const packs = await tx
    .selectDistinct({ pack: bundle.pack })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .where(and(eq(call.windowId, windowId), eq(call.state, 'sent')))
  for (const { pack } of packs) await bumpEntry(tx, { windowId, pack }, now)
}

/** `listing.changed`: the night's entry changes (its times, or a cancellation the feed renders). */
export async function bumpNightEntry(tx: Tx, nightId: string, now: Date): Promise<void> {
  await bumpEntry(tx, { nightId }, now)
}

/** A public project by its organisation and project slugs, through `public_project`; null when private or unknown. */
export async function findPublicFeedProject(
  tx: Tx<null>,
  org: string,
  project: string
): Promise<{ id: string; orgId: string; name: string } | null> {
  const [row] = await tx
    .select({ id: publicProject.id, orgId: publicProject.orgId, name: publicProject.name })
    .from(publicProject)
    .where(and(eq(publicProject.orgSlug, org), eq(publicProject.slug, project)))
  return row ?? null
}

/** One conditions calendar entry and the call it renders. */
export interface IcsEntry {
  uid: string
  sequence: number
  status: 'CONFIRMED' | 'CANCELLED'
  start: Date
  /** Equal to `start` for a zero-length commute wave (D13). */
  end: Date
  /** The entry's last change: its head's send or identity write, or its window's or night's update. */
  changedAt: Date
  call: CallRow
}

const latestOf = (...dates: Array<Date | null>) => new Date(Math.max(...dates.map((date) => date?.getTime() ?? 0)))

/**
 * The project's entries (ticket decision): one per window and pack, and per night, among calls with an identity.
 * Windows span `starts_at` to `ends_at`; nights the arrival period's start to the exit period's end, or to the
 * arrival period's end while exit times are unknown (D19). A night shows only once a listing of it was listed
 * (CAL-14), and never without an arrival period. Cancelled: a Normal head, a cancelled window, an unlisted night, or a
 * night with no listing still listed.
 */
export async function loadIcsEntries(tx: Tx, projectId: string): Promise<IcsEntry[]> {
  const rows = await tx
    .select({ call, pack: bundle.pack, window, night })
    .from(call)
    .innerJoin(bundle, eq(bundle.id, call.bundleId))
    .leftJoin(window, eq(window.id, call.windowId))
    .leftJoin(night, eq(night.id, call.nightId))
    .where(and(eq(call.projectId, projectId), isNotNull(call.icsUid), eligible))
    .orderBy(asc(call.sentAt), asc(call.id))
  const nightIds = [...new Set(rows.flatMap((row) => (row.night ? [row.night.id] : [])))]
  const listings = nightIds.length
    ? await tx
        .select({ nightId: listing.nightId, state: listing.state })
        .from(listing)
        .where(inArray(listing.nightId, nightIds))
    : []

  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.night ? `night ${row.night.id}` : `window ${row.window!.id} ${row.pack}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  const entries: IcsEntry[] = []
  for (const group of groups.values()) {
    if (!group.some((row) => hasConditions(row.call.mode))) continue
    const { call: head, window: windowRow, night: nightRow } = group.at(-1)!
    let start: Date, end: Date, withdrawn: boolean
    if (nightRow) {
      const states = listings.filter((row) => row.nightId === nightRow.id).map((row) => row.state)
      if (!states.some((state) => state === 'listed' || state === 'cancelled')) continue
      const until = nightRow.exitEnd ?? nightRow.arrivalEnd
      if (!nightRow.arrivalStart || !until) {
        // #150 dates a night call from the arrival start, so this can't be; one bad row doesn't freeze the feed.
        log.error('conditions calendar night has no arrival period; entry left out', { night_id: nightRow.id })
        continue
      }
      ;[start, end] = [nightRow.arrivalStart, until]
      withdrawn = nightRow.state === 'unlisted' || !states.includes('listed')
    } else {
      ;[start, end] = [windowRow!.startsAt, windowRow!.endsAt]
      withdrawn = windowRow!.cancelledAt !== null
    }
    entries.push({
      uid: head.icsUid!,
      sequence: head.icsSequence,
      status: withdrawn || head.mode === 'normal' ? 'CANCELLED' : 'CONFIRMED',
      start,
      end,
      changedAt: latestOf(head.sentAt, head.updatedAt, (nightRow ?? windowRow)!.updatedAt),
      call: head
    })
  }
  return entries
}
