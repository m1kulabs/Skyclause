import type { bundleState, callState, mode } from '../schema'

// #150, TRD "Bundle state machine" and #79 §3's call states: the pure machine. The repository loads a bundle's
// slots under a row lock, applies one of these steps and writes what changed, so the database never holds a state
// these tables don't allow. No I/O here.

export type BundleState = (typeof bundleState.enumValues)[number]
export type CallState = (typeof callState.enumValues)[number]
export type Mode = (typeof mode.enumValues)[number]

/** Where each call state may go. An expired or superseded call is final, so it never reaches `sending` (CAL-7, CAL-8). */
export const CALL_TRANSITIONS: Readonly<Record<CallState, readonly CallState[]>> = {
  drafted: ['approved', 'edited', 'rejected', 'expired', 'superseded'],
  approved: ['sending', 'expired'],
  edited: ['sending', 'expired'],
  rejected: [],
  expired: [],
  superseded: [],
  sending: ['sent', 'failed'],
  sent: [],
  failed: []
}

/**
 * TRD's diagram. `reconfirm` may also be superseded or expire, so a bundle whose approver is mid-reconfirm can't stall
 * in it; escalation (NeedsReview → NeedsReview) changes `escalation_level`, not the state.
 */
export const BUNDLE_TRANSITIONS: Readonly<Record<BundleState, readonly BundleState[]>> = {
  drafted: ['closed', 'needs_review'],
  needs_review: ['superseded', 'expired', 'reconfirm', 'approved'],
  reconfirm: ['approved', 'needs_review', 'superseded', 'expired'],
  approved: ['sending'],
  sending: ['sent'],
  sent: ['graded'],
  closed: ['graded'],
  expired: ['graded'],
  superseded: [],
  graded: []
}

/** A call not yet handed to the sender and not final: expiry and supersession act only on these. */
export const OPEN_CALL_STATES: readonly CallState[] = ['drafted', 'approved', 'edited']
/** A bundle waiting on an approver. */
export const REVIEW_STATES: readonly BundleState[] = ['needs_review', 'reconfirm']
/**
 * The bundle states whose calls may still be decided, sent or delivered. A closed bundle (all Normal, or a guest
 * window's draft) never sends (CAL-5, D23), and a superseded or expired one has no open call left.
 */
const LIVE_STATES: readonly BundleState[] = [...REVIEW_STATES, 'approved', 'sending']

export const canMoveCall = (from: string, to: string) =>
  (CALL_TRANSITIONS[from as CallState] ?? []).includes(to as CallState)
export const canMoveBundle = (from: string, to: string) =>
  (BUNDLE_TRANSITIONS[from as BundleState] ?? []).includes(to as BundleState)

/**
 * CAL-5 and D23: nothing would send when every call is Normal (a Watch included) without a No call, or when the bundle
 * is a guest window's draft. Such a bundle closes at once.
 */
export function closes(calls: Array<{ mode: Mode | null; noCall: unknown[] | null }>, draftOnly: boolean) {
  return draftOnly || calls.every((call) => call.mode === 'normal' && !call.noCall)
}

/**
 * CAL-8: a window call expires at the window's start, or its end when any fired clause carries `expiry: 'end'`
 * (Storm confirmed, Flash-flood risk); a night call when the night's arrival period starts.
 */
export function expiresAt(
  target: { window?: { startsAt: Date; endsAt: Date }; night?: { arrivalStart: Date | null } },
  fired: Array<{ clause: string }>,
  clauseExpiry: Record<string, 'start' | 'end' | undefined>
): Date {
  if (target.window) {
    return fired.some(({ clause }) => clauseExpiry[clause] === 'end') ? target.window.endsAt : target.window.startsAt
  }
  if (target.night?.arrivalStart) return target.night.arrivalStart
  throw new Error('a night call needs the night’s arrival start to expire')
}

export interface CallSlot {
  id: string
  state: CallState
  windowId: string | null
  nightId: string | null
  expiresAt: Date
  supersededByCallId: string | null
}

export interface BundleSlot {
  id: string
  state: BundleState
  supersededBy: string | null
  calls: CallSlot[]
}

const isOpen = (bundle: BundleSlot, call: CallSlot) =>
  OPEN_CALL_STATES.includes(call.state) && bundle.state !== 'closed' && bundle.state !== 'drafted'
const hasOpenCall = (bundle: BundleSlot) => bundle.calls.some((call) => isOpen(bundle, call))

/**
 * The `expiry-{call_id}` task (CAL-8): an open call due by `now` expires; the last open call of a bundle under review
 * takes the bundle with it. `not_due` lets the task retry; `not_open` (already final, sending, or a closed bundle's)
 * is the replay no-op.
 */
