import { type Page, type Principal } from '@skyclause/contracts'
import { listNights as route } from '@skyclause/contracts/api/v1/nights'
import { recordAudit, withTenant, type Tx } from '@skyclause/db'
import { makeForecast, makeNight, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import type { NightView } from '../src/services/nights'
import { encodeCursor } from '../src/pagination'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testCan, testDeps, testOrg } from './harness'

const ORG = 'nights-home'
const OTHER = 'nights-other'
const now = new Date('2026-11-12T13:13:00Z')
const at = (iso: string) => new Date(iso)
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId: testOrg(ORG).id, role: 'viewer' as const }
const deps = testDeps({ withTenant, recordAudit, now: () => now, can: testCan })
const { v1 } = createTestApi({ deps })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: viewer }, fn)
const request = (projectId: string, query: Record<string, string> = {}, as: Principal | undefined = viewer, app = v1) =>
  apiRequest(app, { as, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/nights`, query })
const body = async (projectId: string) => {
  const response = await request(projectId)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(route.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as Page<NightView>
}
const project = () => tenant((tx) => makeProject(tx))
/** A night with its arrival period set, as a listed night has. */
const timed = (projectId: string, date: string, overrides: Record<string, unknown> = {}) =>
  tenant((tx) =>
    makeNight(tx, {
      projectId,
      date,
      doors: at(`${date}T19:00:00Z`),
      show: at(`${date}T19:30:00Z`),
      arrivalStart: at(`${date}T18:00:00Z`),
      arrivalEnd: at(`${date}T20:00:00Z`),
      ...overrides
    })
  )
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

describe('listNights', () => {
  test('a project with no nights returns an empty page', async () => {
    const p = await project()
    expect(await body(p.id)).toEqual({ data: [], next_cursor: null })
  })
  test('nights return in date order with their newest forecast, or null without one', async () => {
    const p = await project()
    const later = await timed(p.id, '2026-11-20', {
      exitStart: at('2026-11-21T00:30:00Z'),
      exitEnd: at('2026-11-21T01:00:00Z')
    })
    const earlier = await timed(p.id, '2026-11-14')
    await tenant((tx) =>
      makeForecast(tx, { nightId: earlier.id, forecast: 3000, createdAt: at('2026-11-10T09:00:00Z') })
    )
    const newest = await tenant((tx) =>
      makeForecast(tx, {
        nightId: earlier.id,
        forecast: 4200,
        bandLow: 3900,
        bandHigh: 4500,
        method: 'crowd-v2',
        readingIds: [],
        createdAt: at('2026-11-11T09:00:00Z')
      })
    )
    const rows = (await body(p.id)).data
    expect(rows.map((row) => row.id)).toEqual([earlier.id, later.id])
    expect(rows[0]).toMatchObject({
      project_id: p.id,
      date: '2026-11-14',
      state: 'upcoming',
      doors: '2026-11-14T19:00:00Z',
      show: '2026-11-14T19:30:00Z',
      arrival_start: '2026-11-14T18:00:00Z',
      arrival_end: '2026-11-14T20:00:00Z',
      exit_start: null,
      exit_end: null,
      forecast: {
        id: newest.id,
        night_id: earlier.id,
        forecast: 4200,
        band_low: 3900,
        band_high: 4500,
        method: 'crowd-v2',
        reading_ids: [],
        created_at: '2026-11-11T09:00:00Z'
      }
    })
    expect(rows[1]).toMatchObject({
      date: '2026-11-20',
      exit_start: '2026-11-21T00:30:00Z',
      exit_end: '2026-11-21T01:00:00Z',
      forecast: null
    })
  })
  test('a night without its arrival period (an unlisted surge) is left out', async () => {
    const p = await project()
    const listed = await timed(p.id, '2026-11-14')
    await tenant((tx) => makeNight(tx, { projectId: p.id, date: '2026-11-15', state: 'unlisted' }))
    expect((await body(p.id)).data.map((row) => row.id)).toEqual([listed.id])
  })
  test('limit-one pagination visits each night once and ends with a null cursor', async () => {
    const p = await project()
    const nights = [await timed(p.id, '2026-11-14'), await timed(p.id, '2026-11-15'), await timed(p.id, '2026-11-16')]
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const response = await request(p.id, { limit: '1', ...(cursor ? { cursor } : {}) })
      expect(response.status).toBe(200)
      const page = (await response.json()) as Page<NightView>
      seen.push(...page.data.map((row) => row.id))
      cursor = page.next_cursor
      pages += 1
    } while (cursor)
    expect(pages).toBe(3)
    expect(seen).toEqual(nights.map((night) => night.id))
  })
  test('a cursor from another project is 422 with a pointer at the cursor', async () => {
    const [p, other] = await Promise.all([project(), project()])
    await timed(p.id, '2026-11-14')
    await timed(p.id, '2026-11-15')
    const first = (await (await request(p.id, { limit: '1' })).json()) as Page<NightView>
    const reused = await request(other.id, { cursor: first.next_cursor! })
    expect(reused.status).toBe(422)
    expect(await reused.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
    const forged = await request(p.id, {
      cursor: encodeCursor({ v: 1, org_id: testOrg(ORG).id, project_id: p.id, night_id: 'x' })
    })
    expect(forged.status).toBe(422)
  })
  test('a viewer may read; a principal without project.view gets 403 before the project is looked up', async () => {
    const p = await project()
    expect((await request(p.id)).status).toBe(200)
    const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: () => false }) }).v1
    expect((await request(p.id, {}, viewer, denied)).status).toBe(403)
    expect((await request(p.id, {}, asApiKey({ org: ORG, role: 'viewer', scopes: [] }))).status).toBe(403)
  })
  test("another organisation's project is 404", async () => {
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    await crossOrgCase('listNights', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
  })
})
