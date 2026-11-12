import { type Page } from '@skyclause/contracts'
import { listProjectDays as route } from '@skyclause/contracts/api/v1/days'
import { recordAudit, withSystem, withTenant, type Tx } from '@skyclause/db'
import {
  makeOrganization,
  makePoll,
  makeProject,
  makeProjectSource,
  makeReading,
  makeSource,
  makeWindow
} from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import type { ProjectDayView } from '../src'
import { encodeCursor } from '../src/pagination'
import {
  apiRequest,
  asApiKey,
  asDevice,
  createTestApi,
  crossOrgCase,
  asSession,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'days-home'
const OTHER = 'days-other'
// 21:13 on 12 November in Kuala Lumpur, 13:13 UTC.
const now = new Date('2026-11-12T13:13:00Z')
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId: testOrg(ORG).id, role: 'viewer' as const }
const deps = testDeps({ withTenant, recordAudit, now: () => now, can: testCan })
const { v1 } = createTestApi({ deps })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: viewer }, fn)
const request = (
  projectId: string,
  query: Record<string, string> = {},
  as = viewer as Parameters<typeof apiRequest>[1]['as']
) => apiRequest(v1, { as, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/days`, query })
async function days(projectId: string, query: Record<string, string> = {}) {
  const response = await request(projectId, query)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(route.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as Page<ProjectDayView>
}
const project = (overrides = {}) => tenant((tx) => makeProject(tx, overrides))
const bind = (projectId: string, sourceId: string, role: 'api_station' | 'met_forecast' = 'api_station') =>
  tenant((tx) => makeProjectSource(tx, { projectId, sourceId, role }))
const catalogue = (overrides = {}) => withSystem('days-test', (tx) => makeSource(tx, overrides))
const row = (page: Page<ProjectDayView>, date: string) => page.data.find((day) => day.date === date)!

const forecast = (date: string, afternoon: string, value: 0 | 1, extra = {}) => ({
  metric: 'forecast_day',
  unit: null,
  observedAt: new Date(`${date}T00:00:00+08:00`),
  value,
  valueText: afternoon,
  valueJson: {
    location: { location_id: 'Ds001', location_name: 'Shah Alam' },
    date,
    morning_forecast: 'Tiada hujan',
    afternoon_forecast: afternoon,
    night_forecast: 'Tiada hujan',
    summary_forecast: 'Hujan',
    summary_when: 'Petang',
    min_temp: 24,
    max_temp: 33,
    gloss_en: { afternoon_forecast: 'Thunderstorms in some places' }
  },
  itemKey: date,
  receivedAt: new Date('2026-11-12T12:00:00Z'),
  ...extra
})

beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

describe('listProjectDays', () => {
  test('lists one row per local date from six days back to thirteen ahead, zero-filled, in order', async () => {
    const p = await project()
    const result = await days(p.id, { limit: '200' })
    expect(result.next_cursor).toBeNull()
    expect(result.data).toHaveLength(20)
    expect(result.data[0]).toEqual({
      date: '2026-11-06',
      reading_count: 0,
      error_count: 0,
      window_count: 0,
      storm_afternoon: null
    })
    expect(result.data.map((day) => day.date)).toEqual(
      Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 10, 6 + i)).toISOString().slice(0, 10))
    )
  })

  test('counts readings, error polls and windows on the project local date across the UTC midnight', async () => {
    const p = await project()
    const src = await catalogue()
    const unbound = await catalogue()
    await bind(p.id, src.id)
    await withSystem('days-test', async (tx) => {
      const at = (iso: string) => makeReading(tx, { sourceId: src.id, observedAt: new Date(iso), value: 1 })
      await at('2026-11-11T16:00:00Z') // 00:00 MYT on the 12th
      await at('2026-11-12T15:59:59Z') // 23:59:59 MYT on the 12th
      await at('2026-11-12T16:30:00Z') // 00:30 MYT on the 13th, still the 12th in UTC
      await at('2026-11-11T15:59:59Z') // 23:59:59 MYT on the 11th
      await at('2026-11-05T01:00:00Z') // before the listed range
      // A re-fetched revision of the same observation is one reading.
      await makeReading(tx, {
        sourceId: src.id,
        observedAt: new Date('2026-11-12T15:59:59Z'),
        value: 2,
        revision: 1
      })
      await makeReading(tx, { sourceId: unbound.id, observedAt: new Date('2026-11-12T01:00:00Z') })
      const errorAt = (iso: string, outcome = 'error') =>
        makePoll(tx, {
          sourceId: src.id,
          startedAt: new Date(iso),
          outcome,
          httpStatus: outcome === 'error' ? 503 : 200
        })
      await errorAt('2026-11-12T16:10:00Z') // the 13th in MYT
      await errorAt('2026-11-12T10:00:00Z')
      await errorAt('2026-11-12T11:00:00Z', 'ok')
      await makePoll(tx, { sourceId: unbound.id, startedAt: new Date('2026-11-12T10:00:00Z'), outcome: 'error' })
    })
    await tenant(async (tx) => {
      const win = (startsAt: string, overrides = {}) =>
        makeWindow(tx, {
          projectId: p.id,
          startsAt: new Date(startsAt),
          endsAt: new Date(new Date(startsAt).getTime() + 3600_000),
          ...overrides
        })
      await win('2026-11-12T15:30:00Z') // 23:30 MYT on the 12th
      await win('2026-11-12T16:30:00Z') // 00:30 MYT on the 13th
      await win('2026-11-12T17:30:00Z', { cancelledAt: new Date('2026-11-10T00:00:00Z') })
      await makeWindow(tx, { startsAt: new Date('2026-11-12T15:30:00Z') }) // another project's
    })
    const result = await days(p.id, { limit: '200' })
    expect(row(result, '2026-11-11')).toMatchObject({ reading_count: 1, error_count: 0, window_count: 0 })
    expect(row(result, '2026-11-12')).toMatchObject({ reading_count: 2, error_count: 1, window_count: 1 })
    expect(row(result, '2026-11-13')).toMatchObject({ reading_count: 1, error_count: 1, window_count: 1 })
    expect(row(result, '2026-11-06').reading_count).toBe(0)
  })

  test("uses the project's own time zone for the dates", async () => {
    const p = await project({ timeZone: 'UTC' })
    const src = await catalogue()
    await bind(p.id, src.id)
    await withSystem('days-test', (tx) =>
      makeReading(tx, { sourceId: src.id, observedAt: new Date('2026-11-12T16:30:00Z') })
    )
    const result = await days(p.id, { limit: '200' })
    expect(row(result, '2026-11-12').reading_count).toBe(1)
    expect(row(result, '2026-11-13').reading_count).toBe(0)
  })

  test('storm_afternoon quotes the stored MET wording and the source URL; no storm and no forecast are null', async () => {
    const p = await project()
    const met = await catalogue({
      kind: 'met_forecast',
      url: 'https://api.data.gov.my/weather/forecast/',
      cadenceS: 21600
    })
    await bind(p.id, met.id, 'met_forecast')
    await withSystem('days-test', async (tx) => {
      const put = (f: ReturnType<typeof forecast>) => makeReading(tx, { sourceId: met.id, ...f })
      await put(forecast('2026-11-13', 'Ribut petir di beberapa tempat', 1))
      await put(forecast('2026-11-14', 'Tiada hujan', 0))
      // A later fetch retracts the storm for the 15th: the newest revision wins.
      await put(forecast('2026-11-15', 'Ribut petir', 1))
      await put(forecast('2026-11-15', 'Tiada hujan', 0, { revision: 1 }))
    })
    const result = await days(p.id, { limit: '200' })
    expect(row(result, '2026-11-13').storm_afternoon).toEqual({
      wording: 'Ribut petir di beberapa tempat',
      source_url: 'https://api.data.gov.my/weather/forecast/'
    })
    expect(row(result, '2026-11-14').storm_afternoon).toBeNull()
    expect(row(result, '2026-11-15').storm_afternoon).toBeNull()
    expect(row(result, '2026-11-16').storm_afternoon).toBeNull()
    expect(result.data.filter((day) => day.storm_afternoon)).toHaveLength(1)
  })

  test("another project's forecast and an unbound forecast source give no storm", async () => {
    const [p, other] = await Promise.all([project(), project()])
    const met = await catalogue({ kind: 'met_forecast' })
    await bind(other.id, met.id, 'met_forecast')
    await withSystem('days-test', (tx) =>
      makeReading(tx, { sourceId: met.id, ...forecast('2026-11-13', 'Ribut petir', 1) })
    )
    expect((await days(p.id, { limit: '200' })).data.every((day) => day.storm_afternoon === null)).toBe(true)
    expect(row(await days(other.id, { limit: '200' }), '2026-11-13').storm_afternoon).not.toBeNull()
  })

  test('paginates by date with limit=5 and a cursor bound to its project', async () => {
    const p = await project()
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const result: Page<ProjectDayView> = await days(p.id, cursor ? { limit: '5', cursor } : { limit: '5' })
      expect(result.data).toHaveLength(5)
      seen.push(...result.data.map((day) => day.date))
      cursor = result.next_cursor
      pages++
    } while (cursor)
    expect(pages).toBe(4)
    expect(seen).toEqual((await days(p.id, { limit: '200' })).data.map((day) => day.date))
    expect(new Set(seen).size).toBe(20)

    const first = await days(p.id, { limit: '5' })
    const other = await project()
    expect((await request(other.id, { limit: '5', cursor: first.next_cursor! })).status).toBe(422)
    const foreignOrg = encodeCursor({ v: 1, org_id: testOrg(OTHER).id, project_id: p.id, date: '2026-11-10' })
    expect((await request(p.id, { cursor: foreignOrg })).status).toBe(422)
    expect((await request(p.id, { cursor: 'not-a-cursor' })).status).toBe(422)
    expect((await request(p.id, { limit: '0' })).status).toBe(422)
  })

  test('a viewer may read; keys without project.view and devices get 403; another organisation gets 404', async () => {
    const p = await project()
    expect((await request(p.id)).status).toBe(200)
    expect((await request(p.id, {}, asApiKey({ org: ORG, role: 'viewer', scopes: ['read'] }))).status).toBe(200)
    expect((await request(p.id, {}, asApiKey({ org: ORG, role: 'viewer', scopes: [] }))).status).toBe(403)
    expect((await request(p.id, {}, asDevice({ org: ORG }))).status).toBe(403)
    const denied = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: () => false }) }).v1
    expect(
      (await apiRequest(denied, { as: viewer, org: ORG, method: 'GET', path: `/v1/projects/${p.id}/days` })).status
    ).toBe(403)
    expect((await apiRequest(v1, { org: ORG, method: 'GET', path: `/v1/projects/${p.id}/days` })).status).toBe(401)
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    await crossOrgCase('listProjectDays', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
  })
})
