import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  domainEvent,
  emitSourcePoll,
  loadStoredRequest,
  poll,
  reading,
  recordSourceRequest,
  systemPrincipal,
  withSystem,
  withTenant,
  type SourceRequestWrite
} from '../src'
import { makeOrganization, makeProject, makeProjectSource, makeReading, makeSource } from './factories'
import { asLogin } from './harness'

const observedAt = new Date('2026-11-10T01:00:00Z')
const receivedAt = new Date('2026-11-10T02:00:00Z')
const system = systemPrincipal('test-source-writer')
const sourceId = () => withSystem(system.job, async (tx) => (await makeSource(tx)).id)
const request = (id: string, value = 4): SourceRequestWrite => ({
  requestId: randomUUID(),
  startedAt: new Date(),
  purpose: 'poll',
  family: null,
  httpStatus: 200,
  latencyMs: 80,
  sources: [
    {
      sourceId: id,
      outcome: 'ok',
      bodySha256: null,
      readings: [{ metric: 'rain_5m_mm', observedAt, receivedAt, unit: 'mm', value }]
    }
  ]
})
const store = (input: SourceRequestWrite) => withSystem(system.job, (tx) => recordSourceRequest(tx, input))
const rows = (id: string) =>
  withSystem(system.job, (tx) =>
    tx.select().from(reading).where(eq(reading.sourceId, id)).orderBy(asc(reading.revision))
  )

test.each(['observedAt', 'receivedAt', 'httpStatus', 'latencyMs'] as const)(
  'rejects missing %s before writing any poll or reading',
  async (field) => {
    const id = await sourceId()
    const input = request(id)
    const target = field === 'observedAt' || field === 'receivedAt' ? input.sources[0]!.readings[0]! : input
    delete (target as unknown as Record<string, unknown>)[field]
    await expect(store(input)).rejects.toThrow(/invalid source request/)
    if (field === 'httpStatus') {
      input.httpStatus = null
      await expect(store(input)).rejects.toThrow(/invalid source request/)
    }
    expect(await rows(id)).toEqual([])
    expect(await withSystem(system.job, (tx) => tx.select().from(poll).where(eq(poll.sourceId, id)))).toEqual([])
  }
)

test('an error carrying readings rejects the whole multi-source request, while a no-response error stores null status', async () => {
  const a = await sourceId()
  const b = await sourceId()
  const invalid = request(a)
  invalid.sources.push({ ...request(b).sources[0]!, outcome: 'error' })
  await expect(store(invalid)).rejects.toThrow(/invalid source request/)
  expect(await rows(a)).toEqual([])
  invalid.sources[1]!.readings = []
  expect((await store(invalid)).find(({ sourceId }) => sourceId === a)).toMatchObject({ outcome: 'ok', newRows: 1 })
  const input = request(b)
  input.httpStatus = null
  input.sources[0] = { sourceId: b, outcome: 'error', bodySha256: null, readings: [], errorCode: 'network' }
  expect(await store(input)).toMatchObject([{ sourceId: b, outcome: 'error', httpStatus: null, newRows: 0 }])
})

test.each([0, 99, 600, 200.5])('rejects fabricated or malformed HTTP status %s', async (status) => {
  const input = request(await sourceId())
  input.httpStatus = status
  await expect(store(input)).rejects.toThrow(/invalid source request/)
})

test('first reading is revision 1, equal JSON reordering adds nothing, and each changed value appends exactly once', async () => {
  const id = await sourceId()
  const first = request(id)
  first.sources[0]!.readings[0]!.valueJson = { a: 1, b: { x: 2, y: 3 } }
  expect(await store(first)).toMatchObject([{ newRows: 1 }])
  const equal = request(id)
  equal.sources[0]!.readings[0]!.valueJson = { b: { y: 3, x: 2 }, a: 1 }
  expect(await store(equal)).toMatchObject([{ newRows: 0 }])
  const changed = request(id, 5)
  changed.sources[0]!.readings[0]!.valueJson = first.sources[0]!.readings[0]!.valueJson
  expect(await store(changed)).toMatchObject([{ newRows: 1 }])
  expect(
    (await rows(id)).map(({ revision, value, itemKey, receivedAt }) => ({ revision, value, itemKey, receivedAt }))
  ).toEqual([
    { revision: 1, value: 4, itemKey: '', receivedAt },
    { revision: 2, value: 5, itemKey: '', receivedAt }
  ])
})

