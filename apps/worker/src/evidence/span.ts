import type { TxHandle } from '@skyclause/contracts'
import { zonedSpan } from '@skyclause/db'

// #159 ticket decision: an emailed request's first line names a span, "evidence for 2 Nov 14:00–16:30", with an English
// month (a year is optional) and times in the project's zone. Anything else, run requests included ("call for
// tomorrow", pilot-only under CAL-1), names none.

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
]
const LINE =
  /^evidence for (\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?,? (\d{1,2})[:.](\d{2}) ?(?:[-–—]|to) ?(\d{1,2})[:.](\d{2})\.?$/i

/** The local date and times a request line names, or null. */
export function parseEvidenceLine(line: string) {
  const match = LINE.exec(line.trim().replace(/\s+/g, ' '))
  if (!match) return null
  const [day, monthName, year, startH, startM, endH, endM] = match.slice(1)
  const month = MONTHS.findIndex((name) => name.startsWith(monthName!.toLowerCase())) + 1
  const start = [Number(startH), Number(startM)] as const
  const end = [Number(endH), Number(endM)] as const
  if (!month || Number(day) < 1 || [start[0], end[0]].some((h) => h > 23) || [start[1], end[1]].some((m) => m > 59)) {
    return null
  }
  if (end[0] * 60 + end[1] <= start[0] * 60 + start[1]) return null
  return { day: Number(day), month, year: year ? Number(year) : null, start, end }
}

/**
 * The span a request line names in `timeZone`, or null. Without a year, the latest such date not after the mail was
 * received; a day the month lacks (31 Nov) names none.
 */
export async function evidenceSpanOf(tx: TxHandle, line: string, o: { receivedAt: Date; timeZone: string }) {
  const named = parseEvidenceLine(line)
  return named ? zonedSpan(tx, { ...named, timeZone: o.timeZone, notAfter: o.receivedAt }) : null
}
