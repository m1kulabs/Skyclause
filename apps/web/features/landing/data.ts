// Derived-only landing data (#79 D32, #185): the generator's 60-minute totals, never the 5-minute series or the
// capture file. Totals were produced by `generator.ts` from the JPS capture in `fixtures.json`.
export const JPS_SOURCE_URL = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
export const JPS_STATION = '0232901RF'
export const JPS_CAPTURED_AT = '2026-11-05T13:12:00Z'
export const REPLAY_SOURCE = 'infobanjirjpskl.water.gov.my station 75'

// 60-minute totals (mm) at 5-minute steps, MYT wall clock 2026-11-02 14:00–16:30. Derived by the generator.
export const REPLAY_60M: ReadonlyArray<{ at: string; value: number }> = [
  { at: '2026-11-02T14:00:00', value: 0 },
  { at: '2026-11-02T14:05:00', value: 0 },
  { at: '2026-11-02T14:10:00', value: 0 },
  { at: '2026-11-02T14:15:00', value: 0 },
  { at: '2026-11-02T14:20:00', value: 0 },
  { at: '2026-11-02T14:25:00', value: 0 },
  { at: '2026-11-02T14:30:00', value: 0 },
  { at: '2026-11-02T14:35:00', value: 0.5 },
  { at: '2026-11-02T14:40:00', value: 3 },
  { at: '2026-11-02T14:45:00', value: 12 },
  { at: '2026-11-02T14:50:00', value: 21 },
  { at: '2026-11-02T14:55:00', value: 29.5 },
  { at: '2026-11-02T15:00:00', value: 39 },
  { at: '2026-11-02T15:05:00', value: 44.5 },
  { at: '2026-11-02T15:10:00', value: 49.5 },
  { at: '2026-11-02T15:15:00', value: 54 },
  { at: '2026-11-02T15:20:00', value: 56 },
  { at: '2026-11-02T15:25:00', value: 57.5 },
  { at: '2026-11-02T15:30:00', value: 58.5 },
  { at: '2026-11-02T15:35:00', value: 59.5 },
  { at: '2026-11-02T15:40:00', value: 57.5 },
  { at: '2026-11-02T15:45:00', value: 49.5 },
  { at: '2026-11-02T15:50:00', value: 41 },
  { at: '2026-11-02T15:55:00', value: 33 },
  { at: '2026-11-02T16:00:00', value: 24 },
  { at: '2026-11-02T16:05:00', value: 18.5 },
  { at: '2026-11-02T16:10:00', value: 14 },
  { at: '2026-11-02T16:15:00', value: 9.5 },
  { at: '2026-11-02T16:20:00', value: 7.5 },
  { at: '2026-11-02T16:25:00', value: 6 },
  { at: '2026-11-02T16:30:00', value: 5 }
]

export function replaySlice(from: string, to: string) {
  return REPLAY_60M.filter((point) => point.at >= from && point.at <= to).map((point) => ({
    at: `${point.at}+08:00`,
    value: point.value
  }))
}

export const WINDOW_1530_FROM = '2026-11-02T15:30:00+08:00'
export const WINDOW_1530_TO = '2026-11-02T15:30:00+08:00'
export const CLAUSE_SPAN_FROM = '2026-11-02T15:00:00+08:00'
export const CLAUSE_SPAN_TO = '2026-11-02T16:30:00+08:00'
