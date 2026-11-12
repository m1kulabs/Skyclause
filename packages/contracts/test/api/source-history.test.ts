import { expect, test } from 'vitest'
import { Instant } from '../../src/api/shared'
import { listSourcePolls, listSourceReadings } from '../../src/api/v1/sources'

const from = '2026-11-01T00:00:00.000001Z'
const to = '2026-11-01T00:00:00.000002Z'

for (const operation of [listSourceReadings, listSourcePolls]) {
  const query = operation.request.query
  test(`${operation.operationId} retains exact microsecond range and pagination`, () => {
    expect(query.parse({ from, to, cursor: 'position' })).toEqual({ from, to, cursor: 'position', limit: 50 })
    for (const instant of [
      '0001-01-01T00:00:00Z',
      '2026-11-01T00:00:00Z',
      '2026-11-01T00:00:00.1Z',
      '2026-11-01T00:00:00.12Z',
      '2026-11-01T00:00:00.123Z',
      '2026-11-01T00:00:00.1234Z',
      '2026-11-01T00:00:00.12345Z',
      '2026-11-01T00:00:00.123456Z'
    ])
      expect(query.parse({ from: instant })).toMatchObject({ from: instant })
    for (const limit of [1, 200]) expect(query.parse({ limit }).limit).toBe(limit)
    for (const limit of [0, 201, 1.5]) expect(query.safeParse({ limit }).success).toBe(false)
  })

  test(`${operation.operationId} reports invalid instants and ranges at their query fields`, () => {
    for (const field of ['from', 'to']) {
      expect(query.parse({ [field]: '0001-01-01T00:00:00Z' })).toMatchObject({
        [field]: '0001-01-01T00:00:00Z'
      })
      for (const value of [
        '0000-01-01T00:00:00Z',
        'bad',
        '2026-11-01T00:00:00+08:00',
        '2026-11-01T00:00:00+00:00',
        '2026-11-01T00:00Z',
        '2026-11-31T00:00:00Z',
        '2026-11-01T00:00:00.1234567Z'
      ]) {
        const result = query.safeParse({ [field]: value })
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error.issues[0]?.path).toEqual([field])
      }
    }
    for (const bounds of [
      { from, to: from },
      { from: '2026-11-01T00:00:00.1Z', to: '2026-11-01T00:00:00.100000Z' },
      { from: to, to: from },
      { from: '2026-11-01T00:00:00Z', to: '2026-11-01T00:00:00.000000Z' }
    ]) {
      const result = query.safeParse(bounds)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.issues[0]?.path).toEqual(['to'])
    }
    expect(query.parse({ from })).toMatchObject({ from })
    expect(query.parse({ to })).toMatchObject({ to })
    expect(query.parse({ from: '2025-01-01T00:00:00Z', to })).toMatchObject({ from: '2025-01-01T00:00:00Z', to })
  })
}

test('poll history retains supported outcomes and rejects supplied unsupported outcomes', () => {
  const query = listSourcePolls.request.query
  for (const outcome of ['ok', 'unchanged', 'error']) expect(query.parse({ outcome })).toMatchObject({ outcome })
  for (const outcome of ['', 'failed', 'ERROR']) {
    const result = query.safeParse({ outcome })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['outcome'])
  }
})

test('poll history preserves optional nullable diagnostics while base poll and reading remain compatible', () => {
  const poll = {
    id: 'poll',
    source_id: 'source',
    started_at: from,
    http_status: null,
    latency_ms: 10,
    outcome: 'legacy',
    request_id: 'request',
    error_code: null
  }
  const schema = listSourcePolls.responses[200].content['application/json'].schema
  for (const diagnostics of [
    {},
    { message: null, purpose: 'apims_backfill', received_at: null },
    { message: ' exact\nmessage ', purpose: 'poll', received_at: to }
  ]) {
    const page = { data: [{ ...poll, ...diagnostics }], next_cursor: null }
    expect(schema.parse(page)).toEqual(page)
  }
  const page = {
    data: [
      {
        id: 'reading',
        source_id: 'source',
        poll_id: null,
        metric: 'forecast',
        unit: null,
        observed_at: from,
        received_at: to,
        value: null,
        value_text: null,
        value_json: { Original_Key: [null, { nestedKey: 'value' }] },
        device_time: null,
        item_key: null,
        revision: '2'
      }
    ],
    next_cursor: null
  }
  expect(listSourceReadings.responses[200].content['application/json'].schema.parse(page)).toEqual(page)
})

test('shared Instant retains year-zero compatibility', () => {
  for (const instant of ['0000-01-01T00:00:00Z', '0001-01-01T00:00:00Z', from, to])
    expect(Instant.parse(instant)).toBe(instant)
})