export function expireStep(
  bundle: BundleSlot,
  callId: string,
  now: Date
): { bundle: BundleSlot; outcome: 'expired' | 'not_open' | 'not_due'; bundleExpired: boolean } {
  const target = bundle.calls.find((call) => call.id === callId)
  if (!target) throw new Error(`call ${callId} is not in bundle ${bundle.id}`)
  if (!isOpen(bundle, target)) return { bundle, outcome: 'not_open', bundleExpired: false }
  if (target.expiresAt > now) return { bundle, outcome: 'not_due', bundleExpired: false }
  const calls = bundle.calls.map((call) => (call.id === callId ? { ...call, state: 'expired' as const } : call))
  const next = { ...bundle, calls }
  const bundleExpired = REVIEW_STATES.includes(bundle.state) && !hasOpenCall(next)
  return { bundle: bundleExpired ? { ...next, state: 'expired' } : next, outcome: 'expired', bundleExpired }
}

/**
 * CAL-7: a newer bundle of the same project and pack supersedes each open call of a bundle under review whose window
 * or night it also has a call for; a bundle left with no open call is superseded and links to the newer one.
 */
export function supersedeStep(
  bundle: BundleSlot,
  successor: { id: string; calls: Array<{ id: string; windowId: string | null; nightId: string | null }> }
): { bundle: BundleSlot; supersededCallIds: string[]; bundleSuperseded: boolean } {
  if (!REVIEW_STATES.includes(bundle.state)) return { bundle, supersededCallIds: [], bundleSuperseded: false }
  const successorOf = (call: CallSlot) =>
    successor.calls.find(
      (next) => (call.windowId && next.windowId === call.windowId) || (call.nightId && next.nightId === call.nightId)
    )
  const supersededCallIds: string[] = []
  const calls = bundle.calls.map((call) => {
    const next = isOpen(bundle, call) ? successorOf(call) : undefined
    if (!next) return call
    supersededCallIds.push(call.id)
    return { ...call, state: 'superseded' as const, supersededByCallId: next.id }
  })
  const next = { ...bundle, calls }
  const bundleSuperseded = supersededCallIds.length > 0 && !hasOpenCall(next)
  return {
    bundle: bundleSuperseded ? { ...next, state: 'superseded', supersededBy: successor.id } : next,
    supersededCallIds,
    bundleSuperseded
  }
}

/**
 * `markSending`: approved or edited calls of an approved bundle go to `sending`, and the bundle with them. Refuses any
 * other call or bundle, and a call past its `expires_at` whose timer hasn't fired yet, since an expired call never
 * sends (CAL-8).
 */
export function sendStep(bundle: BundleSlot, callIds: string[], now: Date): BundleSlot {
  if (bundle.state !== 'approved' && bundle.state !== 'sending') {
    throw new Error(`bundle ${bundle.id} is ${bundle.state}; only an approved bundle sends`)
  }
  for (const id of callIds) {
    const call = bundle.calls.find((c) => c.id === id)
    if (!call) throw new Error(`call ${id} is not in bundle ${bundle.id}`)
    if (!canMoveCall(call.state, 'sending')) throw new Error(`call ${id} is ${call.state}; it can't be sent`)
    if (call.expiresAt <= now)
      throw new Error(`call ${id} expired at ${call.expiresAt.toISOString()}; it can't be sent`)
  }
  const calls = bundle.calls.map((call) => (callIds.includes(call.id) ? { ...call, state: 'sending' as const } : call))
  return { ...bundle, state: bundle.state === 'approved' ? 'sending' : bundle.state, calls }
}

/**
 * The guarded move behind `transition` (#153's decisions, #158's sent and failed): each named call and the bundle go
 * where the tables above allow, or the whole step is refused. Calls move only in a live bundle, and a bundle is
 * approved only once no call is left drafted (TRD: "per call approved, edited or rejected").
 */
export function transitionStep(
  bundle: BundleSlot,
  change: { bundle?: BundleState; calls?: Record<string, CallState> }
): BundleSlot {
  if (change.bundle && change.bundle !== bundle.state && !canMoveBundle(bundle.state, change.bundle)) {
    throw new Error(`bundle ${bundle.id} can't go from ${bundle.state} to ${change.bundle}`)
  }
  const moves = change.calls ?? {}
  if (Object.keys(moves).length && !LIVE_STATES.includes(bundle.state)) {
    throw new Error(`bundle ${bundle.id} is ${bundle.state}; its calls don't move`)
  }
  for (const [id, to] of Object.entries(moves)) {
    const call = bundle.calls.find((c) => c.id === id)
    if (!call) throw new Error(`call ${id} is not in bundle ${bundle.id}`)
    if (call.state !== to && !canMoveCall(call.state, to)) {
      throw new Error(`call ${id} can't go from ${call.state} to ${to}`)
    }
  }
  const next = {
    ...bundle,
    state: change.bundle ?? bundle.state,
    calls: bundle.calls.map((call) => (moves[call.id] ? { ...call, state: moves[call.id]! } : call))
  }
  const undecided = next.calls.filter((call) => call.state === 'drafted')
  if (next.state === 'approved' && bundle.state !== 'approved' && undecided.length) {
    throw new Error(
      `bundle ${bundle.id} can't be approved with calls undecided: ${undecided.map((c) => c.id).join(', ')}`
    )
  }
  return next
}
