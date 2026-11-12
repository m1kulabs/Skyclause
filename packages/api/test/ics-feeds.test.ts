import { type Page, type Principal } from '@skyclause/contracts'
import { listIcsFeeds as route } from '@skyclause/contracts/api/v1/ics-feeds'
import { recordAudit, withTenant, type Tx } from '@skyclause/db'
import { makeIcsFeed, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import type { IcsFeedView } from '../src/services/ics-feeds'
import { encodeCursor } from '../src/pagination'
import { apiRequest, asApiKey, asSession, createTestApi, crossOrgCase, testCan, testDeps, testOrg } from './harness'

const ORG = 'ics-feeds-home'
const OTHER = 'ics-feeds-other'
const now = new Date('2026-11-12T13:13:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
const viewer = { ...asSession({ org: ORG, role: 'viewer' }), orgId: testOrg(ORG).id, role: 'viewer' as const }
const deps = testDeps({ withTenant, recordAudit, now: () => now, can: testCan })
const { v1 } = createTestApi({ deps })
const tenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal: viewer }, fn)
const request = (projectId: string, query: Record<string, string> = {}, as: Principal | undefined = viewer, app = v1) =>
  apiRequest(app, { as, org: ORG, method: 'GET', path: `/v1/projects/${projectId}/ics-feeds`, query })
const body = async (projectId: string) => {
  const response = await request(projectId)
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(route.responses[200].content['application/json'].schema.safeParse(value).success).toBe(true)
  return value as Page<IcsFeedView>
}
const project = () => tenant((tx) => makeProject(tx))
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
})

describe('listIcsFeeds', () => {
  test('a project with no calendars returns an empty page', async () => {
    const p = await project()
    expect(await body(p.id)).toEqual({ data: [], next_cursor: null })
  })
  test('calendars return oldest first by created_at, with url null for uploads and filename omitted for URLs', async () => {
    const p = await project()
    const newest = await tenant((tx) =>
      makeIcsFeed(tx, { projectId: p.id, url: null, filename: 'late.ics', createdAt: ago(100) })
    )
    const oldest = await tenant((tx) =>
      makeIcsFeed(tx, {
        projectId: p.id,
        url: 'https://calendar.example.com/a.ics',
        filename: null,
        createdAt: ago(300)
      })
    )
    const middle = await tenant((tx) =>
      makeIcsFeed(tx, { projectId: p.id, url: null, filename: 'middle.ics', createdAt: ago(200) })
    )
    expect((await body(p.id)).data).toEqual([
      { id: oldest.id, project_id: p.id, url: 'https://calendar.example.com/a.ics' },
      { id: middle.id, project_id: p.id, url: null, filename: 'middle.ics' },
      { id: newest.id, project_id: p.id, url: null, filename: 'late.ics' }
    ])
  })
  test('limit-one pagination visits each calendar once and ends with a null cursor', async () => {
    const p = await project()
    const feeds = [
      await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, createdAt: ago(300) })),
      await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, createdAt: ago(200) })),
      await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, createdAt: ago(100) }))
    ]
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const response = await request(p.id, { limit: '1', ...(cursor ? { cursor } : {}) })
      expect(response.status).toBe(200)
      const page = (await response.json()) as Page<IcsFeedView>
      seen.push(...page.data.map((row) => row.id))
      cursor = page.next_cursor
      pages += 1
    } while (cursor)
    expect(pages).toBe(3)
    expect(seen).toEqual(feeds.map((feed) => feed.id))
  })
  test('a cursor from another project is 422 with a pointer at the cursor', async () => {
    const [p, other] = await Promise.all([project(), project()])
    await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, createdAt: ago(300) }))
    await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, createdAt: ago(200) }))
    const first = (await (await request(p.id, { limit: '1' })).json()) as Page<IcsFeedView>
    expect(first.next_cursor).toEqual(expect.any(String))
    const reused = await request(other.id, { cursor: first.next_cursor! })
    expect(reused.status).toBe(422)
    expect(await reused.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
    const garbage = await request(p.id, {
      cursor: encodeCursor({ v: 1, org_id: testOrg(ORG).id, project_id: p.id, feed_id: 'x' })
    })
    expect(garbage.status).toBe(422)
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
    await crossOrgCase('listIcsFeeds', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
  })
})
