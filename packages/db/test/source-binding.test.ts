import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, test } from 'vitest'
import * as db from '../src'
import { makeOrganization, makePoll, makeProject, makeReading, makeSource, makeSourceState } from './factories'
import { memberOf } from './harness'
import { capturedCa16w } from './source-binding-capture'

let orgId: string
const tenant = <T>(fn: (tx: db.Tx) => Promise<T>) => db.withTenant({ orgId, principal: memberOf(orgId) }, fn)
beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

describe('catalogue', () => {
  test('real_capture_distance_and_age', async () => {
    const capture = capturedCa16w()
    const src = await db.withSystem('catalogue-test', async (tx) => {
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
    const [row] = await tenant((tx) =>
      db.listSourcePickerRecords(tx, { kind: 'apims', near: { lat: 3.0559, lon: 101.6997 }, limit: 50 })
    )
    expect(row?.source.id).toBe(src.id)
    expect(row?.distanceKm).toBeGreaterThanOrEqual(5.6)
    expect(row?.distanceKm).toBeLessThanOrEqual(6.2)
    expect(row?.latestReading?.value).toBe(67)
  })

  test('null_coordinate_state_reading', async () => {
    const src = await db.withSystem('catalogue-test', (tx) => makeSource(tx, { lat: null, lon: null, licenceId: null }))
    const rows = await tenant((tx) =>
      db.listSourcePickerRecords(tx, { limit: 200, near: { lat: 3.0559, lon: 101.6997 } })
    )
    expect(rows.find((row) => row.source.id === src.id)).toMatchObject({
      distanceKm: null,
      state: null,
      latestReading: null
    })
  })

  test('literal_name_station_search', async () => {
    const tag = randomUUID()
    const src = await db.withSystem('catalogue-test', async (tx) => {
      const src = await makeSource(tx, { name: `${tag} 100%_\\`, externalId: `STATION-${tag}` })
      await makeSource(tx, { name: `${tag} 100 plain` })
      return src
    })
    for (const q of ['%', '_', '\\', `station-${tag}`]) {
      const rows = await tenant((tx) => db.listSourcePickerRecords(tx, { q, limit: 200 }))
      expect(rows.map((r) => r.source.id)).toEqual([src.id])
    }
  })

  test('distance_ties_cursor_filters', async () => {
    const q = randomUUID()
    const sources = await db.withSystem('catalogue-test', async (tx) => {
      const rows = []
      for (const located of [true, true, false, false])
        rows.push(await makeSource(tx, { name: q, lat: located ? 3 : null, lon: located ? 101 : null }))
      return rows
    })
    const near = { lat: 3, lon: 101 }
    const seen: string[] = []
    let cursor: { distanceKm: number | null; id: string } | undefined
    for (let i = 0; i < sources.length; i++) {
      const [row] = await tenant((tx) => db.listSourcePickerRecords(tx, { q, near, limit: 1, cursor }))
      seen.push(row!.source.id)
      cursor = { distanceKm: row!.distanceKm, id: row!.source.id }
    }
    const expected = sources.sort((a, b) => Number(a.lat === null) - Number(b.lat === null) || a.id.localeCompare(b.id))
    expect(seen).toEqual(expected.map((s) => s.id))
    expect(await tenant((tx) => db.listSourcePickerRecords(tx, { q, near, limit: 1, cursor }))).toEqual([])
  })

  test('device_owner_scope', async () => {
    const [a, b] = await tenant(async (tx) => [await makeProject(tx), await makeProject(tx)])
    const foreignOrg = await makeOrganization()
    const foreign = await db.withTenant({ orgId: foreignOrg.id, principal: memberOf(foreignOrg.id) }, (tx) =>
      makeProject(tx)
    )
    const q = randomUUID()
    const devices = await tenant(async (tx) => {
      const rows = []
      for (const kind of ['camera', 'pi'] as const) {
        for (const meta of [
          { project_id: a.id },
          { project_id: b.id },
          {},
          { project_id: 'bad' },
          { project_id: randomUUID() },
          { project_id: foreign.id },
          { project_id: 42 }
        ]) {
          rows.push(await makeSource(tx, { kind, name: q, meta }))
        }
      }
      return rows
    })
    await db.withSystem('catalogue-test', (tx) => makeSource(tx, { kind: 'camera', name: q }))
    const scoped = await tenant((tx) => db.listSourcePickerRecords(tx, { q, limit: 200, projectIds: [a.id] }))
    expect(scoped.map((r) => r.source.id).sort()).toEqual([devices[0]!.id, devices[7]!.id].sort())
    const all = await tenant((tx) => db.listSourcePickerRecords(tx, { q, limit: 200 }))
    expect(all).toHaveLength(4)
    expect(await tenant((tx) => db.listSourcePickerRecords(tx, { q, limit: 200, projectIds: [] }))).toEqual([])
  })

  test('error state retains reading and projects only five newest error polls', async () => {
    const src = await db.withSystem('catalogue-test', async (tx) => {
      const src = await makeSource(tx)
      await makeSourceState(tx, { sourceId: src.id, state: 'error', httpStatus: 503 })
      const observedAt = new Date('2026-11-05T13:00:00Z')
      for (const revision of [0, 2, 1])
        await makeReading(tx, { sourceId: src.id, observedAt, receivedAt: observedAt, revision, value: revision })
      for (let i = 0; i < 7; i++)
        await makePoll(tx, {
          sourceId: src.id,
          outcome: 'error',
          startedAt: new Date(observedAt.getTime() + i * 1000),
          httpStatus: 503
        })
      await makePoll(tx, { sourceId: src.id, outcome: 'ok' })
      return src
    })
    const row = await tenant((tx) => db.sourceProjection(tx, src.id))
    expect(row?.state?.state).toBe('error')
    expect(row?.latestReading?.value).toBe(2)
    expect(row?.recentErrors).toHaveLength(5)
    expect(row?.recentErrors.map((p) => p.startedAt.getUTCSeconds())).toEqual([6, 5, 4, 3, 2])
    expect(await tenant((tx) => db.sourceProjection(tx, randomUUID()))).toBeNull()
  })
})
