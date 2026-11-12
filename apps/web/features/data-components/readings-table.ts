import type { StripReading, StripSixty } from '@skyclause/elements'

export interface ReadingRow {
  at: string
  rain5: number | null
  rain60: number | null
}

export interface ReadingRows {
  rows: ReadingRow[]
  /** Set when the rows are the highest reading in each stretch of this many minutes, not every reading. */
  bucketMinutes: number | null
}

/** The most rows the table renders: the crawl allows 50 per list. */
export const MAX_READING_ROWS = 48

const MINUTE = 60_000
// The strip's clock is Malaysia time (UTC+8), so stretches start on its whole hours.
const MYT_OFFSET = 8 * 60 * MINUTE
const BUCKET_MINUTES = [15, 30, 60, 120, 180, 360, 720, 1440]

function byTime(rain5: readonly StripReading[], rain60: readonly StripSixty[]): Map<number, ReadingRow> {
  const rows = new Map<number, ReadingRow>()
  const row = (at: string): ReadingRow => {
    const key = Date.parse(at)
    const found = rows.get(key)
    if (found) return found
    const created = { at, rain5: null, rain60: null }
    rows.set(key, created)
    return created
  }
  for (const point of rain5) row(point.at).rain5 = point.value
  for (const point of rain60) row(point.at).rain60 = point.value
  return rows
}

const higher = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b))

/**
 * The table's rows from both series, by time. A day of readings every five minutes is 288 rows per series; past
 * `maxRows` the table reports the highest reading of each series in each stretch (the smallest of 15 minutes up to a
 * day that fits), so the table stays short and keeps the peaks the chart shows.
 */
export function readingRows(
  rain5: readonly StripReading[],
  rain60: readonly StripSixty[],
  maxRows = MAX_READING_ROWS
): ReadingRows {
  const all = [...byTime(rain5, rain60)].sort(([a], [b]) => a - b)
  if (all.length <= maxRows) return { rows: all.map(([, row]) => row), bucketMinutes: null }
  const bucketStart = (key: number, minutes: number) =>
    Math.floor((key + MYT_OFFSET) / (minutes * MINUTE)) * minutes * MINUTE - MYT_OFFSET
  const minutes =
    BUCKET_MINUTES.find((candidate) => new Set(all.map(([key]) => bucketStart(key, candidate))).size <= maxRows) ??
    BUCKET_MINUTES.at(-1)!
  const buckets = new Map<number, ReadingRow>()
  for (const [key, row] of all) {
    const start = bucketStart(key, minutes)
    const bucket = buckets.get(start) ?? { at: new Date(start).toISOString(), rain5: null, rain60: null }
    bucket.rain5 = higher(bucket.rain5, row.rain5)
    bucket.rain60 = higher(bucket.rain60, row.rain60)
    buckets.set(start, bucket)
  }
  return { rows: [...buckets.values()].slice(-maxRows), bucketMinutes: minutes }
}
