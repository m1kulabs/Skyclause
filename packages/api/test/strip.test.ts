import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import { getProjectStrip as route } from '@skyclause/contracts/api/v1/strip'
import { recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeNight,
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeSource,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asSession,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'strip-home'
const OTHER = 'strip-other'
const now = new Date('2026-11-12T13:13:00Z')
const at = (hhmm: string) => new Date(`2026-11-12T${hhmm}:00Z`)
const iso = (date: Date) => date.toISOString().replace('.000Z', 'Z')
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId: testOrg(ORG).id, role: 'viewer' as const }
const { v1 } = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: testCan }) })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: viewer }, fn)
const request = (projectId: string, as: Principal | undefined = viewer, app = v1) =>
  apiRequest(app, { as, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/strip` })
async function strip(projectId: string) {
  const response = await request(projectId)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(route.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as {
    range: { from: string; to: string }
    window: { id: string } | null
    series: Record<string, Array<[string, number | null, string]>>
    inputs: Array<{ name: string; value: unknown; state: string; source_ids: string[]; reading_ids: string[] }>
    packs: unknown[]
    verdicts: unknown[]
    nights: Array<{ id: string }>
    replay?: unknown
  }
}
const lane = (value: Awaited<ReturnType<typeof strip>>, key: string) =>
  new Map(value.series[key]!.map(([slot, number, state]) => [slot, { number, state }]))
/** A public JPS gauge bound to a new project, with 5-minute readings (`[hh:mm, mm]`) received half a minute late. */
async function gauge(readings: Array<[string, number | null]>, errors: string[] = []) {
  const p = await tenant((tx) => makeProject(tx))
  const src = await withSystem('strip-test', (tx) => makeSource(tx, { ownerOrgId: null }))
  await tenant((tx) => makeProjectSource(tx, { projectId: p.id, sourceId: src.id, role: 'rain_gauge' }))
  await withSystem('strip-test', async (tx) => {
    for (const [hhmm, value] of readings) {
      const observedAt = at(hhmm)
      await makeReading(tx, {
        sourceId: src.id,
        observedAt,
        receivedAt: new Date(observedAt.getTime() + 30_000),
        value
      })
    }
    for (const hhmm of errors)
      await makePoll(tx, {
        sourceId: src.id,
        startedAt: at(hhmm),
        receivedAt: new Date(at(hhmm).getTime() + 1000),
        httpStatus: 500,
        outcome: 'error'
      })
  })
  return { p, src }
}

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

describe('getProjectStrip', () => {
  test('range is the six hours to the request clock; no replay on live data', async () => {
    const { p } = await gauge([])
    const value = await strip(p.id)
    expect(value.range).toEqual({ from: '2026-11-12T07:13:00Z', to: '2026-11-12T13:13:00Z' })
    expect(Object.keys(value.series).sort()).toEqual(['site.rain_5m_mm', 'site.rain_60m_mm'])
    expect(value.series['site.rain_5m_mm']).toHaveLength(72)
    expect(value.series['site.rain_5m_mm']![0]![0]).toBe('2026-11-12T07:15:00Z')
    expect(value.series['site.rain_5m_mm']!.at(-1)![0]).toBe('2026-11-12T13:10:00Z')
    expect(value).not.toHaveProperty('replay')
    expect(value.verdicts).toEqual([])
    expect(value.nights).toEqual([])
  })

  test('5-minute lane carries readings; a missing slot, an error poll and the slots after the last reading are never zero', async () => {
    const rows: Array<[string, number | null]> = []
    // 11:00..12:00 at 2.5 mm with 3.5 at 12:00, 4 mm at 12:05, no 12:10, then 1 mm at 12:15 and nothing after.
    for (let minute = 11 * 60; minute <= 12 * 60 + 5; minute += 5)
      rows.push([`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, 2.5])
    rows.find(([hhmm]) => hhmm === '12:00')![1] = 3.5
    rows.find(([hhmm]) => hhmm === '12:05')![1] = 4
    rows.push(['12:15', 1])
    const { p } = await gauge(rows, ['12:10', '12:46'])
    const five = lane(await strip(p.id), 'site.rain_5m_mm')
    expect(five.get('2026-11-12T11:55:00Z')).toEqual({ number: 2.5, state: 'received' })
    expect(five.get('2026-11-12T12:05:00Z')).toEqual({ number: 4, state: 'received' })
    expect(five.get('2026-11-12T12:15:00Z')).toEqual({ number: 1, state: 'received' })
    // The hole at 12:10: its poll errored, so the gap says why. It is null, never 0.
    expect(five.get('2026-11-12T12:10:00Z')).toEqual({ number: null, state: 'error' })
    expect(five.get('2026-11-12T12:45:00Z')).toEqual({ number: null, state: 'error' })
    // Before the first reading and after the last one: gaps.
    expect(five.get('2026-11-12T10:55:00Z')).toEqual({ number: null, state: 'missed' })
    expect(five.get('2026-11-12T12:20:00Z')).toEqual({ number: null, state: 'missed' })
    expect(five.get('2026-11-12T13:10:00Z')).toEqual({ number: null, state: 'missed' })
    expect([...five.values()].some((point) => point.number === 0)).toBe(false)
  })

  test('60-minute lane is the engine rolling total: complete periods only, crossing 31 mm, holes stay null', async () => {
    const rows: Array<[string, number | null]> = []
    for (let minute = 11 * 60; minute <= 12 * 60 + 5; minute += 5)
      rows.push([`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, 2.5])
    rows.find(([hhmm]) => hhmm === '12:00')![1] = 3.5
    rows.find(([hhmm]) => hhmm === '12:05')![1] = 4
    rows.push(['12:15', 1])
    const { p } = await gauge(rows)
    const sixty = lane(await strip(p.id), 'site.rain_60m_mm')
    // Fewer than twelve samples in the hour: not a total yet. 11:00..11:55 is the first complete hour, 12 x 2.5.
    expect(sixty.get('2026-11-12T11:50:00Z')).toEqual({ number: null, state: 'missed' })
    expect(sixty.get('2026-11-12T11:55:00Z')).toEqual({ number: 30, state: 'received' })
    // 11:05..12:00 is 11 x 2.5 + 3.5 = 31, over 30 mm by the 12:00 reading.
    expect(sixty.get('2026-11-12T12:00:00Z')).toEqual({ number: 31, state: 'received' })
    // 11:10..12:05 is 10 x 2.5 + 3.5 + 4: the total has crossed 31 mm.
    expect(sixty.get('2026-11-12T12:05:00Z')).toEqual({ number: 32.5, state: 'received' })
    // 12:10 has no reading, so it and every hour containing it stay null; so do the slots after the last reading.
    for (const slot of ['12:10', '12:15', '12:20', '13:10'])
      expect(sixty.get(`2026-11-12T${slot}:00Z`)).toEqual({ number: null, state: 'missed' })
  })

  test('60-minute lane matches the evaluator input, and inputs carry the same source and reading ids', async () => {
    const rows: Array<[string, number | null]> = []
    for (let minute = 12 * 60 + 15; minute <= 13 * 60 + 10; minute += 5)
      rows.push([`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`, 1])
    const { p, src } = await gauge(rows)
    const value = await strip(p.id)
    expect(lane(value, 'site.rain_60m_mm').get('2026-11-12T13:10:00Z')).toEqual({ number: 12, state: 'received' })
    const input = value.inputs.find((candidate) => candidate.name === 'site.rain_60m_mm')
    expect(input).toMatchObject({ value: 12, state: 'fresh', source_ids: [src.id] })
    expect(input!.reading_ids).toHaveLength(12)
  })

  test('a project with no bound JPS source has empty lanes, no inputs values and no window', async () => {
    const p = await tenant((tx) => makeProject(tx))
    const value = await strip(p.id)
    expect(value.series).toEqual({ 'site.rain_5m_mm': [], 'site.rain_60m_mm': [] })
    expect(value.window).toBeNull()
    expect(value.inputs.every((input) => input.value === null)).toBe(true)
    expect(value.packs).toEqual([{ pack: 'sky', basis: null, call_id: null, mode: null, watch: false, no_call: null }])
  })

  test('a gauge of another organisation project or a private one is not this project rain', async () => {
    const { p } = await gauge([['13:10', 5]])
    const stranger = await tenant((tx) => makeProject(tx))
    await withSystem('strip-test', (tx) => makeReading(tx, { observedAt: at('13:10'), value: 9 }))
    expect((await strip(stranger.id)).series['site.rain_5m_mm']).toEqual([])
    expect(lane(await strip(p.id), 'site.rain_5m_mm').get('2026-11-12T13:10:00Z')?.number).toBe(5)
  })

  test('window is the soonest visible non-cancelled one not ended before the range, else null', async () => {
    const p = await tenant((tx) => makeProject(tx))
    expect((await strip(p.id)).window).toBeNull()
    const [ended, cancelled, later, soon] = await tenant(async (tx) => [
      await makeWindow(tx, { projectId: p.id, startsAt: at('04:00'), endsAt: at('05:00') }),
      await makeWindow(tx, { projectId: p.id, startsAt: at('08:00'), endsAt: at('09:00'), cancelledAt: at('07:00') }),
      await makeWindow(tx, { projectId: p.id, startsAt: at('15:00'), endsAt: at('16:00') }),
      await makeWindow(tx, { projectId: p.id, startsAt: at('12:00'), endsAt: at('14:00') })
    ])
    await tenant((tx) =>
      makeWindow(tx, {
        projectId: p.id,
        startsAt: at('10:00'),
        endsAt: at('11:00'),
        moderation: 'hidden_pending_review'
      })
    )
    const value = await strip(p.id)
    expect(value.window).toMatchObject({
      id: soon!.id,
      starts_at: iso(at('12:00')),
      ends_at: iso(at('14:00')),
      cancelled_at: null
    })
    expect([ended!.id, cancelled!.id, later!.id]).not.toContain(value.window!.id)
  })

  test('nights overlapping the range are listed; a night with unknown times is not', async () => {
    const p = await tenant((tx) => makeProject(tx))
    const times = (day: string) => ({
      doors: new Date(`${day}T10:00:00Z`),
      show: new Date(`${day}T12:00:00Z`),
      arrivalStart: new Date(`${day}T09:00:00Z`),
      arrivalEnd: new Date(`${day}T11:30:00Z`)
    })
    const inRange = await tenant((tx) => makeNight(tx, { projectId: p.id, date: '2026-11-12', ...times('2026-11-12') }))
    await tenant((tx) => makeNight(tx, { projectId: p.id, date: '2026-11-14', ...times('2026-11-14') }))
    await tenant((tx) => makeNight(tx, { projectId: p.id, date: '2026-11-12' }))
    expect((await strip(p.id)).nights.map((night) => night.id)).toEqual([inRange.id])
  })

  test('permission and tenancy follow listProjectSources: viewer reads; missing project.view is 403; foreign project is 404', async () => {
    const p = await tenant((tx) => makeProject(tx))
    expect((await request(p.id, viewer)).status).toBe(200)
    expect((await request(p.id, asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }))).status).toBe(200)
    const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: () => false }) }).v1
    expect((await request(p.id, viewer, denied)).status).toBe(403)
    expect((await request(p.id, asDevice({ org: ORG }))).status).toBe(403)
    expect((await request(p.id, asApiKey({ org: ORG, role: 'viewer', scopes: [] }))).status).toBe(403)
    expect((await apiRequest(v1, { org: ORG, method: 'GET', path: `/v1/projects/${p.id}/strip` })).status).toBe(401)
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    await crossOrgCase('getProjectStrip', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
    expect((await request(randomUUID())).status).toBe(404)
    for (const id of [foreign.id, randomUUID()]) expect((await request(id, viewer, denied)).status).toBe(403)
  })
})
