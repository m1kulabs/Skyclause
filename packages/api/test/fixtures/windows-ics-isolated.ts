import { readFileSync } from 'node:fs'
import { CalendarParseError, parseCalendar } from '../../src/services/windows/parse-ics'

const input = JSON.parse(readFileSync(0, 'utf8')) as { text: string }
try {
  const result = await parseCalendar(input.text, {
    projectTz: 'UTC',
    kind: 'event',
    now: new Date('2026-11-13T00:00:00Z'),
    through: new Date('2027-02-11T00:00:00Z'),
    resolveLocalSpan: async (span) => ({
      startsAt: new Date(`${span.date}T${span.start}Z`),
      endsAt: new Date(Date.parse(`${span.date}T${span.end}Z`) + span.endDayOffset * 86400000)
    })
  })
  process.stdout.write(
    JSON.stringify({
      occurrences: result.occurrences.length,
      skipped: result.skipped.length,
      protected: result.protectedIdentities.length
    })
  )
} catch (error) {
  if (!(error instanceof CalendarParseError)) throw error
  process.stdout.write(JSON.stringify({ error: true, issues: error.issues }))
}
