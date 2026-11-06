// Tests for the fallback runner (#68): pending, posting, revisions, the schema
// error post, duplicates and the backfill. Network and sheets are fakes; the
// reduce underneath runs on the real capture extract.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { METADATA_URL, runBackfill, runOnce, type FetchResult, type RunDeps, type RunOptions } from './ridership-run.ts'
import { blankState, type PiRowsPost, type RidershipState } from './ridership.ts'

const fixtures = join(import.meta.dir, '..', 'fixtures')
const extract = JSON.parse(
  readFileSync(join(fixtures, 'rapidrail-sp17-extract-20261106T1456Z.json'), 'utf8')
) as Record<string, unknown>[]
const capturedMetadata = JSON.parse(
  readFileSync(join(fixtures, 'ridership-od-rapidrail-daily-20261106T1456Z.json'), 'utf8')
) as Record<string, unknown>

const metadataWith = (overrides: Record<string, unknown>): string =>
  JSON.stringify({ ...capturedMetadata, ...overrides })

const LAST_MODIFIED = 'Thu, 06 Nov 2026 08:05:37 GMT'

interface FakeFetch {
  calls: string[]
  metadata: string
  lastModified: string
  status: number
}

function fakeFetch(fake: FakeFetch): RunDeps['fetchFn'] {
  return async (url: string): Promise<FetchResult> => {
    fake.calls.push(url)
    const isMetadata = url === METADATA_URL
    return {
      status: fake.status,
      text: async () => (isMetadata ? fake.metadata : ''),
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: { get: (name: string) => (name === 'last-modified' && !isMetadata ? fake.lastModified : null) }
    }
  }
}

function harness(args: {
  metadata?: string
  records?: Record<string, unknown>[] | { schemaError: string }
  recordQueue?: (Record<string, unknown>[] | { schemaError: string })[]
  state?: RidershipState
  reply?: unknown
  replyQueue?: unknown[]
  nowMs?: number
}): {
  deps: RunDeps
  options: RunOptions
  logs: string[]
  summaries: string[]
  posts: PiRowsPost[]
  saved: RidershipState[]
} {
  const logs: string[] = []
  const summaries: string[] = []
  const posts: PiRowsPost[] = []
  const saved: RidershipState[] = []
  let state = args.state ?? blankState()
  const replies = args.replyQueue ? [...args.replyQueue] : args.reply !== undefined ? [args.reply] : []
  const queue = args.recordQueue ? [...args.recordQueue] : []
  let ids = 0
  const deps: RunDeps = {
    fetchFn: fakeFetch({
      calls: [],
      metadata: args.metadata ?? JSON.stringify(capturedMetadata),
      lastModified: LAST_MODIFIED,
      status: 200
    }),
    readParquet: async () => {
      if (queue.length > 0) {
        const next = queue.shift()
        return next !== null && typeof next === 'object' && 'schemaError' in next
          ? (next as { schemaError: string })
          : { records: next as Record<string, unknown>[] }
      }
      const records = args.records ?? extract
      return records !== null && typeof records === 'object' && 'schemaError' in records
        ? (records as { schemaError: string })
        : { records: records as Record<string, unknown>[] }
    },
    postFn: async (_url, _token, body) => {
      posts.push(body)
      return replies.length > 0 ? replies.shift() : { ok: true, duplicate: false }
    },
    loadState: () => state,
    saveState: (next) => {
      state = next
      saved.push(next)
    },
    randomId: () => `test-poll-${++ids}`,
    nowMs: () => args.nowMs ?? Date.parse('2026-11-06T10:00:00Z'),
    log: (line) => void logs.push(line),
    summary: (line) => void summaries.push(line)
  }
  const options: RunOptions = {
    runner: 'actions',
    deviceId: 'actions',
    ingestUrl: 'https://script.google.com/macros/s/test/exec',
    token: 'test-token',
    backfill: false,
    start: '2023-01-01',
    end: null
  }
  return { deps, options, logs, summaries, posts, saved }
}

describe('runOnce on a late file', () => {
  test('night 5 November posts nothing and logs pending until 22:00 on the captured metadata', async () => {
    // 13:00 MYT on 7 November: yesterday (6 November) is newer than the
    // captured `data_as_of` 5 November, and `next_update` is 22:00.
    const { deps, options, logs, summaries, posts, saved } = harness({ nowMs: Date.parse('2026-11-07T05:00:00Z') })
    await runOnce(deps, options)
    expect(logs).toEqual(['pending until 22:00'])
    expect(summaries).toEqual(['pending until 22:00'])
    expect(posts).toEqual([])
    expect(saved).toEqual([])
  })
})

