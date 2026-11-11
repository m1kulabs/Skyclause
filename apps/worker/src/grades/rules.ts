import { effectiveSpan, type Clause, type SkyMode } from '@skyclause/clauses'
import { REVIEW_REASONS, type ReviewReason } from '@skyclause/db'

// #161 c-grades: TRD grading's outcomes, read literally, and the ticket's review reasons. Pure.

const RANK: Record<SkyMode, number> = { normal: 0, outdoor_limited: 1, commute_disruption: 2, hybrid_recommended: 3 }
const above = (mode: SkyMode | null): mode is Exclude<SkyMode, 'normal'> => mode !== null && mode !== 'normal'

/** What grading reads of a call: its proposal, whether it was a No call, and whether anyone approved it. */
export interface SkyCall {
  mode: SkyMode | null
  noCall: boolean
  approved: boolean
  state: string
}

export interface SkyGradeInput {
  /** The graded call, or null for a window graded only because its shadow verdict fired (ANL-2). */
  call: SkyCall | null
  /** The pinned version's verdict over the span's readings; null when a required input was missing. */
  observed: SkyMode | null
  shadowFired: boolean
  /** Whether any call of the window was approved. */
  windowApproved: boolean
}

export type SkyOutcome = 'hit' | 'miss' | 'false_alarm' | 'correct_normal' | 'no_call'

/**
 * Hit, miss, false alarm or correct Normal; No call apart. Only an approved call can hit or false-alarm: a rejected or
 * expired call, or a window with none, is a miss when the weather turned and correct Normal when it didn't, while
 * `proposed_mode` keeps what was proposed so a rejection can be judged.
 */
export function gradeSky({ call, observed, shadowFired, windowApproved }: SkyGradeInput) {
  const proposed = call?.mode ?? null
  const noCall = observed === null || call?.noCall === true
  let outcome: SkyOutcome
  if (noCall) outcome = 'no_call'
  else if (call?.approved && above(proposed)) outcome = above(observed) ? 'hit' : 'false_alarm'
  else outcome = above(observed) ? 'miss' : 'correct_normal'
  const modeDiff =
    !noCall && above(proposed) && above(observed) && proposed !== observed ? RANK[observed] - RANK[proposed] : 0
  const reasons = new Set<ReviewReason>()
  if (outcome === 'miss') reasons.add('miss')
  if (outcome === 'false_alarm') reasons.add('false_alarm')
  if (call?.state === 'expired' && above(proposed)) reasons.add('expired_above_normal')
  if (shadowFired && !windowApproved) reasons.add('no_call')
  return { outcome, noCall, modeDiff, reasons: REVIEW_REASONS.filter((reason) => reasons.has(reason)) }
}

/** In band when `band_low ≤ actual ≤ band_high`. */
export const crowdOutcome = (actual: number, band: { low: number; high: number }) =>
  band.low <= actual && actual <= band.high ? ('in_band' as const) : ('out_of_band' as const)

const SPAN_REF = /^(start|end)(?:([+-])(\d+)([mh]))?$/

/** A TRD span reference (`end+60m`, `start-4h`, `end`) against its window. */
export function spanAt(window: { startsAt: Date; endsAt: Date }, ref: string): Date {
  const match = SPAN_REF.exec(ref)
  if (!match) throw new Error(`span reference ${JSON.stringify(ref)} isn't start or end ± minutes or hours`)
  const [, anchor, sign, amount, unit] = match
  const base = (anchor === 'start' ? window.startsAt : window.endsAt).getTime()
  const offset = amount ? Number(amount) * (unit === 'h' ? 3_600_000 : 60_000) * (sign === '-' ? -1 : 1) : 0
  return new Date(base + offset)
}

/**
 * When the window's last enabled window-scope clause span closes, as the engine evaluates it (a clause reading a window
 * rain maximum with no written span has the default one); never before the window ends.
 */
export function lastSpanEnd(
  window: { startsAt: Date; endsAt: Date },
  clauses: Array<Pick<Clause, 'scope' | 'enabled' | 'requires' | 'optional' | 'span'>>
): Date {
  const ends = clauses
    .filter((clause) => clause.enabled && clause.scope === 'window')
    .flatMap((clause) => effectiveSpan(clause) ?? [])
    .map((span) => spanAt(window, span.to).getTime())
  return new Date(Math.max(window.endsAt.getTime(), ...ends))
}

/** `date` moved by `days`, as dates (no time zone involved). */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
