import {
  fetchEvaluateServer,
  fetchLatestCallServer,
  fetchStatusServer,
  pilotRefOf,
  type EvaluateResult,
  type LatestCallRead,
  type StatusRead
} from './evaluate'
import type { HeroRead } from './landing-hero'
import { ANSWER_TTL_MS, FAILURE_TTL_MS, NOT_BUILT_TTL_MS, sharedReadsFor } from './shared-read'
import { nextHourWindow, parseWindowFromSearch } from './window-model'

type Search = Readonly<Record<string, string | string[] | undefined>>

/** Set once any window's verdict read answered 501: until it lapses, no page view asks for a verdict at all. */
const VERDICT_NOT_BUILT = 'verdict:not-built'

const verdictTtl = (result: EvaluateResult) =>
  result.kind === 'ok' ? ANSWER_TTL_MS : result.kind === 'unavailable' ? NOT_BUILT_TTL_MS : FAILURE_TTL_MS
const latestCallTtl = (read: LatestCallRead) =>
  read === 'error' ? FAILURE_TTL_MS : read === 'not_built' ? NOT_BUILT_TTL_MS : ANSWER_TTL_MS
const statusTtl = (read: StatusRead) =>
  read.kind === 'ok' ? ANSWER_TTL_MS : read.kind === 'not_built' ? NOT_BUILT_TTL_MS : FAILURE_TTL_MS

/**
 * The request's window (its GET query, else the next hour in MYT) and the three live reads, each with a 2s timeout.
 * The reads are the same public question for every visitor, so their answers are shared (shared-read.ts).
 */
export async function readHero(query: Search): Promise<HeroRead> {
  const now = new Date()
  const serialized = new URLSearchParams({
    date: typeof query.date === 'string' ? query.date : '',
    start: typeof query.start === 'string' ? query.start : '',
    end: typeof query.end === 'string' ? query.end : ''
  }).toString()
  const win = parseWindowFromSearch(serialized, now) ?? nextHourWindow(now)
  const pilot = pilotRefOf(process.env.PILOT_PROJECT)
  const reads = sharedReadsFor(globalThis.fetch)
  const verdict = async (): Promise<EvaluateResult> => {
    if (reads.holds(VERDICT_NOT_BUILT)) return { kind: 'unavailable' }
    const key = `verdict:${win.date}|${win.startMin}|${win.endMin}`
    const result = await reads.read(key, () => fetchEvaluateServer(win), verdictTtl)
    if (result.kind === 'unavailable') reads.hold(VERDICT_NOT_BUILT, NOT_BUILT_TTL_MS)
    return result
  }
  const [result, latestCall, status] = await Promise.all([
    verdict(),
    reads.read(
      `latest-call:${pilot ? `${pilot.org}/${pilot.project}` : ''}`,
      () => fetchLatestCallServer(pilot),
      latestCallTtl
    ),
    reads.read('status', () => fetchStatusServer(), statusTtl)
  ])
  return { now, win, result, latestCall, status }
}