test('different item keys coexist and legacy null compares as empty without rewriting history', async () => {
  const defaultKey = await withSystem(system.job, (tx) => makeReading(tx))
  expect(defaultKey.itemKey).toBe('')
  const id = await sourceId()
  const legacy = await withSystem(system.job, (tx) =>
    makeReading(tx, { sourceId: id, observedAt, receivedAt, value: 4, itemKey: null })
  )
  const equal = request(id)
  expect(await store(equal)).toMatchObject([{ newRows: 0 }])
  const changed = request(id, 7)
  changed.sources[0]!.readings.push({ ...changed.sources[0]!.readings[0]!, itemKey: 'second', value: 9 })
  expect(await store(changed)).toMatchObject([{ newRows: 2 }])
  expect((await rows(id)).map(({ id, itemKey, revision }) => ({ id, itemKey, revision }))).toEqual([
    { id: legacy.id, itemKey: null, revision: 0 },
    { id: expect.any(String), itemKey: '', revision: 1 },
    { id: expect.any(String), itemKey: 'second', revision: 1 }
  ])
})

test('two PostgreSQL transactions racing a changed reading append only revision 2', async () => {
  const id = await sourceId()
  await store(request(id))
  let release!: () => void
  let held!: () => void
  const holding = new Promise<void>((resolve) => {
    held = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = withSystem(system.job, async (tx) => {
    const result = await recordSourceRequest(tx, request(id, 8))
    held()
    await gate
    return result
  })
  await holding
  let secondDone = false
  const second = store(request(id, 8)).then((result) => {
    secondDone = true
    return result
  })
  try {
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(secondDone).toBe(false)
  } finally {
    release()
  }
  const results = await Promise.all([first, second])
  expect(results.map((result) => result[0]!.newRows)).toEqual([1, 0])
  expect((await rows(id)).map(({ revision }) => revision)).toEqual([1, 2])
})

test('concurrent redelivery returns stable poll IDs and original newRows for all three sources', async () => {
  const ids = await Promise.all([sourceId(), sourceId(), sourceId()])
  const input = request(ids[0]!)
  input.sources.push(...ids.slice(1).map((id) => request(id).sources[0]!))
  const [first, replay] = await Promise.all([store(input), store(input)])
  expect(first).toHaveLength(3)
  expect(replay).toEqual(first)
  expect(first.map(({ newRows }) => newRows)).toEqual([1, 1, 1])
  expect(await withSystem(system.job, (tx) => loadStoredRequest(tx, input.requestId))).toEqual(first)
  const stored = await asLogin('postgres', (client) =>
    client.query('SELECT request_id, count(*)::int AS n FROM poll WHERE request_id = $1 GROUP BY request_id', [
      input.requestId
    ])
  )
  expect(stored.rows).toEqual([{ request_id: input.requestId, n: 3 }])
})

test('UUID spelling does not change request receipts or source lock identity', async () => {
  const id = await sourceId()
  const input = request(id)
  const first = await store(input)
  input.requestId = input.requestId.toUpperCase()
  input.sources[0]!.sourceId = id.toUpperCase()
  expect(await store(input)).toEqual(first)
})

test('requests with reversed source order cannot deadlock or append duplicate revisions', async () => {
  const ids = await Promise.all([sourceId(), sourceId()])
  for (const id of ids) await store(request(id))
  const first = request(ids[0]!, 9)
  first.sources.push(request(ids[1]!, 9).sources[0]!)
  const second = { ...first, requestId: randomUUID(), sources: [...first.sources].reverse() }
  const results = await Promise.all([store(first), store(second)])
  expect(results.flat().reduce((sum, poll) => sum + poll.newRows, 0)).toBe(2)
  for (const id of ids) expect((await rows(id)).map(({ revision }) => revision)).toEqual([1, 2])
})

test.each([{ unit: 'changed-unit' }, { valueText: 'changed text' }, { valueJson: { changed: true } }])(
  'a semantic payload change appends one revision: %j',
  async (change) => {
    const id = await sourceId()
    await store(request(id))
    const changed = request(id)
    Object.assign(changed.sources[0]!.readings[0]!, change)
    expect(await store(changed)).toMatchObject([{ newRows: 1 }])
    expect((await rows(id)).map(({ revision }) => revision)).toEqual([1, 2])
  }
)

test('a repeated successful body digest suppresses readings after taking the source lock', async () => {
  const id = await sourceId()
  const first = request(id)
  first.sources[0]!.bodySha256 = 'a'.repeat(64)
  await store(first)
  const sameBody = request(id, 99)
  sameBody.sources[0]!.bodySha256 = 'a'.repeat(64)
  expect(await store(sameBody)).toMatchObject([{ newRows: 0 }])
  expect(await rows(id)).toHaveLength(1)
})

test('older captures cannot supersede newer corrections but can add unseen observation keys and replay stably', async () => {
  const id = await sourceId()
  const newer = request(id, 8)
  newer.startedAt = new Date('2026-11-10T02:00:00Z')
  await store(newer)
  const older = request(id, 3)
  older.startedAt = new Date('2026-11-10T01:00:00Z')
  expect(await store(older)).toMatchObject([{ outcome: 'unchanged', newRows: 0 }])
  const backfill = request(id, 2)
  backfill.startedAt = older.startedAt
  backfill.purpose = 'backfill'
  backfill.sources[0]!.readings.push({ ...backfill.sources[0]!.readings[0]!, itemKey: 'unseen', value: 7 })
  const stored = await store(backfill)
  expect(stored).toMatchObject([{ outcome: 'ok', newRows: 1, purpose: 'backfill' }])
  expect(await store(backfill)).toEqual(stored)
  expect((await rows(id)).map(({ value, itemKey, revision }) => ({ value, itemKey, revision }))).toEqual([
    { value: 8, itemKey: '', revision: 1 },
    { value: 7, itemKey: 'unseen', revision: 1 }
  ])
})

test('equal capture clocks and legacy rows without poll clocks use normal revision order', async () => {
  const id = await sourceId()
  await withSystem(system.job, (tx) =>
    makeReading(tx, { sourceId: id, observedAt, value: 1, itemKey: null, revision: 1 })
  )
  const first = request(id, 2)
  const second = request(id, 3)
  second.startedAt = first.startedAt
  await store(first)
  await store(second)
  expect((await rows(id)).map(({ value, revision }) => ({ value, revision }))).toEqual([
    { value: 1, revision: 1 },
    { value: 2, revision: 2 },
    { value: 3, revision: 3 }
  ])
})

test('fan-out receipts distinguish projects and organisations, and repeat delivery emits once per project', async () => {
  const id = await sourceId()
  const [stored] = await store(request(id))
  const orgs = await Promise.all([makeOrganization(), makeOrganization()])
  const projects = []
  for (const org of orgs) {
    for (let i = 0; i < 2; i++) {
      const project = await withTenant({ orgId: org.id, principal: system }, async (tx) => {
        const p = await makeProject(tx)
        await makeProjectSource(tx, { projectId: p.id, sourceId: id, role: 'rain_gauge' })
        return p
      })
      projects.push(project)
    }
  }
  for (const p of projects) {
    await withTenant({ orgId: p.orgId, principal: system }, async (tx) => {
      await emitSourcePoll(tx, p.id, stored!)
      await emitSourcePoll(tx, p.id, stored!)
    })
  }
  const events = await withSystem(system.job, (tx) =>
    tx
      .select()
      .from(domainEvent)
      .where(
        and(
          eq(domainEvent.type, 'poll.recorded'),
          eq(domainEvent.data, { source_id: id, poll_id: stored!.id, outcome: 'ok', http_status: 200, new_rows: 1 })
        )
      )
  )
  expect(events.map(({ projectId }) => projectId).sort()).toEqual(projects.map(({ id }) => id).sort())
})
