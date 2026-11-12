import { randomUUID } from 'node:crypto'
import { beforeAll, expect, test } from 'vitest'
import * as db from '../src'
import {
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeSource,
  makeSourceState
} from './factories'
import { asLogin, memberOf } from './harness'
import { capturedCa16w } from './source-binding-capture'

// Every temporal row and request uses this one clock, including rows deliberately outside its cutoff.
const now = new Date('2026-11-05T12:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
let orgId: string
const tenant = <T>(fn: (tx: db.Tx) => Promise<T>, id = orgId) =>
  db.withTenant({ orgId: id, principal: memberOf(id) }, fn)
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})
const list = (projectId: string, limit = 200, afterId?: string, id = orgId) =>
  tenant((tx) => db.listProjectSourceRecords(tx, { projectId, limit, afterId, now }), id)

async function bound() {
  const src = await db.withSystem('source-health-test', (tx) => makeSource(tx, { cadenceS: 3600, freshness: 'polled' }))
  const project = await tenant(async (tx) => {
    const project = await makeProject(tx)
    await makeProjectSource(tx, { projectId: project.id, sourceId: src.id, role: 'api_station' })
    return project
  })
  return { src, project }
}
const write = <T>(fn: (tx: db.Tx) => Promise<T>) => db.withSystem('source-health-test', fn)

test('empty list and binding UUID pagination return limit plus one with stored roles', async () => {
  const { src, project } = await bound()
  const empty = await tenant((tx) => makeProject(tx))
  expect(await list(empty.id)).toEqual([])
  const bindings = await tenant(async (tx) => {
    const existing = await db.projectBindings(tx, project.id)
    return [
      ...existing,
      await makeProjectSource(tx, { projectId: project.id, sourceId: src.id, role: 'warnings' }),
      await makeProjectSource(tx, { projectId: project.id, sourceId: src.id, role: 'met_forecast' })
    ]
  })
  const sorted = bindings.sort((a, b) => a.id.localeCompare(b.id))
  const first = await list(project.id, 1)
  expect(first.map((row) => [row.bindingId, row.role])).toEqual(sorted.slice(0, 2).map((row) => [row.id, row.role]))
  expect((await list(project.id, 1, first[0]!.bindingId)).map((row) => row.bindingId)).toEqual(
    sorted.slice(1).map((row) => row.id)
  )
})

test('two tenants share captured public CA16W evidence but never project bindings', async () => {
  const capture = capturedCa16w()
  const src = await write(async (tx) => {
    const src = await makeSource(tx, capture)
    await makeReading(tx, {
      sourceId: src.id,
      metric: 'api',
      unit: null,
      observedAt: capture.observedAt,
      receivedAt: ago(30),
      value: capture.value
    })
    return src
  })
  const other = (await makeOrganization()).id
  const projects = []
  for (const id of [orgId, other])
    projects.push(
      await tenant(async (tx) => {
        const project = await makeProject(tx)
        await makeProjectSource(tx, { projectId: project.id, sourceId: src.id, role: 'api_station' })
        return project
      }, id)
    )
  const a = await list(projects[0]!.id)
  const b = await list(projects[1]!.id, 200, undefined, other)
  expect(a[0]?.latestReading?.value).toBe(capture.value)
  expect(b[0]?.latestReading?.value).toBe(capture.value)
  expect(a[0]?.bindingId).not.toBe(b[0]?.bindingId)
  expect(await list(projects[0]!.id, 200, undefined, other)).toEqual([])
})

test('private camera and Pi ownership rejects malformed, foreign and conflicting legacy bindings before evidence', async () => {
  const otherOrg = (await makeOrganization()).id
  const foreign = await tenant((tx) => makeProject(tx), otherOrg)
  const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
  const expected: string[] = []
  await tenant(async (tx) => {
    for (const kind of ['camera', 'pi'] as const) {
      for (const [index, meta] of [
        { project_id: a.id },
        { project_id: b.id },
        {},
        { project_id: 'bad' },
        { project_id: 42 },
        { project_id: foreign.id },
        { project_id: randomUUID() },
        { project_id: a.id }
      ].entries()) {
        const src = await makeSource(tx, { kind, meta })
        await makeProjectSource(tx, { projectId: a.id, sourceId: src.id, role: kind })
        await makeReading(tx, { sourceId: src.id, observedAt: ago(10), receivedAt: ago(5), value: 7 })
        if (index === 0) expected.push(src.id)
        if (index === 7) await makeProjectSource(tx, { projectId: b.id, sourceId: src.id, role: kind })
      }
    }
  })
  const foreignDevice = await tenant((tx) => makeSource(tx, { kind: 'camera', meta: { project_id: a.id } }), otherOrg)
  // Legacy/corrupt binding setup bypasses RLS only in this test fixture.
  await asLogin('postgres', (client) =>
    client.query('INSERT INTO project_source (org_id, project_id, source_id, role) VALUES ($1, $2, $3, $4)', [
      orgId,
      a.id,
      foreignDevice.id,
      'camera'
    ])
  )
  const rows = await list(a.id)
  expect(rows.map((row) => row.source.id).sort()).toEqual(expected.sort())
  expect(rows.every((row) => row.latestReading?.value === 7)).toBe(true)
  expect(await list(b.id)).toEqual([])
})

