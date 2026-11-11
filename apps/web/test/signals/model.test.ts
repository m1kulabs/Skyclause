import { expect, test } from 'vitest'
import {
  ageAt,
  errorsWithinLastDay,
  findingLine,
  markEventSeen,
  orderSources,
  tailCommand,
  withGaps,
  wilsonInterval
} from '../../features/signals/model'

const now = Date.parse('2026-11-05T13:12:00Z')

test('source rows sort worst state first, then oldest age within a state', () => {
  const ordered = orderSources([
    { id: 'fresh', external_id: 'FRESH', state: { state: 'fresh' }, age_s: 60 },
    { id: 'error-new', external_id: 'ERR2', state: { state: 'error' }, age_s: 100 },
    { id: 'stale', external_id: 'STALE', state: { state: 'stale' }, age_s: 900 },
    { id: 'error-old', external_id: 'ERR1', state: { state: 'error' }, age_s: 600 },
    { id: 'pending', external_id: 'PENDING', state: { state: 'pending' }, age_s: null },
    { id: 'recovered', external_id: 'RECOVERED', state: { state: 'recovered' }, age_s: 120 },
    { id: 'probation', external_id: 'PROBATION', state: { state: 'probation' }, age_s: 50 },
    { id: 'off-hours', external_id: 'OFF', state: { state: 'off_hours' }, age_s: null }
  ])

  expect(ordered.map((source) => source.id)).toEqual([
    'error-old',
    'error-new',
    'stale',
    'pending',
    'recovered',
    'probation',
    'off-hours',
    'fresh'
  ])
})

test('the finding reports five inputs and the oldest age in minutes', () => {
  const sources = [720, 710, 660, 600, 300].map((age_s, index) => ({
    state: { state: 'fresh' as const },
    age_s,
    external_id: `SOURCE-${index}`
  }))

  expect(findingLine(sources, 'en')).toBe('Sky: 5 inputs reporting; oldest 12 min')
})

test('only HTTP errors from the last 24 hours remain in the error list', () => {
  const polls = [
    {
      id: 'three-hours',
      source_id: 'source-a',
      started_at: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
      http_status: 503,
      latency_ms: 900,
      outcome: 'error',
      request_id: 'request-three-hours',
      error_code: 'upstream_unavailable'
    },
    {
      id: 'twenty-five-hours',
      source_id: 'source-a',
      started_at: new Date(now - 25 * 60 * 60 * 1000).toISOString(),
      http_status: 502,
      latency_ms: 900,
      outcome: 'error',
      request_id: 'request-twenty-five-hours',
      error_code: 'upstream_unavailable'
    }
  ]

  expect(errorsWithinLastDay(polls, now).map((poll) => [poll.id, poll.http_status])).toEqual([['three-hours', 503]])
})

test('source ages advance from the read time without another API response', () => {
  expect(ageAt(720, now, now + 60_000)).toBe(780)
})

test('a repeated SSE event id can only be announced once', () => {
  const seen = new Set<string>()
  expect(markEventSeen(seen, 'event-1')).toBe(true)
  expect(markEventSeen(seen, 'event-1')).toBe(false)
})

test('chart series inserts nulls for missing intervals instead of connecting across gaps', () => {
  const points = withGaps(
    [
      { at: '2026-11-05T10:00:00Z', value: 67 },
      { at: '2026-11-05T13:00:00Z', value: 57 }
    ],
    60 * 60
  )

  expect(points).toEqual([
    { at: '2026-11-05T10:00:00Z', value: 67 },
    { at: '2026-11-05T11:00:00.000Z', value: null },
    { at: '2026-11-05T12:00:00.000Z', value: null },
    { at: '2026-11-05T13:00:00Z', value: 57 }
  ])
})

test('camera agreement shows no interval at n=0 and a Wilson interval when n is positive', () => {
  expect(wilsonInterval(0, 0)).toBeNull()
  expect(wilsonInterval(18, 20)).toEqual({ low: 0.699, high: 0.972 })
})

test('the project tail command follows the CLI-4 path', () => {
  expect(tailCommand('sky', 'bukit-jalil')).toBe('skyclause signals tail sky/bukit-jalil')
})
