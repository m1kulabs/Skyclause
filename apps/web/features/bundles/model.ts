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
