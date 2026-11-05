import { describe, expect, test } from 'bun:test'
import { validateReading } from './readings.ts'
import type { Row } from './schema.ts'

// The 2 November 15:00 JPS reading as #51 stores it from the 5 November capture.
const reading: Row<'readings'> = {
  reading_id: '0232901RF:rain_5m_mm:2026-11-02T15:00:00+08:00',
  source_kind: 'jps_rain',
  source_id: '0232901RF',
  metric: 'rain_5m_mm',
  observed_at: '2026-11-02T15:00:00+08:00',
  received_at: '2026-11-05T21:12:41+08:00',
  value: 9.5,
  unit: 'mm',
  http_status: 200,
  latency_ms: 812,
  poll_id: '019a5470-3a40-7000-8000-000000000001',
  revision: 1
}

describe('validateReading (SIG-1)', () => {
  test('accepts a row with source time, receipt time, HTTP status and latency', () => {
    expect(validateReading(reading)).toEqual([])
  })

  for (const field of ['observed_at', 'received_at', 'http_status', 'latency_ms'] as const) {
    test(`refuses a row missing ${field}`, () => {
      const { [field]: _dropped, ...rest } = reading
      expect(validateReading(rest)).toEqual([`${field} is missing`])
    })

    test(`refuses a row with a blank ${field}`, () => {
      expect(validateReading({ ...reading, [field]: '' })).toEqual([`${field} is missing`])
    })
  }

  test('refuses a time without an explicit offset, as JPS sends it', () => {
    expect(validateReading({ ...reading, observed_at: '2026-11-02T15:00:00' })).toEqual([
      'observed_at must be ISO 8601 with an explicit offset'
    ])
  })

  test('refuses a status that is not an HTTP status code', () => {
    expect(validateReading({ ...reading, http_status: 200.5 })).toEqual([
      'http_status must be an integer from 0 to 599'
    ])
    expect(validateReading({ ...reading, http_status: '200' })).toEqual([
      'http_status must be an integer from 0 to 599'
    ])
  })

  test('refuses a negative or non-numeric latency', () => {
    expect(validateReading({ ...reading, latency_ms: -1 })).toEqual(['latency_ms must be a number of 0 or more'])
    expect(validateReading({ ...reading, latency_ms: Number.NaN })).toEqual([
      'latency_ms must be a number of 0 or more'
    ])
  })

  test('lists every problem at once', () => {
    expect(validateReading({ reading_id: reading.reading_id })).toEqual([
      'observed_at is missing',
      'received_at is missing',
      'http_status is missing',
      'latency_ms is missing'
    ])
  })
})
