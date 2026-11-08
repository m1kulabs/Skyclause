import { canonicalHash } from '@skyclause/clauses'
import type { Json, Pack } from '@skyclause/contracts'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { track } from '../analytics'
import type { Tx } from '../client'
import { emitEvent } from '../events'
import { appendLedger } from '../placeholders/c-ledger-chain'
import { bundle, call, indicatorSnapshot, night, projectPack, run, sheetVersion, window } from '../schema'
import {
  closes,
  expireStep,
  expiresAt,
  OPEN_CALL_STATES,
  REVIEW_STATES,
  sendStep,
  supersedeStep,
  transitionStep,
  type BundleSlot,
  type BundleState,
  type CallState,
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

export interface CreateBundleInput {
  runId: string
  pack: Pack
  draftOnly: boolean
  calls: CallDraft[]
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
  if (before.state !== next.state || before.supersededBy !== next.supersededBy || stamp.approvedBy) {
    await tx
      .update(bundle)
      .set({
        state: next.state,
        supersededBy: next.supersededBy,
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
 */
export async function reviewHash(tx: Tx, bundleId: string): Promise<string> {
  const [head] = await tx
    .select({ snapshotHash: indicatorSnapshot.hash, verdictHash: run.verdictHash })
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
  return canonicalHash({
    snapshot_hash: head.snapshotHash ?? null,
    verdict_hash: head.verdictHash ?? null,
    calls: calls.map((c) => [c.id, c.state, c.mode, c.notices, c.recipients])
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

/**
 * Hands a run's calls over as a bundle (#151). It closes at once when nothing would send or it is a guest window's
 * draft (CAL-5, D23), with no ledger entry (D21) and no `bundle.needs_review`; otherwise it waits in Needs review with
 * `sla_due_at` = now + the pack's `sla_s` as read now (PRJ-7). Each call expires at its window's start, or its end when
 * a fired clause of the run's sheet version has `expiry: 'end'`, or its night's arrival start (CAL-8). The bundle
 * supersedes each open call of the project and pack's bundles under review for a window or night it also has a call
 * for (CAL-7). Emits `bundle.drafted` (and `.needs_review`, `.superseded`) and tracks `bundle_drafted`.
 */
export async function createBundle(tx: Tx, input: CreateBundleInput) {
  const now = input.now ?? new Date()
  const [parent] = await tx.select().from(run).where(eq(run.id, input.runId))
  if (!parent) throw new Error(`run ${input.runId} is not visible in this transaction`)
  if (parent.pack !== input.pack) throw new Error(`run ${parent.id} is ${parent.pack}, not ${input.pack}`)
  if (!parent.sheetVersionId) throw new Error(`run ${parent.id} has no pinned sheet version`)
  const { projectId, pack } = parent

  const [version] = await tx
    .select({ content: sheetVersion.content })
    .from(sheetVersion)
    .where(eq(sheetVersion.id, parent.sheetVersionId))
  const clauseExpiry = Object.fromEntries(
    SheetContent.parse(version?.content).clauses.map(({ key, expiry }) => [key, expiry])
  )
  const [packRow] = await tx
    .select({ slaS: projectPack.slaS })
    .from(projectPack)
    .where(and(eq(projectPack.projectId, projectId), eq(projectPack.pack, pack)))
  const slaS = packRow?.slaS ?? DEFAULT_SLA_S[pack]

  for (const draft of input.calls) {
    if (Boolean(draft.windowId) === Boolean(draft.nightId))
      throw new Error('a call needs a window or a night, not both')
  }
  const windowIds = input.calls.flatMap((d) => (d.windowId ? [d.windowId] : []))
  const nightIds = input.calls.flatMap((d) => (d.nightId ? [d.nightId] : []))
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
  const expiries = input.calls.map((draft) => {
    const w = draft.windowId ? windows.find((row) => row.id === draft.windowId) : undefined
    const n = draft.nightId ? nights.find((row) => row.id === draft.nightId) : undefined
    if (!w && !n) throw new Error(`no window or night ${draft.windowId ?? draft.nightId} in project ${projectId}`)
    return expiresAt({ window: w, night: n }, draft.fired, clauseExpiry)
  })

  const state: BundleState = closes(input.calls, input.draftOnly) ? 'closed' : 'needs_review'
  const review = state === 'needs_review'
  const slaDueAt = review ? new Date(now.getTime() + slaS * 1000) : null

  // Lock the bundles a supersession may change before writing, so two runs of one pack take turns.
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
      createdAt: now,
      updatedAt: now
    })
    .returning()
  const calls = await tx
    .insert(call)
    .values(
      input.calls.map((draft, i) => ({
        orgId: tx.orgId!,
        projectId,
        bundleId: created!.id,
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
        expiresAt: expiries[i]!,
        triggeredAt: input.triggeredAt,
        draftedAt: now,
        createdAt: now,
        updatedAt: now
      }))
    )
    .returning()
  const b = { id: created!.id, projectId, pack, slaDueAt }
  const callIds = calls.map((c) => c.id)
  await refreshReviewHash(tx, b.id)
  await emitBundle(tx, 'bundle.drafted', b, callIds)
  if (review) await emitBundle(tx, 'bundle.needs_review', b, callIds)

  const successor = { id: b.id, calls: calls.map((c) => ({ id: c.id, windowId: c.windowId, nightId: c.nightId })) }
  for (const { id } of open) {
    const { row, slot } = await lockSlot(tx, id)
    const step = supersedeStep(slot, successor)
    if (!step.supersededCallIds.length) continue
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
      disagreements: input.calls.filter((d) => !d.agrees).length,
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
 * superseded bundle, or an asked call that is superseded, gives `bundle-superseded` with the newer bundle and calls;
 * an asked call that is expired, or open past `expires_at` before its timer ran, gives `call-expired`.
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
  const successorCallIds = asked.flatMap((c) =>
    c.state === 'superseded' && c.supersededByCallId ? [c.supersededByCallId] : []
  )
  if (successorCallIds.length) {
    const successors = await tx
      .select({ id: call.id, bundleId: call.bundleId, createdAt: call.createdAt })
      .from(call)
      .where(inArray(call.id, successorCallIds))
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
  if (row.state === 'superseded' && row.supersededBy) {
    return { ok: false, problem: 'bundle-superseded', successor: { bundleId: row.supersededBy, callIds: [] } }
  }
  const expired = asked.filter(
    (c) => c.state === 'expired' || (OPEN_CALL_STATES.includes(c.state) && c.expiresAt <= now)
  )
  if (expired.length) return { ok: false, problem: 'call-expired', callIds: expired.map((c) => c.id) }
  return { ok: true }
}

/**
 * Moves a bundle and its calls where the machine allows (#153: approved, edited, rejected, reconfirm, approved; #158:
 * sent, failed), stamping `approved_at`, `approved_by` and `sent_at`; refuses the moves `createBundle` and `expireCall`
 * own (closed, needs review, superseded, expired), which carry events and ledger entries.
 */
export async function transition(
  tx: Tx,
  bundleId: string,
  change: { bundle?: BundleState; calls?: Record<string, CallState>; approvedBy?: string },
  now: Date = new Date()
) {
  const owned: string[] = ['closed', 'superseded', 'expired', 'drafted']
  if (change.bundle && owned.includes(change.bundle))
    throw new Error(`a bundle reaches ${change.bundle} only on its own`)
  for (const to of Object.values(change.calls ?? {})) {
    if (owned.includes(to)) throw new Error(`a call reaches ${to} only on its own`)
  }
  const { slot } = await lockSlot(tx, bundleId)
  await writeSlot(tx, slot, transitionStep(slot, change), { now, approvedBy: change.approvedBy })
}

/** Approved and edited calls go to `sending`, an approved bundle with them; refuses anything else (CAL-7, CAL-8). */
export async function markSending(tx: Tx, bundleId: string, callIds: string[], now: Date = new Date()) {
  const { slot } = await lockSlot(tx, bundleId)
  await writeSlot(tx, slot, sendStep(slot, callIds, now), { now })
}
