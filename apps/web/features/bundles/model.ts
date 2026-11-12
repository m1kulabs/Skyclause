import type { CallView } from '@skyclause/contracts'
import type { ApprovalBody } from './operations'
import { teachingLine } from './i18n'

/** The bundle list shows the newest bundles only: lists never render more than 50 rows. */
export const LIST_LIMIT = 50

export type Decision = Partial<Omit<ApprovalBody['calls'][number], 'call_id'>>
export type Decisions = Record<string, Decision>

/** Whether a membership role may approve bundles (PRD roles: Approver, Admin and Owner). */
export function approves(role: string | null): boolean {
  return role !== null && ['approver', 'admin', 'owner'].includes(role)
}

export function orderedCalls<T extends CallView>(calls: readonly T[]): T[] {
  return [...calls].sort((a, b) => Number(a.agrees) - Number(b.agrees))
}

export function canReviewCall(call: CallView, now: number): boolean {
  return (
    ['drafted', 'edited'].includes(call.state) &&
    Date.parse(call.expires_at) > now &&
    !call.no_call?.length &&
    (!call.agrees || (call.mode !== null && call.mode !== 'normal') || call.recommendations.length > 0)
  )
}

export function decisionsFor(calls: readonly CallView[], decisions: Decisions, now: number): ApprovalBody['calls'] {
  return calls
    .filter((call) => canReviewCall(call, now))
    .map((call) => ({
      call_id: call.id,
      action: 'approve',
      ...decisions[call.id]
    }))
}

export function reviewCount(calls: readonly CallView[], decisions: Decisions, now: number): number {
  return decisionsFor(calls, decisions, now).filter((call) => call.action !== 'reject').length
}

/** A call's fate if the bundle is approved now, printed under its badge. */
export type Fate = 'included' | 'edited' | 'rejected'
export function callFate(decision: Decision): Fate {
  if (decision.action === 'reject') return 'rejected'
  return decision.action === 'edit' || decision.notices || decision.recipients ? 'edited' : 'included'
}

/** What a decision reaches: one notice per call that has recipients, the recipients counted once across calls. */
export interface Reach {
  notices: number
  recipients: number
  rejected: number
}

function reach(items: ReadonlyArray<{ rejected: boolean; recipients: readonly string[] }>): Reach {
  const recipients = new Set<string>()
  let notices = 0
  let rejected = 0
  for (const item of items) {
    if (item.rejected) rejected += 1
    else if (item.recipients.length) {
      notices += 1
      for (const id of item.recipients) recipients.add(id)
    }
  }
  return { notices, recipients: recipients.size, rejected }
}

/** What Approve would send now, from the calls still open and the reviewer's decisions on them. */
export function approvalReach(calls: readonly CallView[], decisions: Decisions, now: number): Reach {
  return reach(
    decisionsFor(calls, decisions, now).map((decision) => ({
      rejected: decision.action === 'reject',
      recipients: decision.recipients ?? calls.find((call) => call.id === decision.call_id)?.recipients ?? []
    }))
  )
}

/** The calls an approval let through: approved, sending or sent (or stamped approved), never the rejected ones. */
export function approvedCalls<T extends CallView>(calls: readonly T[]): T[] {
  return calls.filter(
    (call) =>
      call.state !== 'rejected' &&
      (!!call.approved_at || ['approved', 'sending', 'sent', 'failed'].includes(call.state))
  )
}

/**
 * What an approved bundle sent or is sending: its approved calls, their recipients once each, when it was approved and,
 * once every one of them is sent, when the last went out.
 */
export function approvedReach(
  calls: readonly CallView[]
): Reach & { approvedAt: string | null; sentAt: string | null } {
  const approved = approvedCalls(calls)
  const latest = (values: Array<string | null>) =>
    values.reduce<string | null>((last, value) => (value && (!last || value > last) ? value : last), null)
  const sending = approved.filter((call) => call.recipients.length)
  return {
    ...reach([
      ...approved.map((call) => ({ rejected: false, recipients: call.recipients })),
      ...calls.filter((call) => call.state === 'rejected').map(() => ({ rejected: true, recipients: [] }))
    ]),
    approvedAt: latest(approved.map((call) => call.approved_at)),
    sentAt: sending.length && sending.every((call) => call.sent_at) ? latest(sending.map((call) => call.sent_at)) : null
  }
}

export function teachingLineIncluded(call: CallView, decision: Decision): boolean {
  if (decision.action === 'reject') return false
  const mode = decision.chosen === 'shadow' ? call.shadow.mode : call.mode
  if (mode !== 'hybrid_recommended') return false
  // Only edited wording is checked: drafts never carry the line, and templates add it at send.
  const notices = decision.notices ?? []
  return notices.some((notice) =>
    [notice.subject, notice.body].some((text) => text.includes(teachingLine(notice.language)))
  )
}

export type CallMark =
  'hybrid_recommended' | 'commute_disruption' | 'outdoor_limited' | 'surge_night' | 'no_call' | 'storm_watch' | 'normal'
/** Call marks from the most to the least disruptive. */
export const markRank: CallMark[] = [
  'hybrid_recommended',
  'commute_disruption',
  'outdoor_limited',
  'surge_night',
  'no_call',
  'storm_watch',
  'normal'
]

/** A call's mark: No call when a required input failed, else its mode, else Storm watch or No call. */
export function callMark(call: Pick<CallView, 'mode' | 'watch' | 'no_call'>): CallMark {
  if (call.no_call?.length) return 'no_call'
  return call.mode ?? (call.watch ? 'storm_watch' : 'no_call')
}
