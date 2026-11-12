import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import { beforeAll, expect, test } from 'vitest'
import * as db from '../src'
import { makeOrganization, makeProject, makeProjectSource, makeReading, makeSource } from './factories'
import { asLogin, memberOf } from './harness'
import { capturedCa16w } from './source-binding-capture'

let orgId: string
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const tenant = <T>(fn: (tx: db.Tx) => Promise<T>, id = orgId) =>
  db.withTenant({ orgId: id, principal: memberOf(id) }, fn)
const write = <T>(fn: (tx: db.Tx) => Promise<T>) => db.withSystem('source-history-test', fn)
const access = (id: string, tenantId = orgId) => tenant((tx) => db.getSourceHistoryAccess(tx, id), tenantId)
const readings = (query: db.SourceHistoryPage) => tenant((tx) => db.listSourceReadingRecords(tx, query))
const polls = (query: db.SourceHistoryPage & { outcome?: 'ok' | 'unchanged' | 'error' }) =>
  tenant((tx) => db.listSourcePollRecords(tx, query))

test('unbound captured catalogue evidence is readable by two tenants and an authenticated guest', async () => {
  const capture = capturedCa16w()
  const src = await write(async (tx) => {
    const src = await makeSource(tx, capture)
    await makeReading(tx, {
      sourceId: src.id,
      metric: 'api',
      unit: null,
      observedAt: capture.observedAt,
      value: capture.value
    })
    return src
  })
  const other = (await makeOrganization()).id
  for (const id of [orgId, other]) {
    expect(await access(src.id, id)).toEqual({ source: src, projectId: null })
    expect(await tenant((tx) => db.listSourceReadingRecords(tx, { sourceId: src.id, limit: 1 }), id)).toMatchObject([
      { value: capture.value }
    ])
  }
  const principal = { ...memberOf(other), isGuest: true, role: null } as Extract<Principal, { kind: 'session' }>
  await db.withTenant({ orgId: other, principal }, async (tx) => {
    expect(await db.getSourceHistoryAccess(tx, src.id)).toEqual({ source: src, projectId: null })
    expect(await db.listSourceReadingRecords(tx, { sourceId: src.id, limit: 1 })).toMatchObject([
      { value: capture.value }
    ])
  })
})

test('private access resolves real metadata projects without bindings and rejects corrupt classifications', async () => {
  const other = (await makeOrganization()).id
  const foreign = await tenant((tx) => makeProject(tx), other)
  const [own, conflict] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
  for (const kind of ['camera', 'pi'] as const) {
    const good = await tenant((tx) => makeSource(tx, { kind, meta: { project_id: own.id } }))
    expect(await access(good.id)).toEqual({ source: good, projectId: own.id })
    await tenant((tx) => makeProjectSource(tx, { sourceId: good.id, projectId: own.id, role: kind }))
    expect((await access(good.id))?.projectId).toBe(own.id)
    await tenant((tx) => makeProjectSource(tx, { sourceId: good.id, projectId: conflict.id, role: kind }))
    expect(await access(good.id)).toBeNull()
    for (const meta of [
      {},
      { project_id: 'bad' },
      { project_id: 42 },
      { project_id: null },
      { project_id: foreign.id },
      { project_id: randomUUID() }
    ]) {
      const bad = await tenant((tx) => makeSource(tx, { kind, meta }))
      expect(await access(bad.id)).toBeNull()
    }
    const foreignOwner = await tenant((tx) => makeSource(tx, { kind, meta: { project_id: own.id } }), other)
    expect(await access(foreignOwner.id)).toBeNull()
    // Only privileged test setup can create the impossible legacy null-owner private classification.
    const nullOwner = await write((tx) => makeSource(tx, { kind }))
    expect(await access(nullOwner.id)).toBeNull()
  }
  const ownedCatalogue = await tenant((tx) => makeSource(tx, { kind: 'apims', meta: { project_id: own.id } }))
  expect(await access(ownedCatalogue.id)).toBeNull()
  expect(await access(randomUUID())).toBeNull()
})

const times = [
  '2026-11-01T00:00:00.000002Z',
  '2026-11-01T00:00:00.000002Z',
  '2026-11-01T00:00:00.000001Z',
  '2026-10-31T23:59:59.999999Z'
]

async function exactRows(kind: 'reading' | 'poll') {
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort().reverse()
  const src = await write((tx) => makeSource(tx))
  // Raw SQL is test setup only: Date-based factory inputs cannot express PostgreSQL microseconds.
  await asLogin('postgres', async (client) => {
    for (const [i, at] of times.entries()) {
      if (kind === 'reading')
        await client.query(
          'INSERT INTO reading (id,source_id,metric,observed_at,received_at,device_time,value_text) VALUES ($1,$2,$3,$4,$4,$4,$5)',
          [ids[i], src.id, `metric-${i}`, at, ' exact\ntext ']
        )
      else
        await client.query(
          'INSERT INTO poll (id,source_id,request_id,started_at,received_at,latency_ms,outcome) VALUES ($1,$2,$3,$4,$4,1,$5)',
          [ids[i], src.id, randomUUID(), at, 'ok']
        )
    }
  })
  return { src, ids }
}

