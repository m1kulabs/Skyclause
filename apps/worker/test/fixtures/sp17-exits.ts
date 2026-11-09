// Committed generator (#79 §7): daily exits at SP17 Bukit Jalil from the 2026 Rapid Rail capture, the sum over every
// origin's row except the `A0: All Stations` total (docs/sources/storage.data.gov.my/rapidrail-od.md).
import { readFileSync } from 'node:fs'

const CAPTURE = 'rapidrail-sp17-extract-20261106T1456Z.json'
const DESTINATION = 'SP17: Bukit Jalil'
const TOTAL = 'A0: All Stations'

interface Row {
  origin: string
  destination: string
  date: string
  ridership: number
}

/** Exits by date (`YYYY-MM-DD`) for the days the capture holds. */
export function sp17Exits(): Map<string, number> {
  const rows = JSON.parse(readFileSync(new URL(CAPTURE, import.meta.url), 'utf8')) as Row[]
  const exits = new Map<string, number>()
  for (const row of rows) {
    if (row.destination !== DESTINATION || row.origin === TOTAL) continue
    exits.set(row.date, (exits.get(row.date) ?? 0) + row.ridership)
  }
  return exits
}
