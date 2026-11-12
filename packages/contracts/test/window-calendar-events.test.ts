import { describe, expect, test } from 'vitest'
import { DOMAIN_EVENT_SCHEMAS, DomainEventSchema } from '../src/events'

const firstWindowId = '0192a111-2222-7222-8222-00000000000a'
const secondWindowId = '0192a111-2222-7222-8222-00000000000b'
const feedId = '0192a111-2222-7222-8222-111111111111'
const revision = '0192a111-2222-7222-8222-222222222222'
const calendar = { feed_id: feedId, revision, window_ids: [firstWindowId, secondWindowId] }

describe.each(['window.created', 'window.updated', 'window.cancelled'] as const)('%s calendar metadata', (type) => {
  const event = (data: Record<string, unknown> = {}) => ({
    id: '0192a111-2222-7222-8222-333333333333',
    type,
    created_at: '2026-11-13T00:00:00Z',
    org_id: '0192a111-2222-7222-8222-444444444444',
    project_id: '0192a111-2222-7222-8222-555555555555',
    data: { window_id: firstWindowId, via: 'ics', times_changed: true, series_id: null, ...data }
  })

  test('preserves the representative complete changed set through canonical parsing', () => {
    const input = event({ calendar })
    expect(DOMAIN_EVENT_SCHEMAS[type].parse(input).data).toEqual(input.data)
    expect(DomainEventSchema.parse(input).data).toEqual(input.data)
  })

  test('preserves peer metadata without a changed set', () => {
    const input = event({ window_id: secondWindowId, calendar: { feed_id: feedId, revision } })
    expect(DOMAIN_EVENT_SCHEMAS[type].parse(input).data).toEqual(input.data)
    expect(DomainEventSchema.parse(input).data).toEqual(input.data)
  })

  test('normalizes calendar UUIDs and compares the representative case insensitively', () => {
    const input = event({
      window_id: firstWindowId.toUpperCase(),
      calendar: {
        feed_id: feedId.toUpperCase(),
        revision: revision.toUpperCase(),
        window_ids: [firstWindowId.toUpperCase(), secondWindowId]
      }
    })
    expect(DOMAIN_EVENT_SCHEMAS[type].parse(input).data).toEqual({ ...input.data, calendar })
    expect(DomainEventSchema.parse(input).data).toEqual({ ...input.data, calendar })
  })

  test.each(['form', 'ics'] as const)('keeps ordinary %s events and existing unknown-key stripping', (via) => {
    const input = event({ via })
    const withUnknownKeys = { ...input, extra: true, data: { ...input.data, extra: true } }
    expect(DOMAIN_EVENT_SCHEMAS[type].parse(withUnknownKeys)).toEqual(input)
    expect(DomainEventSchema.parse(withUnknownKeys)).toEqual(input)
  })

  test.each([
    ['missing feed ID', { revision }],
    ['malformed feed ID', { ...calendar, feed_id: 'feed' }],
    ['missing revision', { feed_id: feedId }],
    ['mutable ETag revision', { ...calendar, revision: '"etag-123"' }],
    ['non-v7 revision', { ...calendar, revision: '550e8400-e29b-41d4-a716-446655440000' }],
    ['malformed window ID', { ...calendar, window_ids: [firstWindowId, 'window'] }],
    ['non-v7 window ID', { ...calendar, window_ids: ['550e8400-e29b-41d4-a716-446655440000'] }],
    ['empty changed set', { ...calendar, window_ids: [] }],
    ['duplicate window IDs', { ...calendar, window_ids: [firstWindowId, firstWindowId] }],
    ['case-variant duplicate IDs', { ...calendar, window_ids: [firstWindowId, firstWindowId.toUpperCase()] }],
    ['unsorted changed set', { ...calendar, window_ids: [secondWindowId, firstWindowId] }],
    ['unapproved source metadata', { ...calendar, source_uid: 'private-source-identity' }],
    ['null calendar', null]
  ])('rejects %s', (_, invalidCalendar) => {
    const input = event({ calendar: invalidCalendar })
    expect(DOMAIN_EVENT_SCHEMAS[type].safeParse(input).success).toBe(false)
    expect(DomainEventSchema.safeParse(input).success).toBe(false)
  })

  test('rejects a complete set carried by a nonrepresentative window', () => {
    const input = event({ window_id: secondWindowId, calendar })
    expect(DOMAIN_EVENT_SCHEMAS[type].safeParse(input).success).toBe(false)
    expect(DomainEventSchema.safeParse(input).success).toBe(false)
  })

  test.each([
    [20_000, true],
    [20_001, false]
  ])('validates the batch size boundary at %i changed IDs', (count, accepted) => {
    const windowIds = Array.from(
      { length: count },
      (_, index) => `0192a111-2222-7222-8222-${index.toString(16).padStart(12, '0')}`
    )
    const input = event({
      window_id: windowIds[0],
      calendar: { feed_id: feedId, revision, window_ids: windowIds }
    })
    expect(DOMAIN_EVENT_SCHEMAS[type].safeParse(input).success).toBe(accepted)
    expect(DomainEventSchema.safeParse(input).success).toBe(accepted)
    if (accepted) {
      expect(DOMAIN_EVENT_SCHEMAS[type].parse(input).data).toHaveProperty('calendar.window_ids.length', 20_000)
      expect(DomainEventSchema.parse(input).data).toHaveProperty('calendar.window_ids.length', 20_000)
    }
  })
})
