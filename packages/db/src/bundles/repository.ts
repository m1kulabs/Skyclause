import { canonicalHash } from '@skyclause/clauses'
import type { Json, Pack } from '@skyclause/contracts'
import { and, asc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { track } from '../analytics'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../ledger'
import { bundle, call, indicatorSnapshot, night, projectPack, run, sheetVersion, window } from '../schema'
import {
  closes,
  expireStep,
  expiresAt,
  OPEN_CALL_STATES,
  resolveStep,
  REVIEW_STATES,
  sendStep,
  supersedeStep,
  transitionStep,
  type BundleSlot,
  type BundleState,
  type CallState,
  type MissingCall,
  type Mode
} from './machine'

// #150's repository over `bundle` and `call`: every write locks the bundle row first (`FOR UPDATE`), applies a step
// of the pure machine and writes what changed, recomputing `review_hash` on every call change. Callers that write
// these rows (#153's approval, #158's sender) go through `transition` and `markSending`, never a raw UPDATE.

/** PRD PRJ-7's default SLAs, for a pack whose `sla_s` is unset: 10 minutes for Sky, 2 hours for a Crowd outlook. */
export const DEFAULT_SLA_S: Record<Pack, number> = { sky: 600, crowd: 7200 }

/** One call of a run's drafted bundle, as #151 hands it over (TRD agent output plus the shadow comparison). */
export interface CallDraft {
  windowId?: string | null
  nightId?: string | null
  mode: Mode | null
  watch: boolean
  noCall: string[] | null
  fired: Array<{ clause: string; inputs: string[] }>
  recommendations: string[]
  recipients: string[]
  notices: Array<{ language: 'en' | 'ms'; subject: string; body: string }>
  reason: string
  /** The clause engine's verdict for this window or night, as `Verdict` on the wire. */
  shadow: Json
  chosen: string
  agrees: boolean
  decision?: string | null
}

/** #499: a `missing` compare row of the run, as #151 hands it over; stored unresolved. */
export type MissingDraft = Omit<MissingCall, 'resolution'>

export interface CreateBundleInput {
  runId: string
  pack: Pack
  draftOnly: boolean
  calls: CallDraft[]
  missing?: MissingDraft[]
  triggeredAt: Date
  /** The drafting instant; tests inject it. */
  now?: Date
}

const SheetContent = z.object({
  clauses: z.array(z.object({ key: z.string(), expiry: z.enum(['start', 'end']).optional() }))
})

async function lockSlot(tx: Tx, bundleId: string) {
  const [row] = await tx.select().from(bundle).where(eq(bundle.id, bundleId)).for('update')
  if (!row) throw new Error(`bundle ${bundleId} is not visible in this transaction`)
  const calls = await tx.select().from(call).where(eq(call.bundleId, bundleId)).orderBy(asc(call.id))
  return { row, calls, slot: slotOf(row, calls) }
}

function slotOf(row: typeof bundle.$inferSelect, calls: Array<typeof call.$inferSelect>): BundleSlot {
  return {
    id: row.id,
    state: row.state,
    supersededBy: row.supersededBy,
    missing: row.missing as MissingCall[],
    calls: calls.map((c) => ({
      id: c.id,
      state: c.state,
      windowId: c.windowId,
      nightId: c.nightId,
      expiresAt: c.expiresAt,
      supersededByCallId: c.supersededByCallId
    }))
  }
}

/** Writes the call states, links and the bundle state `next` changed from `before`, then refreshes the hash. */
async function writeSlot(
  tx: Tx,
  before: BundleSlot,
  next: BundleSlot,
  stamp: { now: Date; approvedBy?: string } = { now: new Date() }
) {
  for (const after of next.calls) {
    const was = before.calls.find((c) => c.id === after.id)!
    if (was.state === after.state && was.supersededByCallId === after.supersededByCallId) continue
    await tx
      .update(call)
      .set({
        state: after.state,
        supersededByCallId: after.supersededByCallId,
        ...(after.state === 'approved' || after.state === 'edited' ? { approvedAt: stamp.now } : {}),
        ...(after.state === 'sent' ? { sentAt: stamp.now } : {}),
        updatedAt: stamp.now
      })
      .where(eq(call.id, after.id))
  }
  const missingChanged = canonicalHash(before.missing ?? []) !== canonicalHash(next.missing ?? [])
  if (before.state !== next.state || before.supersededBy !== next.supersededBy || stamp.approvedBy || missingChanged) {
    await tx
      .update(bundle)
      .set({
        state: next.state,
        supersededBy: next.supersededBy,
        ...(missingChanged ? { missing: next.missing } : {}),
        ...(next.state === 'approved' && stamp.approvedBy
          ? { approvedBy: stamp.approvedBy, approvedAt: stamp.now }
          : {}),
        updatedAt: stamp.now
      })
      .where(eq(bundle.id, next.id))
  }
  await refreshReviewHash(tx, next.id)
}

/**
 * `review_hash` (ticket decision): `canonicalHash({ snapshot_hash, verdict_hash, calls: [id, state, mode, notices,
 * recipients] })` over the bundle's run and its calls in ID order. #153 compares it with the hash the approver saw.
 * A bundle with missing calls (#499) adds `missing: [window or night ID, resolution]`, so other hashes are unchanged.
 */
export async function reviewHash(tx: Tx, bundleId: string): Promise<string> {
  const [head] = await tx
    .select({ snapshotHash: indicatorSnapshot.hash, verdictHash: run.verdictHash, missing: bundle.missing })
    .from(bundle)
    .innerJoin(run, eq(run.id, bundle.runId))
    .leftJoin(indicatorSnapshot, eq(indicatorSnapshot.id, run.snapshotId))
    .where(eq(bundle.id, bundleId))
  if (!head) throw new Error(`bundle ${bundleId} is not visible in this transaction`)
  const calls = await tx
    .select({ id: call.id, state: call.state, mode: call.mode, notices: call.notices, recipients: call.recipients })
    .from(call)
    .where(eq(call.bundleId, bundleId))
    .orderBy(asc(call.id))
  const missing = head.missing as MissingCall[]
  return canonicalHash({
    snapshot_hash: head.snapshotHash ?? null,
    verdict_hash: head.verdictHash ?? null,
    calls: calls.map((c) => [c.id, c.state, c.mode, c.notices, c.recipients]),
    ...(missing.length ? { missing: missing.map((m) => [m.windowId ?? m.nightId, m.resolution?.action ?? null]) } : {})
  })
}

async function refreshReviewHash(tx: Tx, bundleId: string) {
  await tx
    .update(bundle)
    .set({ reviewHash: await reviewHash(tx, bundleId) })
    .where(eq(bundle.id, bundleId))
}

type BundleEvent = 'bundle.drafted' | 'bundle.needs_review' | 'bundle.superseded' | 'bundle.expired'
const EVENT_STATE = {
  'bundle.drafted': 'drafted',
  'bundle.needs_review': 'needs_review',
  'bundle.superseded': 'superseded',
  'bundle.expired': 'expired'
} as const

function emitBundle(
  tx: Tx,
  type: BundleEvent,
  b: { id: string; projectId: string; pack: Pack; slaDueAt: Date | null },
  callIds: string[]
) {
  return emitEvent(tx, {
    projectId: b.projectId,
    type,
    data: {
      bundle_id: b.id,
      pack: b.pack,
      state: EVENT_STATE[type],
      call_ids: callIds,
      sla_due_at: b.slaDueAt?.toISOString() ?? null
    }
  })
}

/** The run's pinned sheet version's clause expiry, by clause key (CAL-8). */
async function clauseExpiryOf(tx: Tx, sheetVersionId: string) {
  const [version] = await tx
    .select({ content: sheetVersion.content })
    .from(sheetVersion)
    .where(eq(sheetVersion.id, sheetVersionId))
  return Object.fromEntries(SheetContent.parse(version?.content).clauses.map(({ key, expiry }) => [key, expiry]))
}

type Scope = { windowId?: string | null; nightId?: string | null }

/** Each scope's window or night in `projectId`, refusing one that names neither, both, or another project's. */
async function scopeRows(tx: Tx, projectId: string, scopes: Scope[]) {
  for (const scope of scopes) {
    if (Boolean(scope.windowId) === Boolean(scope.nightId))
      throw new Error('a call needs a window or a night, not both')
  }
  const windowIds = scopes.flatMap((d) => (d.windowId ? [d.windowId] : []))
  const nightIds = scopes.flatMap((d) => (d.nightId ? [d.nightId] : []))
  const windows = windowIds.length
    ? await tx
        .select()
        .from(window)
        .where(and(inArray(window.id, windowIds), eq(window.projectId, projectId)))
    : []
  const nights = nightIds.length
    ? await tx
        .select()
        .from(night)
        .where(and(inArray(night.id, nightIds), eq(night.projectId, projectId)))
    : []
  return scopes.map((scope) => {
    const w = scope.windowId ? windows.find((row) => row.id === scope.windowId) : undefined
    const n = scope.nightId ? nights.find((row) => row.id === scope.nightId) : undefined
    if (!w && !n) throw new Error(`no window or night ${scope.windowId ?? scope.nightId} in project ${projectId}`)
    return { window: w, night: n }
  })
}

/** A drafted call row of `bundleId`. */
function callRow(
  tx: Tx,
  o: { projectId: string; bundleId: string; draft: CallDraft; expiresAt: Date; triggeredAt: Date; now: Date }
) {
  const { draft, now } = o
  return {
    orgId: tx.orgId!,
    projectId: o.projectId,
    bundleId: o.bundleId,
    windowId: draft.windowId ?? null,
    nightId: draft.nightId ?? null,
    mode: draft.mode,
    watch: draft.watch,
    noCall: draft.noCall,
    fired: draft.fired,
    recommendations: draft.recommendations,
    recipients: draft.recipients,
    notices: draft.notices,
    reason: draft.reason,
    shadow: draft.shadow,
    chosen: draft.chosen,
    agrees: draft.agrees,
    decision: draft.decision ?? null,
    expiresAt: o.expiresAt,
    triggeredAt: o.triggeredAt,
    draftedAt: now,
    createdAt: now,
    updatedAt: now
  }
}

/**
 * Hands a run's calls over as a bundle (#151). It closes at once when nothing would send or it is a guest window's
 * draft (CAL-5, D23), with no ledger entry (D21) and no `bundle.needs_review`; otherwise it waits in Needs review with
 * `sla_due_at` = now + the pack's `sla_s` as read now (PRJ-7). Each call expires at its window's start, or its end when
 * a fired clause of the run's sheet version has `expiry: 'end'`, or its night's arrival start (CAL-8). The bundle
 * supersedes each open call and unresolved missing call of the project and pack's bundles under review for a window
 * or night it also has a call or a missing call for (CAL-7, #499). Emits `bundle.drafted` (and `.needs_review`,
 * `.superseded`) and tracks `bundle_drafted`.
 */
export async function createBundle(tx: Tx, input: CreateBundleInput) {
  const now = input.now ?? new Date()
  const [parent] = await tx.select().from(run).where(eq(run.id, input.runId))
  if (!parent) throw new Error(`run ${input.runId} is not visible in this transaction`)
  if (parent.pack !== input.pack) throw new Error(`run ${parent.id} is ${parent.pack}, not ${input.pack}`)
  if (!parent.sheetVersionId) throw new Error(`run ${parent.id} has no pinned sheet version`)
  const { projectId, pack } = parent

  const clauseExpiry = await clauseExpiryOf(tx, parent.sheetVersionId)
  const [packRow] = await tx
    .select({ slaS: projectPack.slaS })
    .from(projectPack)
    .where(and(eq(projectPack.projectId, projectId), eq(projectPack.pack, pack)))
  const slaS = packRow?.slaS ?? DEFAULT_SLA_S[pack]

  const missing = input.missing ?? []
  const targets = await scopeRows(tx, projectId, [...input.calls, ...missing])
  const expiries = input.calls.map((draft, i) => expiresAt(targets[i]!, draft.fired, clauseExpiry))

  const state: BundleState = closes(input.calls, input.draftOnly, missing.length) ? 'closed' : 'needs_review'
  const review = state === 'needs_review'
  const slaDueAt = review ? new Date(now.getTime() + slaS * 1000) : null

  // Two runs of one project and pack take turns, so the later one sees the earlier bundle and can supersede it; then
  // lock the bundles a supersession may change, against their expiry timers and approvals.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`bundle:${projectId}:${pack}`}, 0))`)
  const open = await tx
    .select({ id: bundle.id })
    .from(bundle)
    .where(and(eq(bundle.projectId, projectId), eq(bundle.pack, pack), inArray(bundle.state, [...REVIEW_STATES])))
    .orderBy(asc(bundle.id))
    .for('update')

  const [created] = await tx
    .insert(bundle)
    .values({
      orgId: tx.orgId!,
      projectId,
      runId: parent.id,
      pack,
      state,
      reviewHash: '',
      slaDueAt,
      needsReviewAt: review ? now : null,
      draftOnly: input.draftOnly,
      missing: missing.map((m): MissingCall => ({ ...m, resolution: null })),
      createdAt: now,
      updatedAt: now
    })
    .returning()
  const calls = input.calls.length
    ? await tx
        .insert(call)
        .values(
          input.calls.map((draft, i) =>
            callRow(tx, {
              projectId,
              bundleId: created!.id,
              draft,
              expiresAt: expiries[i]!,
              triggeredAt: input.triggeredAt,
              now
            })
          )
        )
        .returning()
    : []
  const b = { id: created!.id, projectId, pack, slaDueAt }
  const callIds = calls.map((c) => c.id)
  await refreshReviewHash(tx, b.id)
  await emitBundle(tx, 'bundle.drafted', b, callIds)
  if (review) await emitBundle(tx, 'bundle.needs_review', b, callIds)

  const successor = {
    id: b.id,
    calls: calls.map((c) => ({ id: c.id, windowId: c.windowId, nightId: c.nightId })),
    missing: missing.map((m) => ({ windowId: m.windowId, nightId: m.nightId }))
  }
  for (const { id } of open) {
    const { row, slot } = await lockSlot(tx, id)
    const step = supersedeStep(slot, successor, now)
    if (step.bundle === slot) continue
    await writeSlot(tx, slot, step.bundle, { now })
    if (step.bundleSuperseded) {
      await emitBundle(
        tx,
        'bundle.superseded',
        row,
        slot.calls.map((c) => c.id)
      )
      await track(tx, 'bundle_closed', { pack, reason: 'superseded' }, { projectId })
    }
  }

  await track(
    tx,
    'bundle_drafted',
    {
      pack,
      calls: input.calls.length,
      non_normal: input.calls.filter((d) => d.mode !== null && d.mode !== 'normal').length,
      // #499: a missing call is a disagreement too.
      disagreements: input.calls.filter((d) => !d.agrees).length + missing.length,
      no_call: input.calls.some((d) => d.noCall !== null)
    },
    { projectId }
  )
  return { bundleId: b.id, state, callIds, slaDueAt }
}

export type ExpireOutcome = 'expired' | 'not_open' | 'not_due' | 'missing'

/**
 * The `expiry-{call_id}` task (CAL-8): an open call due by `now` becomes `expired` with a `call_expired` ledger entry,
 * and the last open call of a bundle under review expires the bundle (`bundle.expired`, `bundle_closed`). Replaying
 * it is a no-op (`not_open`); `not_due` means the task came early and should retry.
 */
export async function expireCall(
  tx: Tx,
  callId: string,
  now: Date = new Date()
): Promise<{ outcome: ExpireOutcome; bundleExpired: boolean }> {
  const [found] = await tx.select({ bundleId: call.bundleId }).from(call).where(eq(call.id, callId))
  if (!found) return { outcome: 'missing', bundleExpired: false }
  const { row, calls, slot } = await lockSlot(tx, found.bundleId)
  const step = expireStep(slot, callId, now)
  if (step.outcome !== 'expired') return { outcome: step.outcome, bundleExpired: false }
  const expired = calls.find((c) => c.id === callId)!
  await writeSlot(tx, slot, step.bundle, { now })
  await appendLedger(tx, {
    projectId: row.projectId,
    kind: 'call_expired',
    refs: {
      call_id: expired.id,
      bundle_id: row.id,
      ...(expired.windowId ? { window_id: expired.windowId } : {}),
      ...(expired.nightId ? { night_id: expired.nightId } : {})
    },
    body: { expires_at: expired.expiresAt.toISOString(), mode: expired.mode, watch: expired.watch }
  })
  if (step.bundleExpired) {
    await emitBundle(
      tx,
      'bundle.expired',
      row,
      slot.calls.map((c) => c.id)
    )
    await track(tx, 'bundle_closed', { pack: row.pack, reason: 'expired' }, { projectId: row.projectId })
  }
  return { outcome: 'expired', bundleExpired: step.bundleExpired }
}

export type ApproveGuard =
  | { ok: true }
  | { ok: false; problem: 'bundle-superseded'; successor: { bundleId: string; callIds: string[] } }
  | { ok: false; problem: 'call-expired'; callIds: string[] }

/**
 * #153's check before approving `callIds` of a bundle (CAL-7, CAL-8), holding the bundle's row lock to commit. A
 * superseded bundle, or an asked call that is superseded, gives `bundle-superseded` with the newest bundle along the
 * chain of supersessions and its calls (for a call a missing call superseded, the newest later bundle covering its
 * window or night, #499); an asked call that is expired, or open past `expires_at` before its timer ran, gives
 * `call-expired`.
 */
export async function approveGuard(
  tx: Tx,
  bundleId: string,
  callIds: string[],
  now: Date = new Date()
): Promise<ApproveGuard> {
  const { row, calls } = await lockSlot(tx, bundleId)
  const asked = callIds.map((id) => {
    const found = calls.find((c) => c.id === id)
    if (!found) throw new Error(`call ${id} is not in bundle ${bundleId}`)
    return found
  })
  const supersededBy = (c: { state: CallState; supersededByCallId: string | null }) =>
    c.state === 'superseded' ? c.supersededByCallId : null
  const successorCallIds = asked.flatMap((c) => supersededBy(c) ?? [])
  if (successorCallIds.length) {
    // Follow each link to a call that isn't itself superseded; a newer bundle is always created later, so this ends.
    const successorsOf = (ids: string[]) =>
      tx
        .select({
          id: call.id,
          bundleId: call.bundleId,
          createdAt: call.createdAt,
          state: call.state,
          supersededByCallId: call.supersededByCallId
        })
        .from(call)
        .where(inArray(call.id, ids))
    let successors = await successorsOf(successorCallIds)
    while (successors.some(supersededBy)) {
      successors = await successorsOf([...new Set(successors.map((s) => supersededBy(s) ?? s.id))])
    }
    const newest = successors.reduce((a, c) => (c.createdAt > a.createdAt ? c : a))
    return {
      ok: false,
      problem: 'bundle-superseded',
      successor: {
        bundleId: newest.bundleId,
        callIds: successors.filter((s) => s.bundleId === newest.bundleId).map((s) => s.id)
      }
    }
  }
  // CAL-7 (#499): a call a newer bundle's missing call superseded has no call to follow; it is decided in the newest
  // later bundle of the project and pack with a call or a missing call for its window or night.
  const unlinked = asked.filter((c) => c.state === 'superseded' && !c.supersededByCallId)
  if (unlinked.length) {
    const windowIds = unlinked.flatMap((c) => (c.windowId ? [c.windowId] : []))
    const nightIds = unlinked.flatMap((c) => (c.nightId ? [c.nightId] : []))
    const scopes = new Set([...windowIds, ...nightIds])
    // A successor drafted in the same instant counts as later.
    const isLater = and(
      eq(bundle.projectId, row.projectId),
      eq(bundle.pack, row.pack),
      gte(bundle.createdAt, row.createdAt),
      ne(bundle.id, row.id)
    )
    const laterCalls = await tx
      .select({ id: call.id, bundleId: call.bundleId, createdAt: bundle.createdAt })
      .from(call)
      .innerJoin(bundle, eq(bundle.id, call.bundleId))
      .where(
        and(
          isLater,
          or(
            windowIds.length ? inArray(call.windowId, windowIds) : sql`false`,
            nightIds.length ? inArray(call.nightId, nightIds) : sql`false`
          )
        )
      )
    const laterMissing = await tx
      .select({ id: bundle.id, createdAt: bundle.createdAt, missing: bundle.missing })
      .from(bundle)
      .where(and(isLater, ne(bundle.missing, sql`'[]'::jsonb`)))
    const covering = [
      ...laterCalls.map((c) => ({ bundleId: c.bundleId, createdAt: c.createdAt })),
      ...laterMissing
        .filter((b) => (b.missing as MissingCall[]).some((m) => scopes.has((m.windowId ?? m.nightId)!)))
        .map((b) => ({ bundleId: b.id, createdAt: b.createdAt }))
    ]
    if (!covering.length) throw new Error(`no later bundle covers the calls superseded in bundle ${bundleId}`)
    const newest = covering.reduce((a, c) =>
      c.createdAt > a.createdAt || (+c.createdAt === +a.createdAt && c.bundleId > a.bundleId) ? c : a
    )
    return {
      ok: false,
      problem: 'bundle-superseded',
      successor: {
        bundleId: newest.bundleId,
        callIds: laterCalls.filter((c) => c.bundleId === newest.bundleId).map((c) => c.id)
      }
    }
  }
  if (row.state === 'superseded' && row.supersededBy) {
    let successor = row.supersededBy
    for (;;) {
      const [next] = await tx
        .select({ state: bundle.state, supersededBy: bundle.supersededBy })
        .from(bundle)
        .where(eq(bundle.id, successor))
      if (next?.state !== 'superseded' || !next.supersededBy) break
      successor = next.supersededBy
    }
    return { ok: false, problem: 'bundle-superseded', successor: { bundleId: successor, callIds: [] } }
  }
  const expired = asked.filter(
    (c) => c.state === 'expired' || (OPEN_CALL_STATES.includes(c.state) && c.expiresAt <= now)
  )
  if (expired.length) return { ok: false, problem: 'call-expired', callIds: expired.map((c) => c.id) }
  return { ok: true }
}

/**
 * Moves a bundle and its calls where the machine allows (#153: approved, edited, rejected, reconfirm, needs review
 * after a reconfirm, approved; #158: sent, failed), stamping `approved_at`, `approved_by` and `sent_at`. Refuses the
 * moves that carry events and ledger entries, which `createBundle` and `expireCall` own (drafted, closed, superseded,
 * expired), and `sending`, which goes through `markSending`'s expiry check.
 */
export async function transition(
  tx: Tx,
  bundleId: string,
  change: { bundle?: BundleState; calls?: Record<string, CallState>; approvedBy?: string },
  now: Date = new Date()
) {
  const owned: string[] = ['closed', 'superseded', 'expired', 'drafted']
  const refuse = (what: string, to: string) => {
    if (to === 'sending') throw new Error(`a ${what} reaches sending through markSending`)
    if (owned.includes(to)) throw new Error(`a ${what} reaches ${to} only on its own`)
  }
  if (change.bundle) refuse('bundle', change.bundle)
  for (const to of Object.values(change.calls ?? {})) refuse('call', to)
  const { slot } = await lockSlot(tx, bundleId)
  await writeSlot(tx, slot, transitionStep(slot, change), { now, approvedBy: change.approvedBy })
}

/** Approved and edited calls go to `sending`, an approved bundle with them; refuses anything else (CAL-7, CAL-8). */
export async function markSending(tx: Tx, bundleId: string, callIds: string[], now: Date = new Date()) {
  const { slot } = await lockSlot(tx, bundleId)
  await writeSlot(tx, slot, sendStep(slot, callIds, now), { now })
}

/**
 * #499: an approver dismisses a missing call of a bundle under review with a reason; #153's approval writes its ledger
 * entry and audit event.
 */
export async function dismissMissing(
  tx: Tx,
  bundleId: string,
  scope: Scope,
  o: { reason: string; by: string },
  now: Date = new Date()
) {
  const { slot } = await lockSlot(tx, bundleId)
  const next = resolveStep(slot, scope, { action: 'dismissed', reason: o.reason, by: o.by, at: now.toISOString() })
  await writeSlot(tx, slot, next, { now })
}

/**
 * #499: an approver drafts a call for a missing call of a bundle under review (#153 then decides it like any other).
 * The call expires as a drafted one would (CAL-8); one already due isn't added (`{ok: false}`).
 */
export async function draftMissingCall(
  tx: Tx,
  bundleId: string,
  draft: CallDraft,
  by: string,
  now: Date = new Date()
): Promise<{ ok: true; call: typeof call.$inferSelect } | { ok: false; expiresAt: Date }> {
  const { row, slot } = await lockSlot(tx, bundleId)
  const resolve = (callId: string) => resolveStep(slot, draft, { action: 'drafted', callId, by, at: now.toISOString() })
  resolve('') // refuses a scope with no unresolved missing call before anything is written
  const [parent] = await tx.select().from(run).where(eq(run.id, row.runId))
  if (!parent?.sheetVersionId) throw new Error(`run ${row.runId} has no pinned sheet version`)
  const [target] = await scopeRows(tx, row.projectId, [draft])
  const due = expiresAt(target!, draft.fired, await clauseExpiryOf(tx, parent.sheetVersionId))
  if (due <= now) return { ok: false, expiresAt: due }
  const [made] = await tx
    .insert(call)
    .values(
      callRow(tx, {
        projectId: row.projectId,
        bundleId,
        draft,
        expiresAt: due,
        triggeredAt: parent.triggeredAt,
        now
      })
    )
    .returning()
  await writeSlot(tx, slot, resolve(made!.id), { now })
  return { ok: true, call: made! }
}

/** The instant local midnight starts `date` (`YYYY-MM-DD`) in `timeZone`, for reads filtered by local dates. */
export async function startOfLocalDay(tx: Tx, date: string, timeZone: string): Promise<Date> {
  const { rows } = await tx.execute<{ at: Date }>(sql`SELECT (${date}::date::timestamp AT TIME ZONE ${timeZone}) AS at`)
  return new Date(rows[0]!.at)
}
