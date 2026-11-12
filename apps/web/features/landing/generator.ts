import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Committed generator (spec §7, #185): derives the 60-minute totals shipped on the landing from the stored JPS
// capture. Pure derivation only — the capture file itself is never imported by the landing bundle, so the build
// output holds no 5-minute value and no capture file. `totals.ts` holds the derived output; tests re-derive it
// here and compare.
export interface CaptureRow {
  timestamp: string
  rf: number
  dailyrf: number
}

export interface Capture {
  stationId?: string
  data: CaptureRow[]
}

// From this file, so the tests find it whichever directory Vitest runs from.
const CAPTURE_PATH = join(
  import.meta.dirname,
  '../../../../packages/agent/test/fixtures/rainfall-graph-75-20261105T1312Z.json'
)

export function loadCapture(): Capture {
  return JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as Capture
}

export function parseMyt(timestamp: string): number {
  return new Date(`${timestamp}+08:00`).getTime()
}

/** 60-minute total at `target` (MYT "YYYY-MM-DDTHH:MM:SS"): sum of rf in (target − 60 min, target]. */
export function sixtyMinuteTotalAt(capture: Capture, target: string): number {
  const t = parseMyt(target)
  const sum = capture.data
    .filter((row) => {
      const rt = parseMyt(row.timestamp)
      return rt > t - 3_600_000 && rt <= t
    })
    .reduce((acc, row) => acc + row.rf, 0)
  return Math.round(sum * 10) / 10
}

/** Every 5-minute 60-minute total in [from, to] inclusive (MYT strings). */
export function deriveSeries(capture: Capture, from: string, to: string): Array<{ at: string; value: number }> {
  const rows: Array<{ at: string; value: number }> = []
  const start = parseMyt(from)
  const end = parseMyt(to)
  for (let t = start; t <= end; t += 5 * 60_000) {
    const myt = new Date(t + 8 * 3_600_000).toISOString().slice(0, 19)
    rows.push({ at: myt, value: sixtyMinuteTotalAt(capture, myt) })
  }
  return rows
}

/** The four totals the acceptance criteria name. */
export function acceptanceTotals(capture: Capture) {
  return {
    at1455: sixtyMinuteTotalAt(capture, '2026-11-02T14:55:00'),
    at1500: sixtyMinuteTotalAt(capture, '2026-11-02T15:00:00'),
    at1535: sixtyMinuteTotalAt(capture, '2026-11-02T15:35:00'),
    at1600: sixtyMinuteTotalAt(capture, '2026-11-02T16:00:00')
  }
}