describe('runOnce on a current file', () => {
  test('posts the newest nights with the ticket note and remembers data_as_of', async () => {
    const { deps, options, logs, posts, saved } = harness({})
    await runOnce(deps, options)
    expect(posts).toHaveLength(1)
    const post = posts[0]
    if (!post) throw new Error('no post')
    expect(post.kind).toBe('pi_rows')
    expect(post.device_id).toBe('actions')
    expect(post.rows.map((row) => (row as { observed_at: string }).observed_at)).toEqual([
      '2026-01-10T00:00:00+08:00',
      '2026-11-01T00:00:00+08:00',
      '2026-11-02T00:00:00+08:00',
      '2026-11-03T00:00:00+08:00',
      '2026-11-04T00:00:00+08:00'
    ])
    expect(post.rows.every((row) => row.kind === 'sp17_exits' && (row as { revision: number }).revision === 1)).toBe(
      true
    )
    expect(post.poll).toMatchObject({ poll_id: 'test-poll-1', http_status: 200, outcome: 'ok' })
    const note = JSON.parse((post.rows[0] as { note: string }).note) as Record<string, unknown>
    expect(note).toMatchObject({ runner: 'actions', header_age_s: 6863, data_as_of: '2026-11-05 23:59' })
    expect(saved).toHaveLength(1)
    expect(saved[0]?.data_as_of).toBe('2026-11-05 23:59')
    expect(saved[0]?.nights['2026-11-04']).toEqual({ value: 33804, revision: 1 })
    expect(logs.some((line) => line.startsWith('posted 2026-11-04: 33804 exits'))).toBe(true)
  })

  test('repeats are skipped and the state still advances', async () => {
    const { deps, options, posts, saved } = harness({
      metadata: metadataWith({ data_as_of: '2026-11-06 23:59', next_update: '2026-11-08 22:00' }),
      state: {
        data_as_of: '2026-11-05 23:59',
        nights: {
          '2026-01-10': { value: 38447, revision: 1 },
          '2026-11-01': { value: 5239, revision: 1 },
          '2026-11-02': { value: 4473, revision: 1 },
          '2026-11-03': { value: 4944, revision: 1 },
          '2026-11-04': { value: 33804, revision: 1 }
        }
      }
    })
    await runOnce(deps, options)
    expect(posts).toEqual([])
    expect(saved).toHaveLength(1)
    expect(saved[0]?.data_as_of).toBe('2026-11-06 23:59')
  })

  test('a revised count reposts at revision + 1, and only that night', async () => {
    const { deps, options, posts } = harness({
      state: {
        data_as_of: '2026-11-04 23:59',
        nights: {
          '2026-01-10': { value: 38447, revision: 1 },
          '2026-11-01': { value: 5239, revision: 1 },
          '2026-11-02': { value: 4473, revision: 1 },
          '2026-11-03': { value: 4944, revision: 1 },
          '2026-11-04': { value: 33000, revision: 1 }
        }
      }
    })
    await runOnce(deps, options)
    expect(posts).toHaveLength(1)
    expect(posts[0]?.rows).toHaveLength(1)
    expect(posts[0]?.rows[0]).toMatchObject({ kind: 'sp17_exits', value: 33804, revision: 2 })
  })

  test('an already-posted data_as_of posts nothing', async () => {
    const { deps, options, posts } = harness({ state: { data_as_of: '2026-11-05 23:59', nights: {} } })
    await runOnce(deps, options)
    expect(posts).toEqual([])
  })

  test('a duplicate reply is acknowledged and remembered', async () => {
    const { deps, options, logs, saved } = harness({ reply: { ok: true, duplicate: true } })
    await runOnce(deps, options)
    expect(logs).toContain('the pilot already holds these rows (duplicate: true)')
    expect(saved).toHaveLength(1)
  })

  test('a non-ok reply fails the run without remembering', async () => {
    const { deps, options, saved } = harness({ reply: { ok: false, error: 'bad token' } })
    await expect(runOnce(deps, options)).rejects.toThrow('the pilot refused the post: bad token')
    expect(saved).toEqual([])
  })
})

describe('runOnce on a schema change', () => {
  test('posts one error row and nothing else, then fails the job', async () => {
    const renamed = extract.map((row) => {
      const { destination: _dropped, ...rest } = row
      return { ...rest, destination_station: 'SP17: Bukit Jalil' }
    })
    const { deps, options, posts } = harness({ records: renamed, reply: { ok: true, duplicate: false } })
    await expect(runOnce(deps, options)).rejects.toThrow('schema change: column "destination" is missing or renamed')
    expect(posts).toHaveLength(1)
    const post = posts[0]
    if (!post) throw new Error('no post')
    expect(post.rows).toHaveLength(1)
    expect(post.rows[0]?.kind).toBe('error')
    expect(post.poll.outcome).toBe('error')
    expect(post.poll.error).toBe('column "destination" is missing or renamed')
    expect(post.rows.some((row) => row.kind === 'sp17_exits')).toBe(false)
  })
})

describe('runBackfill', () => {
  test('posts every night in range, oldest first', async () => {
    const { deps, options, posts } = harness({ records: extract })
    await runBackfill(deps, { ...options, backfill: true, start: '2026-11-01', end: '2026-11-04' })
    expect(posts).toHaveLength(1)
    expect(posts[0]?.rows.map((row) => (row as { observed_at: string }).observed_at)).toEqual([
      '2026-11-01T00:00:00+08:00',
      '2026-11-02T00:00:00+08:00',
      '2026-11-03T00:00:00+08:00',
      '2026-11-04T00:00:00+08:00'
    ])
  })

  test('carries at most 200 rows per post', async () => {
    const big: Record<string, unknown>[] = []
    for (let n = 0; n < 205; n++) {
      const date = new Date(Date.parse('2023-01-01T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
      big.push({ origin: `ST${n}`, destination: 'SP17: Bukit Jalil', date, ridership: n + 1 })
    }
    big.push({ origin: 'A0: All Stations', destination: 'SP17: Bukit Jalil', date: '2023-01-01', ridership: 1 })
    const { deps, options, posts } = harness({ records: big })
    await runBackfill(deps, { ...options, backfill: true, start: '2023-01-01', end: '2023-12-31' })
    expect(posts).toHaveLength(2)
    expect(posts.map((post) => post.rows.length)).toEqual([200, 5])
  })

  test('a schema change in one edition fails naming the file', async () => {
    const { deps, options } = harness({
      records: { schemaError: 'column "destination" is missing or renamed' }
    })
    await expect(
      runBackfill(deps, { ...options, backfill: true, start: '2026-01-01', end: '2026-12-31' })
    ).rejects.toThrow('schema change in the 2026 file')
  })
})
