import type { Row } from './schema.ts'

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

// SIG-1: every reading stores source time, receipt time, HTTP status and fetch latency.
// Readings writers refuse a row for which this returns any problem.
export function validateReading(row: Row<'readings'>): string[] {
  const problems: string[] = []
  for (const field of ['observed_at', 'received_at'] as const) {
    const value = row[field]
    if (value === undefined || value === '') problems.push(`${field} is missing`)
    else if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value) || Number.isNaN(Date.parse(value)))
      problems.push(`${field} must be ISO 8601 with an explicit offset`)
  }
  const status = row.http_status
  if (status === undefined || status === '') problems.push('http_status is missing')
  else if (typeof status !== 'number' || !Number.isInteger(status) || status < 0 || status > 599)
    problems.push('http_status must be an integer from 0 to 599')
  const latency = row.latency_ms
  if (latency === undefined || latency === '') problems.push('latency_ms is missing')
  else if (typeof latency !== 'number' || !Number.isFinite(latency) || latency < 0)
    problems.push('latency_ms must be a number of 0 or more')
  return problems
}