test('retains a three-hour-old error despite five newer successes, including diagnostic backfill purpose', async () => {
  const { src, project } = await bound()
  const old = await write(async (tx) => {
    const old = await makePoll(tx, {
      sourceId: src.id,
      outcome: 'error',
      startedAt: ago(10800),
      receivedAt: ago(10799),
      httpStatus: null,
      message: null,
      purpose: 'apims_backfill'
    })
    for (let i = 1; i <= 5; i++)
      await makePoll(tx, { sourceId: src.id, startedAt: ago(i * 900), receivedAt: ago(i * 900 - 1) })
    return old
  })
  const [row] = await list(project.id)
  expect(row?.recentErrors).toEqual([old])
  expect(row?.normalPolls).toHaveLength(5)
})

test('backfill-only source has no normal poll evidence or fabricated state', async () => {
  const { src, project } = await bound()
  await write((tx) =>
    makePoll(tx, { sourceId: src.id, startedAt: ago(60), receivedAt: ago(59), purpose: 'apims_backfill' })
  )
  expect((await list(project.id))[0]).toMatchObject({
    normalPolls: [],
    latestNormalPoll: null,
    latestGoodNormalPoll: null,
    state: null,
    latestReading: null
  })
})

test('returns only the five newest retained errors across all purposes', async () => {
  const { src, project } = await bound()
  const errors = await write(async (tx) => {
    const errors = []
    for (let i = 1; i <= 7; i++)
      errors.push(
        await makePoll(tx, {
          sourceId: src.id,
          startedAt: ago(i * 3600),
          receivedAt: ago(i * 3600 - 1),
          outcome: 'error',
          purpose: i % 2 ? 'apims_backfill' : 'poll'
        })
      )
    return errors
  })
  expect((await list(project.id))[0]?.recentErrors).toEqual(errors.slice(0, 5))
})

test('latest normal and latest good evidence can precede the bounded slot window', async () => {
  const { src, project } = await bound()
  const expected = await write(async (tx) => {
    const good = await makePoll(tx, {
      sourceId: src.id,
      startedAt: ago(180000),
      receivedAt: ago(179999),
      outcome: 'unchanged'
    })
    const latest = await makePoll(tx, {
      sourceId: src.id,
      startedAt: ago(176400),
      receivedAt: ago(176399),
      outcome: 'error'
    })
    await makePoll(tx, { sourceId: src.id, startedAt: ago(60), receivedAt: ago(59), purpose: 'probe' })
    return { good, latest }
  })
  const [row] = await list(project.id)
  expect(row?.normalPolls).toEqual([])
  expect(row?.latestNormalPoll).toEqual(expected.latest)
  expect(row?.latestGoodNormalPoll).toEqual(expected.good)
})

test('APIMS logical cadence 3600 retains 900-second outcomes and half-open 48-slot boundaries', async () => {
  const { src, project } = await bound()
  const rows = await write(async (tx) => {
    const rows = []
    for (const [seconds, outcome] of [
      [172801, 'error'],
      [172800, 'ok'],
      [169200, 'ok'],
      [2700, 'error'],
      [1800, 'ok'],
      [900, 'unchanged'],
      [0, 'error']
    ] as const)
      rows.push(await makePoll(tx, { sourceId: src.id, startedAt: ago(seconds), receivedAt: ago(seconds), outcome }))
    return rows
  })
  const [row] = await list(project.id)
  expect(row?.source.cadenceS).toBe(3600)
  expect(row?.normalPolls.map((p) => p.id)).toEqual(
    rows
      .slice(1, -1)
      .reverse()
      .map((p) => p.id)
  )
  expect(row?.latestNormalPoll?.outcome).toBe('unchanged')
  expect(row?.latestGoodNormalPoll?.outcome).toBe('unchanged')
})

test('equal clock ordering uses UUID for latest polls, errors and deterministic reading ties', async () => {
  const { src, project } = await bound()
  const low = '01950000-0000-7000-8000-000000000001'
  const high = '01950000-0000-7000-8000-000000000002'
  await write(async (tx) => {
    for (const id of [high, low]) {
      await makePoll(tx, { id, sourceId: src.id, startedAt: ago(100), receivedAt: ago(90), outcome: 'error' })
      await makeReading(tx, {
        id,
        sourceId: src.id,
        observedAt: ago(100),
        receivedAt: ago(90),
        metric: id,
        value: id === high ? 2 : 1
      })
    }
    await makeSourceState(tx, { sourceId: src.id, state: 'fresh', since: ago(200), updatedAt: ago(200) })
  })
  const [row] = await list(project.id)
  expect(row?.latestNormalPoll?.id).toBe(high)
  expect(row?.recentErrors.map((p) => p.id)).toEqual([high, low])
  expect(row?.latestReading?.id).toBe(high)
  expect(row?.state?.since).toEqual(ago(200))
})

test('excludes polls and readings received after now while keeping a null legacy receipt unknown', async () => {
  const { src, project } = await bound()
  const expected = await write(async (tx) => {
    const legacy = await makePoll(tx, { sourceId: src.id, startedAt: ago(100), receivedAt: null })
    await makePoll(tx, { sourceId: src.id, startedAt: ago(50), receivedAt: ago(-1), outcome: 'error' })
    await makePoll(tx, { sourceId: src.id, startedAt: ago(-1), receivedAt: null, outcome: 'error' })
    const reading = await makeReading(tx, { sourceId: src.id, observedAt: ago(100), receivedAt: ago(90), value: 3 })
    await makeReading(tx, { sourceId: src.id, observedAt: ago(50), receivedAt: ago(-1), value: 4 })
    return { legacy, reading }
  })
  const [row] = await list(project.id)
  expect(row?.normalPolls).toEqual([expected.legacy])
  expect(row?.latestNormalPoll?.receivedAt).toBeNull()
  expect(row?.latestGoodNormalPoll?.id).toBe(expected.legacy.id)
  expect(row?.recentErrors).toEqual([])
  expect(row?.latestReading).toEqual(expected.reading)
})
