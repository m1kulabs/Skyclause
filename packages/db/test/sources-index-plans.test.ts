import { randomUUID } from 'node:crypto'
import { beforeAll, expect, test } from 'vitest'
import { withSystem } from '../src'
import { makePoll, makeReading, makeSource } from './factories'
import { asLogin } from './harness'

interface Plan {
  'Node Type': string
  'Relation Name'?: string
  'Index Cond'?: string
  Plans?: Plan[]
}

const nodes = (plan: Plan): Plan[] => [plan, ...(plan.Plans ?? []).flatMap(nodes)]
const requestId = randomUUID()
let sourceId: string
let pollId: string

beforeAll(async () => {
  await withSystem('test-source-index-plans', async (tx) => {
    const source = await makeSource(tx)
    sourceId = source.id
    for (const at of ['2026-10-10T01:00:00Z', '2026-11-10T01:00:00Z', '2026-12-10T01:00:00Z']) {
      const poll = await makePoll(tx, { sourceId, requestId, startedAt: new Date(at), bodySha256: 'a'.repeat(64) })
      pollId = poll.id
      await makeReading(tx, { sourceId, pollId, observedAt: new Date(at) })
    }
    await makePoll(tx, { sourceId, purpose: 'backfill' })
    await makePoll(tx, { sourceId, outcome: 'error' })
  })
})

async function explain(query: string, values: unknown[]): Promise<Plan> {
  return asLogin('system', async (client) => {
    await client.query('BEGIN')
    try {
      // Prove the access path exists without asserting cost choices on tiny fixtures.
      await client.query('SET LOCAL enable_seqscan = off')
      const { rows } = await client.query<{ 'QUERY PLAN': Array<{ Plan: Plan }> }>(
        `EXPLAIN (FORMAT JSON) ${query}`,
        values
      )
      return rows[0]!['QUERY PLAN'][0]!.Plan
    } finally {
      await client.query('ROLLBACK')
    }
  })
}

function expectIndexedPartitions(plan: Plan, table: 'poll' | 'reading', predicates: string[]) {
  const scans = nodes(plan).filter((node) => node['Relation Name']?.startsWith(`${table}_`))
  expect(scans.length).toBeGreaterThan(1)
  for (const scan of scans) {
    const conditions = nodes(scan)
      .map((node) => node['Index Cond'] ?? '')
      .join(' ')
    for (const predicate of predicates) expect(conditions, JSON.stringify(scan)).toContain(predicate)
  }
}

test('request replay can index request_id and correlated reading counts in every retained partition', async () => {
  const plan = await explain(
    `SELECT p.id, p.source_id, s.kind, p.outcome, p.http_status,
      (SELECT count(*) FROM reading r WHERE r.poll_id = p.id) AS new_rows, p.purpose, p.started_at
    FROM poll p JOIN source s ON s.id = p.source_id WHERE p.request_id = $1 ORDER BY p.source_id`,
    [requestId]
  )
  expectIndexedPartitions(plan, 'poll', ['request_id'])
  expectIndexedPartitions(plan, 'reading', ['poll_id'])
})

test('reading counts have a poll_id index access path without a partition-time predicate', async () => {
  const plan = await explain('SELECT count(*) FROM reading WHERE poll_id = $1', [pollId])
  expectIndexedPartitions(plan, 'reading', ['poll_id'])
})

test('purpose-qualified digest lookup indexes source and purpose and preserves latest-first order', async () => {
  const plan = await explain(
    `SELECT body_sha256 FROM poll WHERE source_id = $1 AND purpose = $2
    AND outcome IN ($3, $4) ORDER BY started_at DESC, id DESC LIMIT 1`,
    [sourceId, 'backfill', 'ok', 'unchanged']
  )
  expectIndexedPartitions(plan, 'poll', ['source_id', 'purpose'])
  expect(nodes(plan).filter((node) => /Sort/.test(node['Node Type']))).toEqual([])
})
