import type { InputValue } from '@skyclause/contracts/api/shared'
import { JPS_SOURCE_URL, JPS_STATION, REPLAY_60M } from '../landing/data'
import type { GroupedVerdict } from './window-model'

// The hero's answer while live verdicts for a chosen window are not open: the 15:30 MYT release wave on Monday
// 2 November 2026 as the clause engine read it at the 15:05 MYT poll, from the JPS capture's 60-minute total
// (data.ts, derived by generator.ts). The same reading, clause and mode as the replay fragments below the hero.
export const REPLAY_WINDOW = { from: '2026-11-02T15:30:00+08:00', to: '2026-11-02T15:45:00+08:00' } as const
const READ_AT = '2026-11-02T15:00:00'
const POLL_AT = '2026-11-02T15:05:00+08:00'

export const REPLAY_EVALUATED_AT = new Date(POLL_AT).toISOString()

function gaugeReading(): InputValue {
  const total = REPLAY_60M.find((point) => point.at === READ_AT)
  if (!total) throw new Error(`The replay has no 60-minute total at ${READ_AT}`)
  const observedAt = new Date(`${READ_AT}+08:00`).toISOString()
  return {
    name: 'site.rain_60m_mm',
    value: total.value,
    unit: 'mm',
    state: 'fresh',
    since: null,
    age_s: (Date.parse(REPLAY_EVALUATED_AT) - Date.parse(observedAt)) / 1000,
    source_ids: [JPS_STATION],
    source_url: JPS_SOURCE_URL,
    reading_ids: [],
    observed_at: observedAt
  }
}

const gauge = gaugeReading()

/** The Sky pack on the replay: Storm confirmed fired on the gauge's 39.0 mm, so it proposes Commute disruption. */
export const REPLAY_GROUPS: GroupedVerdict[] = [
  {
    pack: 'sky',
    mode: 'commute_disruption',
    fired: [{ key: 'storm_confirmed', result: 'fired', blocked_by: [], inputs: [gauge], openFrom: null }],
    blocked: [],
    notOpen: [],
    inputs: [gauge],
    freshCount: 1,
    errorCount: 0
  }
]
