import { fetchEvaluateServer, fetchLatestCallServer, fetchStatusServer, pilotRefOf } from './evaluate'
import type { HeroRead } from './landing-hero'
import { nextHourWindow, parseWindowFromSearch } from './window-model'

type Search = Readonly<Record<string, string | string[] | undefined>>

/** The request's window (its GET query, else the next hour in MYT) and the three live reads, each with a 2s timeout. */
export async function readHero(query: Search): Promise<HeroRead> {
  const now = new Date()
  const serialized = new URLSearchParams({
    date: typeof query.date === 'string' ? query.date : '',
    start: typeof query.start === 'string' ? query.start : '',
    end: typeof query.end === 'string' ? query.end : ''
  }).toString()
  const win = parseWindowFromSearch(serialized, now) ?? nextHourWindow(now)
  const pilot = pilotRefOf(process.env.PILOT_PROJECT)
  const [result, latestCall, status] = await Promise.all([
    fetchEvaluateServer(win),
    fetchLatestCallServer(pilot),
    fetchStatusServer()
  ])
  return { now, win, result, latestCall, status }
}
