// Tests for the `pi_rows` handler (#68): the sources default row, the polls and
// readings writes, duplicates and the error post. Sheets are a fake; SIG-1
// coverage is asserted on the rows the handler builds.
import { describe, expect, test } from 'bun:test'
import { handlePiRows, PI_ROWS_KIND, rapidrailSourceRow, type PiRowsBody, type PiRowsStore } from './pi-rows.ts'
import type { PostBody } from '../../shared/device-post.ts'
import { validateReading } from './readings.ts'
import type { Row } from './schema.ts'

const NOW = new Date('2026-11-06T22:56:45+08:00')

function note(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    runner: 'actions',
    device_time: '2026-11-06T22:56:45+08:00',
    posted_at: '2026-11-06T22:56:50+08:00',
    header_age_s: 6863,
    data_as_of: '2026-11-05 23:59',
    ...overrides
  })
}

function okPost(rows: { date: string; value: number; revision?: number }[]): PiRowsBody {
  return {
    kind: PI_ROWS_KIND,
    device_id: 'actions',
    rows: rows.map((row) => ({
      kind: 'sp17_exits' as const,
      observed_at: `${row.date}T00:00:00+08:00`,
      value: row.value,
      revision: row.revision ?? 1,
      note: note()
    })),
    poll: {
      poll_id: 'test-poll-1',
      started_at: '2026-11-06T22:56:40+08:00',
      received_at: '2026-11-06T22:56:50+08:00',
      http_status: 200,
      latency_ms: 6863,
      outcome: 'ok'
    }
  }
}

function errorPost(): PiRowsBody {
  return {
    kind: PI_ROWS_KIND,
    device_id: 'actions',
    rows: [{ kind: 'error', observed_at: '2026-11-06T22:56:45+08:00', note: note() }],
    poll: {
      poll_id: 'test-poll-2',
      started_at: '2026-11-06T22:56:40+08:00',
      received_at: '2026-11-06T22:56:50+08:00',
      http_status: 200,
      latency_ms: 6863,
      outcome: 'error',
      error: 'column "destination" is missing or renamed'
    }
  }
}

function fakeStore(): PiRowsStore & {
  sources: Row<'sources'>[]
  polls: Row<'polls'>[]
  readings: Row<'readings'>[]
} {
  const sources: Row<'sources'>[] = []
  const polls: Row<'polls'>[] = []
  const readings: Row<'readings'>[] = []
  return {
    sources,
    polls,
    readings,
    sourceRow: (sourceId) => sources.find((row) => row.source_id === sourceId) ?? null,
    appendSource: (row) => void sources.push(row),
    storedReadings: () =>
      readings.map((row) => ({
        reading_id: row.reading_id ?? '',
        observed_at: row.observed_at ?? '',
        value: row.value ?? '',
        revision: row.revision ?? ''
      })),
    appendPoll: (row) => void polls.push(row),
    appendReadings: (rows) => void readings.push(...rows)
  }
}

