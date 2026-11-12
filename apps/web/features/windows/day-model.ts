import { brandStates, type BrandState, type ModeTone } from '@skyclause/elements'
import type { BundleView, WindowView } from './operations'
import { addDays } from './model'

export const DAY_MS = 86_400_000
const HOUR = 60

export type Pack = 'sky' | 'crowd'
export type Call = NonNullable<WindowView['latest_calls'][Pack]>

/** A date key's midnight in MYT, which is UTC+08 all year. */
export const dayStart = (date: string) => Date.parse(`${date}T00:00:00+08:00`)

/** A bundle waiting for review outranks the call's own state: the call is still a draft to the approver. */
export function callState(call: Call, bundles: readonly BundleView[]) {
  const bundle = bundles.find((item) => item.id === call.bundle_id)
  return bundle?.state === 'needs_review' ? 'needs_review' : call.state
}

export interface Capsule {
  /** The glyph and word of the call's mode; null while the window has no call. */
  state: BrandState | null
  /** The `data-tone` that fills it: a mode's tone, or a call that is not current, or a draft's dotted edge. */
  tone: ModeTone | 'draft' | 'expired' | 'rejected' | 'pending'
  /** The call's state word key under `windows.` (drafted, sent...), null while the window has no call. */
  call: ReturnType<typeof callState> | null
}

/** What a call looks like on the strip: filled when approved or sent, dotted while a draft, plain once past. */
export function capsuleOf(call: Call | null | undefined, bundles: readonly BundleView[]): Capsule {
  if (!call) return { state: null, tone: 'pending', call: null }
  const state = callState(call, bundles)
  const mode: BrandState = call.mode ?? 'no_call'
  if (state === 'rejected') return { state: mode, tone: 'rejected', call: state }
  if (state === 'expired' || state === 'superseded') return { state: mode, tone: 'expired', call: state }
  if (state === 'drafted' || state === 'needs_review') return { state: mode, tone: 'draft', call: state }
  return { state: mode, tone: brandStates[mode].tone, call: state }
}

export interface Segment {
  /** Unique on the strip: window id, lane and day. */
  key: string
  window: WindowView
  lane: Pack
  /** Minutes after the day's midnight, clipped to the day. */
  from: number
  to: number
  capsule: Capsule
}

/** The capsules a day draws: one per call lane of every window that touches the day. */
export function segmentsOf(date: string, windows: readonly WindowView[], bundles: readonly BundleView[]): Segment[] {
  const start = dayStart(date)
  const end = start + DAY_MS
  const segments: Segment[] = []
  for (const window of windows) {
    const from = Date.parse(window.starts_at)
    const to = Date.parse(window.ends_at)
    // A zero-length commute wave belongs to the day it starts in.
    if (to < start || from >= end || (to === start && from !== to)) continue
    for (const lane of ['sky', 'crowd'] as const) {
      const call = window.latest_calls[lane]
      // A lane exists for a call; a window with no call yet draws one pending capsule in the Sky lane.
      if (!call && (lane === 'crowd' || window.latest_calls.crowd)) continue
      segments.push({
        key: `${window.id}:${lane}:${date}`,
        window,
        lane,
        from: (Math.max(from, start) - start) / 60_000,
        to: (Math.min(to, end) - start) / 60_000,
        capsule: capsuleOf(call, bundles)
      })
    }
  }
  return segments.sort((a, b) => a.from - b.from || a.window.title.localeCompare(b.window.title))
}

export interface Axis {
  /** Minutes after midnight at the track's left and right edge, on whole hours. */
  from: number
  to: number
}

/** The hours every day's track shows: the span of the windows plus an hour either side, never under twelve hours. */
export function axisOf(segments: readonly Pick<Segment, 'from' | 'to'>[]): Axis {
  if (!segments.length) return { from: 6 * HOUR, to: 22 * HOUR }
  let from = Math.max(0, Math.floor(Math.min(...segments.map((s) => s.from)) / HOUR) * HOUR - HOUR)
  let to = Math.min(24 * HOUR, Math.ceil(Math.max(...segments.map((s) => s.to)) / HOUR) * HOUR + HOUR)
  while (to - from < 12 * HOUR) {
    if (from > 0) from -= HOUR
    if (to - from < 12 * HOUR && to < 24 * HOUR) to += HOUR
  }
  return { from, to }
}

/** Where a minute lands on the track, as a percentage of its width. */
export const share = (minute: number, axis: Axis) => ((minute - axis.from) / (axis.to - axis.from)) * 100

/** Whole-hour ticks: every hour up to six hours, every two up to twelve, else every three. */
export function ticksOf(axis: Axis): number[] {
  const hours = (axis.to - axis.from) / HOUR
  const step = (hours <= 6 ? 1 : hours <= 12 ? 2 : 3) * HOUR
  const ticks: number[] = []
  // Midnight at the right edge is the next day's 00:00, which would read as the start of the day: leave it unlabelled.
  for (let at = Math.ceil(axis.from / step) * step; at < axis.to || (at === axis.to && at < 24 * HOUR); at += step)
    ticks.push(at)
  return ticks
}

/** The instant of a minute on a date, for `<time datetime>`. */
export const instantAt = (date: string, minute: number) => new Date(dayStart(date) + minute * 60_000).toISOString()

/** The days a week or month view lists, Monday first, from a date. */
export function weekDays(from: string): string[] {
  const monday = addDays(from, -((new Date(from).getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}