for (const kind of ['reading', 'poll'] as const) {
  test(`${kind} uses exact half-open/open ranges, limit plus one, source isolation and full timestamp projection`, async () => {
    const { src, ids } = await exactRows(kind)
    const list = (query: db.SourceHistoryPage) => (kind === 'reading' ? readings(query) : polls(query))
    const all = await list({ sourceId: src.id, limit: 1 })
    expect(all.map((row) => row.id)).toEqual(ids.slice(0, 2))
    expect(await list({ sourceId: randomUUID(), limit: 200 })).toEqual([])
    expect((await list({ sourceId: src.id, limit: 200, from: times[2], to: times[0] })).map((row) => row.id)).toEqual([
      ids[2]
    ])
    expect((await list({ sourceId: src.id, limit: 200, from: times[2] })).map((row) => row.id)).toEqual(ids.slice(0, 3))
    expect((await list({ sourceId: src.id, limit: 200, to: times[2] })).map((row) => row.id)).toEqual([ids[3]])
    expect(all[0]?.receivedAt).toBe(times[0])
    if ('observedAt' in all[0]!)
      expect(all[0]).toMatchObject({ observedAt: times[0], deviceTime: times[0], valueText: ' exact\ntext ' })
    else expect(all[0]).toMatchObject({ startedAt: times[0] })
  })

  test(`${kind} traverses microseconds and partitions once with limit one even after cursor retention`, async () => {
    const { src, ids } = await exactRows(kind)
    const list = (query: db.SourceHistoryPage) => (kind === 'reading' ? readings(query) : polls(query))
    const seen: string[] = []
    let after: db.HistoryPosition | undefined
    for (let i = 0; i < 5; i++) {
      const rows = await list({ sourceId: src.id, limit: 1, after })
      const row = rows[0]
      if (!row) break
      const at = 'observedAt' in row ? row.observedAt : row.startedAt
      expect(at).toBe(times[i])
      seen.push(row.id)
      after = { at, id: row.id }
      if (i === 0)
        await asLogin('retention', (client) =>
          client.query(`DELETE FROM ${kind} WHERE source_id=$1 AND id=$2`, [src.id, row.id])
        )
    }
    expect(seen).toEqual(ids)
  })
}

test('readings retain every equal-time revision, metric and item, nested JSON and a captured future forecast', async () => {
  const src = await write((tx) => makeSource(tx, { kind: 'met_forecast' }))
  const forecast = JSON.parse(
    readFileSync(
      new URL('../../sources/test/fixtures/weather-forecast-kl-20261108T014413Z.json', import.meta.url),
      'utf8'
    )
  )[0]
  const json = { Original_Key: [null, { nestedKey: true, nested_key: 'raw' }] }
  await write(async (tx) => {
    for (const row of [
      { metric: 'forecast', revision: 0, itemKey: 'a' },
      { metric: 'forecast', revision: 1, itemKey: 'a' },
      { metric: 'forecast', revision: 0, itemKey: 'b' },
      { metric: 'other', revision: 0, itemKey: null }
    ])
      await makeReading(tx, {
        sourceId: src.id,
        observedAt: new Date(`${forecast.date}T00:00:00Z`),
        receivedAt: new Date('2026-11-08T01:44:13Z'),
        value: null,
        unit: null,
        valueText: ' original\ntext ',
        valueJson: { ...json, forecast },
        ...row
      })
  })
  const rows = await readings({ sourceId: src.id, limit: 200 })
  expect(rows).toHaveLength(4)
  expect(rows.map((r) => [r.metric, r.revision, r.itemKey]).sort()).toEqual(
    [
      ['forecast', 0, 'a'],
      ['forecast', 1, 'a'],
      ['forecast', 0, 'b'],
      ['other', 0, null]
    ].sort()
  )
  for (const row of rows)
    expect(row).toMatchObject({
      observedAt: '2026-11-14T00:00:00.000000Z',
      receivedAt: '2026-11-08T01:44:13.000000Z',
      value: null,
      unit: null,
      valueText: ' original\ntext ',
      valueJson: { ...json, forecast },
      pollId: null,
      deviceTime: null
    })
})

test('polls retain old backfill errors, null diagnostics and all stored outcomes with optional outcome filtering', async () => {
  const src = await write((tx) => makeSource(tx))
  await asLogin('postgres', async (client) => {
    for (const [i, outcome] of ['error', 'ok', 'ok', 'ok', 'ok', 'ok', 'unchanged', 'legacy'].entries())
      await client.query(
        'INSERT INTO poll (source_id,request_id,started_at,latency_ms,outcome,purpose) VALUES ($1,$2,$3,3,$4,$5)',
        [
          src.id,
          randomUUID(),
          new Date(`2026-11-01T${String(i === 0 ? 9 : 12).padStart(2, '0')}:0${i}:00Z`),
          outcome,
          i === 0 ? 'apims_backfill' : 'poll'
        ]
      )
  })
  const rows = await polls({ sourceId: src.id, limit: 200 })
  expect(rows).toHaveLength(8)
  expect(rows.map((r) => r.outcome)).toEqual(['legacy', 'unchanged', 'ok', 'ok', 'ok', 'ok', 'ok', 'error'])
  const errors = await polls({ sourceId: src.id, limit: 200, outcome: 'error' })
  expect(errors).toHaveLength(1)
  expect(errors[0]).toMatchObject({
    purpose: 'apims_backfill',
    receivedAt: null,
    httpStatus: null,
    message: null,
    outcome: 'error'
  })
})