describe('handlePiRows', () => {
  test('stores the rapidrail_od sources default row on the first post', () => {
    const store = fakeStore()
    expect(handlePiRows(okPost([{ date: '2026-11-04', value: 33804 }]), store, NOW)).toEqual({
      ok: true,
      duplicate: false
    })
    expect(store.sources).toEqual([rapidrailSourceRow(NOW)])
    expect(store.sources[0]).toMatchObject({ source_id: 'SP17', stale_after_min: 2880, cadence_min: 1440 })
  })

  test('leaves an existing sources row alone', () => {
    const store = fakeStore()
    const existing = { ...rapidrailSourceRow(NOW), state: 'stale' } as Row<'sources'>
    store.sources.push(existing)
    handlePiRows(okPost([{ date: '2026-11-04', value: 33804 }]), store, NOW)
    expect(store.sources).toEqual([existing])
  })

  test('an ok post appends one polls row and one readings row per night', () => {
    const store = fakeStore()
    const result = handlePiRows(
      okPost([
        { date: '2026-11-03', value: 4944 },
        { date: '2026-11-04', value: 33804 }
      ]),
      store,
      NOW
    )
    expect(result).toEqual({ ok: true, duplicate: false })
    expect(store.polls).toHaveLength(1)
    expect(store.polls[0]).toMatchObject({
      poll_id: 'test-poll-1',
      source_kind: 'rapidrail_od',
      source_id: 'SP17',
      outcome: 'ok',
      new_rows: 2,
      error: ''
    })
    expect(store.readings).toHaveLength(2)
    expect(store.readings[0]).toMatchObject({
      reading_id: 'SP17:sp17_exits:2026-11-03',
      source_kind: 'rapidrail_od',
      source_id: 'SP17',
      metric: 'sp17_exits',
      observed_at: '2026-11-03T00:00:00+08:00',
      received_at: '2026-11-06T22:56:50+08:00',
      value: 4944,
      unit: 'exits',
      http_status: 200,
      latency_ms: 6863,
      poll_id: 'test-poll-1',
      revision: 1
    })
    expect(JSON.parse(String(store.readings[0]?.note))).toMatchObject({ runner: 'actions' })
  })

  test('every appended row passes the shared validator (SIG-1)', () => {
    const store = fakeStore()
    handlePiRows(okPost([{ date: '2026-11-04', value: 33804 }]), store, NOW)
    handlePiRows(errorPost(), store, NOW)
    for (const row of store.readings) expect(validateReading(row)).toEqual([])
  })

  test('posting the same rows twice returns duplicate: true and adds nothing', () => {
    const store = fakeStore()
    const post = okPost([{ date: '2026-11-04', value: 33804 }])
    expect(handlePiRows(post, store, NOW)).toEqual({ ok: true, duplicate: false })
    const counts = { polls: store.polls.length, readings: store.readings.length }
    expect(handlePiRows(post, store, NOW)).toEqual({ ok: true, duplicate: true })
    expect({ polls: store.polls.length, readings: store.readings.length }).toEqual(counts)
  })

  test('a revised count appends at the new revision', () => {
    const store = fakeStore()
    handlePiRows(okPost([{ date: '2026-11-04', value: 33000 }]), store, NOW)
    expect(handlePiRows(okPost([{ date: '2026-11-04', value: 33804, revision: 2 }]), store, NOW)).toEqual({
      ok: true,
      duplicate: false
    })
    expect(store.readings.filter((row) => row.observed_at === '2026-11-04T00:00:00+08:00')).toHaveLength(2)
    expect(store.polls).toHaveLength(2)
  })

  test('a schema change posts one error row and no sp17_exits row, with an error poll', () => {
    const store = fakeStore()
    expect(handlePiRows(errorPost(), store, NOW)).toEqual({ ok: true, duplicate: false })
    expect(store.polls).toHaveLength(1)
    expect(store.polls[0]).toMatchObject({ outcome: 'error', error: 'column "destination" is missing or renamed' })
    expect(store.readings).toHaveLength(1)
    expect(store.readings[0]).toMatchObject({ metric: 'error', source_id: 'SP17', value: 0 })
    expect(store.readings.some((row) => row.metric === 'sp17_exits')).toBe(false)
  })

  const bad: [string, (post: PiRowsBody) => PostBody][] = [
    ['an empty device_id', (post) => ({ ...post, device_id: '' })],
    ['no rows', (post) => ({ ...post, rows: [] })],
    [
      'more than 200 rows',
      (post) => ({
        ...post,
        rows: Array.from({ length: 201 }, () => post.rows[0] as (typeof post.rows)[number])
      })
    ],
    ['mixed row kinds', (post) => ({ ...post, rows: [...post.rows, ...(errorPost().rows as never[])] })],
    ['an unknown row kind', (post) => ({ ...post, rows: [{ ...(post.rows[0] as object), kind: 'heartbeat' }] })],
    ['a bad observed_at', (post) => ({ ...post, rows: [{ ...(post.rows[0] as object), observed_at: '2026-11-04' }] })],
    ['a bad note', (post) => ({ ...post, rows: [{ ...(post.rows[0] as object), note: '{}' }] })],
    ['a negative value', (post) => ({ ...post, rows: [{ ...(post.rows[0] as object), value: -1 }] })],
    ['a zero revision', (post) => ({ ...post, rows: [{ ...(post.rows[0] as object), revision: 0 }] })],
    [
      'an ok poll on an error row',
      (post) => ({ ...errorPost(), poll: { ...errorPost().poll, outcome: 'ok' as const } })
    ],
    [
      'an error poll on exits rows',
      (post) => ({ ...post, poll: { ...post.poll, outcome: 'error' as const, error: 'x' } })
    ],
    ['an error post without its text', (post) => ({ ...errorPost(), poll: { ...errorPost().poll, error: '' } })],
    ['two error rows', () => ({ ...errorPost(), rows: [...errorPost().rows, ...errorPost().rows] })]
  ]
  for (const [name, spoil] of bad) {
    test(`rejects ${name}, writing nothing`, () => {
      const store = fakeStore()
      expect(handlePiRows(spoil(okPost([{ date: '2026-11-04', value: 33804 }])), store, NOW)).toEqual({
        ok: false,
        error: expect.any(String)
      })
      expect(store.sources).toEqual([])
      expect(store.polls).toEqual([])
      expect(store.readings).toEqual([])
    })
  }
})
