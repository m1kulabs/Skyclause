import { NotBuiltError, type Page, type Principal } from '@skyclause/contracts'
import { listIcsFeeds as route } from '@skyclause/contracts/api/v1/ics-feeds'
import { recordAudit, withTenant, type Tx } from '@skyclause/db'
import { makeIcsFeed, makeOrganization, makeProject, makeWindow } from '@skyclause/db/test/factories/index'
import { beforeAll, describe, expect, test } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { claimDueIcsFeeds, domainEvent, icsFeed, window, windowSeries } from '@skyclause/db'
import {
  applyCalendar,
  MissingCalendarDocumentError,
  recordCalendarFailure
} from '../src/services/windows/apply-calendar'
import { UnsafeUrlError } from '@skyclause/config/net'
import type { IcsFeedView } from '../src/services/ics-feeds'
import { encodeCursor } from '../src/pagination'
import {
  apiRequest,
  asApiKey,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testCan,
  testDeps,
  testOrg
} from './harness'
const { can: canonicalCan } = (await import(new URL('../../auth/src/can.ts', import.meta.url).href)) as {
  can: import('@skyclause/contracts').Can
}

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
  test('viewer cannot read a calendar capability URL or filename', async () => {
    const p = await project()
    await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, url: 'https://calendar.example.com/private?secret=abc' }))
    await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, url: null, filename: 'private.ics' }))
    const feeds = (await body(p.id)).data
    expect(feeds).toHaveLength(2)
    expect(feeds.every((feed) => feed.url === null && !('filename' in feed))).toBe(true)
  })
  test('a read-only editor credential cannot read calendar secrets', async () => {
    const p = await project()
    await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, url: 'https://calendar.example.com/private?secret=abc' }))
    const response = await request(p.id, {}, asApiKey({ org: ORG, role: 'editor', scopes: ['read'] }))
    expect(response.status).toBe(200)
    expect(((await response.json()) as Page<IcsFeedView>).data[0]?.url).toBeNull()
  })
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
    const member = asSession({ org: ORG, role: 'editor' })
    const response = await request(p.id, {}, member)
    expect(response.status).toBe(200)
    expect(((await response.json()) as Page<IcsFeedView>).data).toMatchObject([
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
  test('list rejects unknown query fields', async () => {
    const p = await project()
    expect((await request(p.id, { org_id: 'spoof' })).status).toBe(422)
  })
  test("another organisation's project is 404", async () => {
    const foreign = await withTenant(
      { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
      (tx) => makeProject(tx)
    )
    await crossOrgCase('listIcsFeeds', { app: v1, as: viewer, org: ORG, params: { id: foreign.id } }).run()
  })
})

test('URL registration is pending, creates no windows, performs no HTTP and replays the original response', async () => {
  const p = await project()
  let requests = 0
  const api = createTestApi({
    deps: testDeps({
      withTenant,
      recordAudit,
      now: () => now,
      can: testCan,
      calendarTransport: {
        assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
        safeFetch: async () => {
          requests++
          throw new Error('HTTP must not run during registration')
        }
      }
    })
  }).v1
  const key = randomUUID()
  const send = () =>
    apiRequest(api, {
      as: asSession({ org: ORG, role: 'editor' }),
      org: ORG,
      method: 'POST',
      path: `/v1/projects/${p.id}/ics-feeds`,
      body: { url: 'https://calendar.example.org/private?token=secret' },
      idempotencyKey: key
    })
  const first = await send()
  expect(first.status).toBe(201)
  const value = await first.json()
  expect(value).toMatchObject({
    project_id: p.id,
    status: 'pending',
    kind: 'class',
    refreshed_at: null,
    last_attempt_at: null
  })
  const replay = await send()
  expect(replay.status).toBe(201)
  expect(await replay.json()).toEqual(value)
  expect(requests).toBe(0)
  const feeds = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))
  expect(feeds).toHaveLength(1)
  expect(feeds[0]).toMatchObject({ document: null, refreshedAt: null, lastAttemptAt: null, nextRefreshAt: now })
  expect(await tenant((tx) => tx.select().from(window).where(eq(window.projectId, p.id)))).toHaveLength(0)
})

test('ordinary member may import an empty calendar without creating windows', async () => {
  const p = await project()
  const app = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => now, can: canonicalCan }) }).v1
  const response = await apiRequest(app, {
    as: asApiKey({ org: ORG, role: 'editor', scopes: ['read', 'draft'] }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { file: { name: 'empty.ics', content: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n' } }
  })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ status: 'ready' })
  expect(await tenant((tx) => tx.select().from(window).where(eq(window.projectId, p.id)))).toEqual([])
})

test('file import applies its occurrences before returning ready without HTTP', async () => {
  const p = await project()
  const api = createTestApi({
    deps: testDeps({
      withTenant,
      recordAudit,
      now: () => now,
      can: testCan,
      calendarTransport: {
        assertPublicUrl: async () => {
          throw new Error('unexpected URL preflight')
        },
        safeFetch: async () => {
          throw new Error('unexpected HTTP')
        }
      }
    })
  }).v1
  const response = await apiRequest(api, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: {
      file: {
        name: 'class.ics',
        content: [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'BEGIN:VEVENT',
          'UID:CaseSensitive',
          'DTSTART:20261114T100000Z',
          'DTEND:20261114T110000Z',
          'SUMMARY:Lecture',
          'END:VEVENT',
          'END:VCALENDAR',
          ''
        ].join('\r\n')
      }
    }
  })
  expect(response.status).toBe(201)
  const value = await response.json()
  expect(value).toMatchObject({ status: 'ready', filename: 'class.ics', kind: 'class' })
  const [storedFeed] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))
  expect(storedFeed?.nextRefreshAt).toEqual(new Date('2026-11-12T16:00:00Z'))
  const rows = await tenant((tx) => tx.select().from(window).where(eq(window.projectId, p.id)))
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    icsUid: 'CaseSensitive',
    title: 'Lecture',
    startsAt: new Date('2026-11-14T10:00:00Z')
  })
})

test('file extension is due at the next local date across a DST change', async () => {
  const p = await tenant((tx) => makeProject(tx, { timeZone: 'America/New_York' }))
  const at = new Date('2026-03-08T04:30:00Z')
  const api = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => at, can: testCan }) }).v1
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:dst',
    'DTSTART:20260309T100000Z',
    'DTEND:20260309T110000Z',
    'SUMMARY:Lecture',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
  const response = await apiRequest(api, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { file: { name: 'dst.ics', content } }
  })
  expect(response.status).toBe(201)
  const [feed] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))
  expect(feed?.nextRefreshAt).toEqual(new Date('2026-03-08T05:00:00Z'))
})

test('a due file claim extends from the retained document without HTTP and schedules the next local day', async () => {
  const p = await project()
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:file',
    'DTSTART:20261114T100000Z',
    'DTEND:20261114T110000Z',
    'SUMMARY:Lecture',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n')
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { file: { name: 'file.ics', content } }
  })
  expect(response.status).toBe(201)
  const due = new Date('2026-11-12T16:00:00Z')
  expect(await tenant((tx) => claimDueIcsFeeds(tx, { projectId: p.id, now, includeFiles: true }))).toEqual([])
  const [claim] = await tenant((tx) => claimDueIcsFeeds(tx, { projectId: p.id, now: due, includeFiles: true }))
  expect(claim?.url).toBeNull()
  const result = await tenant((tx) =>
    applyCalendar(
      { tx, principal: viewer },
      { feedId: claim!.feedId, claimId: claim!.claimId, now: due, result: { status: 'unchanged' } }
    )
  )
  expect(result.status).toBe('applied')
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, claim!.feedId)))
  expect(stored).toMatchObject({ lastAttemptAt: due, nextRefreshAt: new Date('2026-11-13T16:00:00Z') })
})

test('a malformed upload rolls back its feed and creates no windows', async () => {
  const p = await project()
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { file: { name: 'bad.ics', content: 'not a calendar' } }
  })
  expect(response.status).toBe(422)
  expect(await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))).toHaveLength(0)
  expect(await tenant((tx) => tx.select().from(window).where(eq(window.projectId, p.id)))).toHaveLength(0)
})

test('unsafe URL preflight returns a sanitized 422 and stores nothing', async () => {
  const p = await project()
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { url: 'https://127.0.0.1/private?token=secret' }
  })
  expect(response.status).toBe(422)
  const problem = JSON.stringify(await response.json())
  expect(problem).toContain('unsafe-url')
  expect(problem).not.toContain('secret')
  expect(await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))).toHaveLength(0)
})

test('URL registration strips userinfo before storing the capability URL', async () => {
  const p = await project()
  const api = createTestApi({
    deps: testDeps({
      withTenant,
      recordAudit,
      now: () => now,
      can: testCan,
      calendarTransport: {
        assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
        safeFetch: async () => {
          throw new Error('unexpected HTTP')
        }
      }
    })
  }).v1
  const response = await apiRequest(api, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    idempotencyKey: randomUUID(),
    body: { url: 'https://user:password@calendar.example.org/private?token=secret' }
  })
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ url: 'https://calendar.example.org/private?token=secret' })
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.projectId, p.id)))
  expect(stored?.url).toBe('https://calendar.example.org/private?token=secret')
})

test('legacy userinfo is removed even when a declarer reads the feed', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, url: 'https://user:password@calendar.example.org/private?token=secret' })
  )
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'GET',
    path: `/v1/ics-feeds/${feed.id}`
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ url: 'https://calendar.example.org/private?token=secret' })
})

test('URL registration replay rechecks the OAuth project scope', async () => {
  const p = await project()
  const api = createTestApi({
    deps: testDeps({
      withTenant,
      recordAudit,
      now: () => now,
      can: canonicalCan,
      calendarTransport: {
        assertPublicUrl: async (url) => ({ url: new URL(url), addresses: ['192.0.2.1'] }),
        safeFetch: async () => {
          throw new Error('unexpected HTTP')
        }
      }
    })
  }).v1
  const grant = asOAuth({ org: ORG, role: 'editor', scopes: ['draft'], projectIds: [p.id] })
  if (grant.kind !== 'oauth') throw new Error('OAuth fixture required')
  const key = randomUUID()
  const send = (as: Principal) =>
    apiRequest(api, {
      as,
      org: ORG,
      method: 'POST',
      path: `/v1/projects/${p.id}/ics-feeds`,
      idempotencyKey: key,
      body: { url: 'https://calendar.example.org/private?token=secret' }
    })
  expect((await send(grant)).status).toBe(201)
  const replay = await send({ ...grant, projectIds: [] })
  expect(replay.status).toBe(404)
  expect(JSON.stringify(await replay.json())).not.toContain('token=secret')
})

test('get exposes status but redacts identifiers and diagnostic detail to a viewer', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, {
      projectId: p.id,
      url: 'https://calendar.example.org/?secret=value',
      lastAttemptAt: now,
      lastError: JSON.stringify({ version: 1, code: 'parse-failed' }),
      skipped: [
        { uid: 'SecretUID', recurrenceId: 'SecretRecurrence', pointer: '/vevents/0', detail: 'Sensitive detail' }
      ]
    })
  )
  const response = await apiRequest(v1, { as: viewer, org: ORG, method: 'GET', path: `/v1/ics-feeds/${feed.id}` })
  expect(response.status).toBe(200)
  const value = await response.json()
  expect(value).toMatchObject({
    status: 'error',
    url: null,
    last_attempt_at: now.toISOString(),
    last_error: { code: 'parse-failed' }
  })
  const json = JSON.stringify(value)
  for (const secret of ['secret=value', 'SecretUID', 'SecretRecurrence', 'Sensitive detail'])
    expect(json).not.toContain(secret)
})

test('a project share reviewer can read status without source credentials', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, url: 'https://calendar.example.org/?secret=value' })
  )
  const response = await apiRequest(v1, {
    as: asShareLink({ org: ORG, projectId: p.id, access: 'reviewer' }),
    org: ORG,
    method: 'GET',
    path: `/v1/ics-feeds/${feed.id}`
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'pending', url: null })
})

test('removed feeds stay retrievable but leave the active list', async () => {
  const p = await project()
  const feed = await tenant((tx) => makeIcsFeed(tx, { projectId: p.id, deletedAt: now }))
  expect((await body(p.id)).data).toEqual([])
  const response = await apiRequest(v1, { as: viewer, org: ORG, method: 'GET', path: `/v1/ics-feeds/${feed.id}` })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'removed', deleted_at: now.toISOString() })
})

test('get and delete hide feeds in another organisation', async () => {
  const foreign = await withTenant(
    { orgId: testOrg(OTHER).id, principal: { ...viewer, orgId: testOrg(OTHER).id } },
    async (tx) => {
      const p = await makeProject(tx)
      return makeIcsFeed(tx, { projectId: p.id })
    }
  )
  for (const method of ['GET', 'DELETE'] as const) {
    const response = await apiRequest(v1, {
      as: asSession({ org: ORG, role: 'editor' }),
      org: ORG,
      method,
      path: `/v1/ics-feeds/${foreign.id}`
    })
    expect(response.status).toBe(404)
  }
})

test('viewer cannot register or delete a feed', async () => {
  const p = await project()
  const feed = await tenant((tx) => makeIcsFeed(tx, { projectId: p.id }))
  const create = await apiRequest(v1, {
    as: viewer,
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/ics-feeds`,
    body: { url: 'https://calendar.example.org/calendar.ics' },
    idempotencyKey: randomUUID()
  })
  const remove = await apiRequest(v1, { as: viewer, org: ORG, method: 'DELETE', path: `/v1/ics-feeds/${feed.id}` })
  expect([create.status, remove.status]).toEqual([403, 403])
})

test('item operations reject undeclared query fields', async () => {
  const p = await project()
  const feed = await tenant((tx) => makeIcsFeed(tx, { projectId: p.id }))
  for (const method of ['GET', 'DELETE'] as const) {
    const response = await apiRequest(v1, {
      as: asSession({ org: ORG, role: 'editor' }),
      org: ORG,
      method,
      path: `/v1/ics-feeds/${feed.id}`,
      query: { org_id: 'spoof' }
    })
    expect(response.status).toBe(422)
  }
})

test('delete fences refresh and cancels upcoming managed windows without touching overrides or history', async () => {
  const p = await project()
  const { feed, upcoming, overridden, started } = await tenant(async (tx) => {
    const feed = await makeIcsFeed(tx, { projectId: p.id, refreshClaim: randomUUID() })
    const upcoming = await makeWindow(tx, {
      projectId: p.id,
      icsFeedId: feed.id,
      icsUid: 'a',
      icsRecurrenceId: '',
      startsAt: new Date('2026-11-14T10:00:00Z'),
      endsAt: new Date('2026-11-14T11:00:00Z')
    })
    const overridden = await makeWindow(tx, {
      projectId: p.id,
      icsFeedId: feed.id,
      icsUid: 'b',
      icsRecurrenceId: '',
      localOverride: true,
      startsAt: new Date('2026-11-14T10:00:00Z'),
      endsAt: new Date('2026-11-14T11:00:00Z')
    })
    const started = await makeWindow(tx, {
      projectId: p.id,
      icsFeedId: feed.id,
      icsUid: 'c',
      icsRecurrenceId: '',
      startsAt: new Date('2026-11-11T10:00:00Z'),
      endsAt: new Date('2026-11-11T11:00:00Z')
    })
    return { feed, upcoming, overridden, started }
  })
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'DELETE',
    path: `/v1/ics-feeds/${feed.id}`
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ status: 'removed', deleted_at: now.toISOString() })
  const rows = await tenant((tx) => tx.select().from(window).where(eq(window.projectId, p.id)))
  expect(rows.find((row) => row.id === upcoming.id)).toMatchObject({ cancelledAt: now, cancellationOrigin: 'source' })
  expect(rows.find((row) => row.id === overridden.id)?.cancelledAt).toBeNull()
  expect(rows.find((row) => row.id === started.id)?.cancelledAt).toBeNull()
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored?.refreshClaim).toBeNull()
})

test('refresh retains a UID window on end-time edit and identical refresh emits no event', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const doc = (end: string) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:CaseUID',
      'DTSTART:20261114T100000Z',
      `DTEND:${end}`,
      'SUMMARY:Lecture',
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n')
  const apply = (text: string) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now, result: { status: 'changed', text, etag: null, lastModified: null } }
      )
    )
  expect((await apply(doc('20261114T110000Z'))).status).toBe('applied')
  const [first] = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  expect((await apply(doc('20261114T120000Z'))).status).toBe('applied')
  const [edited] = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  expect(edited).toMatchObject({ id: first!.id, endsAt: new Date('2026-11-14T12:00:00Z') })
  const before = await tenant((tx) => tx.select().from(domainEvent).where(eq(domainEvent.projectId, p.id)))
  expect((await apply(doc('20261114T120000Z'))).status).toBe('applied')
  const after = await tenant((tx) => tx.select().from(domainEvent).where(eq(domainEvent.projectId, p.id)))
  expect(after).toHaveLength(before.length)
})

test('source disappearance and restoration preserve identity and emit one final restored event', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const event = (uid: string, end: string) =>
    ['BEGIN:VEVENT', `UID:${uid}`, 'DTSTART:20261114T100000Z', `DTEND:${end}`, 'SUMMARY:Lecture', 'END:VEVENT'].join(
      '\r\n'
    )
  const doc = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR', ''].join('\r\n')
  const a = event('A', '20261114T110000Z')
  const b = event('B', '20261114T110000Z')
  const apply = (text: string) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now, result: { status: 'changed', text, etag: null, lastModified: null } }
      )
    )
  await apply(doc(a, b))
  const initial = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  const original = initial.find((row) => row.icsUid === 'A')!
  const createdEvents = await tenant((tx) => tx.select().from(domainEvent).where(eq(domainEvent.projectId, p.id)))
  const ids = initial.map((row) => row.id).sort()
  const batch = createdEvents.map(
    (entry) => entry.data as { window_id: string; calendar: { revision: string; window_ids?: string[] } }
  )
  expect(batch).toHaveLength(2)
  expect(batch.find((entry) => entry.window_id === ids[0])?.calendar.window_ids).toEqual(ids)
  expect(batch.find((entry) => entry.window_id === ids[1])?.calendar.window_ids).toBeUndefined()
  expect(new Set(batch.map((entry) => entry.calendar.revision)).size).toBe(1)
  expect(JSON.stringify(createdEvents)).not.toContain('Lecture')
  await apply(doc(b))
  const [cancelled] = await tenant((tx) => tx.select().from(window).where(eq(window.id, original.id)))
  expect(cancelled).toMatchObject({ cancellationOrigin: 'source', cancelledAt: now })
  const prior = await tenant((tx) => tx.select().from(domainEvent).where(eq(domainEvent.projectId, p.id)))
  await apply(doc(event('A', '20261114T120000Z'), b))
  const [restored] = await tenant((tx) => tx.select().from(window).where(eq(window.id, original.id)))
  expect(restored).toMatchObject({ id: original.id, cancelledAt: null, endsAt: new Date('2026-11-14T12:00:00Z') })
  const after = await tenant((tx) => tx.select().from(domainEvent).where(eq(domainEvent.projectId, p.id)))
  const emitted = after.filter((event) => !prior.some((old) => old.id === event.id))
  expect(emitted).toHaveLength(1)
  expect(emitted[0]).toMatchObject({
    type: 'window.updated',
    data: { window_id: original.id, times_changed: true, calendar: { window_ids: [original.id] } }
  })
})

test('EXDATE cancels and restores an occurrence without stopping its source series', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const doc = (exclude: boolean) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly',
      'DTSTART:20261116T090000Z',
      'DTEND:20261116T100000Z',
      'SUMMARY:Lecture',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      ...(exclude ? ['EXDATE:20261123T090000Z'] : []),
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n')
  const apply = (text: string) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now, result: { status: 'changed', text, etag: null, lastModified: null } }
      )
    )
  await apply(doc(false))
  const initial = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  expect(initial).toHaveLength(2)
  const excluded = initial.find((row) => row.icsRecurrenceId === '2026-11-23T09:00:00Z')!
  await apply(doc(true))
  const [cancelled] = await tenant((tx) => tx.select().from(window).where(eq(window.id, excluded.id)))
  expect(cancelled).toMatchObject({ cancelledAt: now, cancellationOrigin: 'source' })
  const [series] = await tenant((tx) => tx.select().from(windowSeries).where(eq(windowSeries.icsFeedId, feed.id)))
  expect(series?.cancelledAt).toBeNull()
  await apply(doc(false))
  const [restored] = await tenant((tx) => tx.select().from(window).where(eq(window.id, excluded.id)))
  expect(restored?.cancelledAt).toBeNull()
})

test('a skipped source UID remains protected instead of being cancelled', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const doc = (summary: string) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:ProtectedUID',
      'DTSTART:20261114T100000Z',
      'DTEND:20261114T110000Z',
      ...(summary ? [`SUMMARY:${summary}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n')
  const apply = (text: string) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now, result: { status: 'changed', text, etag: null, lastModified: null } }
      )
    )
  await apply(doc('Lecture'))
  const [before] = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  await apply(doc(''))
  const [after] = await tenant((tx) => tx.select().from(window).where(eq(window.id, before!.id)))
  expect(after).toMatchObject({ id: before!.id, cancelledAt: null, title: 'Lecture' })
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored?.skipped).toMatchObject([{ uid: 'ProtectedUID', detail: 'A calendar entry could not be imported.' }])
})

test('failure records a fixed code without losing the last successful document or validators', async () => {
  const p = await project()
  const claimId = randomUUID()
  const document = { version: 1, jcal: ['vcalendar', [['version', {}, 'text', '2.0']], []] }
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, {
      projectId: p.id,
      refreshClaim: claimId,
      nextRefreshAt: new Date(now.getTime() + 3_600_000),
      document,
      etag: '"old"',
      refreshedAt: now
    })
  )
  const response = await tenant((tx) =>
    recordCalendarFailure(
      { tx, principal: viewer },
      { feedId: feed.id, claimId, now, error: new UnsafeUrlError('https://secret.example/?token=secret') }
    )
  )
  expect(response.status).toBe('applied')
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored).toMatchObject({
    document,
    etag: '"old"',
    refreshedAt: now,
    lastError: JSON.stringify({ version: 1, code: 'unsafe-url' }),
    refreshClaim: null
  })
  expect(stored?.lastError).not.toContain('secret')
})

test('a missing policy is recorded as unavailable, not a failed fetch', async () => {
  const p = await project()
  const claimId = randomUUID()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, refreshClaim: claimId, nextRefreshAt: new Date(now.getTime() + 3_600_000) })
  )
  await tenant((tx) =>
    recordCalendarFailure(
      { tx, principal: viewer },
      { feedId: feed.id, claimId, now, error: new NotBuiltError('d-guest-rules') }
    )
  )
  const [stored] = await tenant((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored!.lastError).toBe(JSON.stringify({ version: 1, code: 'unavailable' }))
})

test('304 without an authoritative document fails without cancelling existing windows', async () => {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const managed = await tenant((tx) =>
    makeWindow(tx, {
      projectId: p.id,
      icsFeedId: feed.id,
      icsUid: 'uid',
      icsRecurrenceId: '',
      startsAt: new Date('2026-11-14T10:00:00Z'),
      endsAt: new Date('2026-11-14T11:00:00Z')
    })
  )
  await expect(
    tenant((tx) => applyCalendar({ tx, principal: viewer }, { feedId: feed.id, now, result: { status: 'unchanged' } }))
  ).rejects.toBeInstanceOf(MissingCalendarDocumentError)
  const [stored] = await tenant((tx) => tx.select().from(window).where(eq(window.id, managed.id)))
  expect(stored?.cancelledAt).toBeNull()
})

const shiftedBoundaries = [
  {
    label: 'positive shift near now',
    editedDate: '2026-11-19',
    sourceDate: '20261123',
    effective: '2026-11-26T10:00:00.000Z',
    movedDate: '20261124',
    movedEffective: '2026-11-27T10:00:00.000Z',
    at: '2026-11-25T13:13:00Z'
  },
  {
    label: 'negative shift near now',
    editedDate: '2026-11-13',
    sourceDate: '20261130',
    effective: '2026-11-27T10:00:00.000Z',
    movedDate: '20261201',
    movedEffective: '2026-11-28T10:00:00.000Z',
    at: '2026-11-26T13:13:00Z'
  },
  {
    label: 'positive shift near through',
    editedDate: '2026-11-19',
    sourceDate: '20270207',
    effective: '2027-02-10T10:00:00.000Z',
    movedDate: '20270206',
    movedEffective: '2027-02-09T10:00:00.000Z',
    at: '2026-11-12T13:13:00Z'
  },
  {
    label: 'negative shift near through',
    editedDate: '2026-11-13',
    sourceDate: '20270213',
    effective: '2027-02-10T10:00:00.000Z',
    movedDate: '20270212',
    movedEffective: '2027-02-09T10:00:00.000Z',
    at: '2026-11-12T13:13:00Z'
  }
]

async function shiftedSourceMember(boundary: (typeof shiftedBoundaries)[number]) {
  const p = await project()
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const doc = (options: { target?: boolean; title?: string; extra?: string[]; absent?: boolean } = {}) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      ...(!options.absent
        ? [
            'BEGIN:VEVENT',
            'UID:shifted',
            'DTSTART:20261116T090000Z',
            'DTEND:20261116T100000Z',
            `SUMMARY:${options.title ?? 'Lecture'}`,
            'RRULE:FREQ=WEEKLY;COUNT=1',
            ...(options.target ? [`RDATE:${boundary.sourceDate}T090000Z`] : []),
            ...(options.extra ?? []),
            'END:VEVENT'
          ]
        : []),
      'END:VCALENDAR',
      ''
    ].join('\r\n')
  const apply = (text: string, at = now) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now: at, result: { status: 'changed', text, etag: null, lastModified: null } }
      )
    )
  await apply(doc())
  const [anchor] = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  const response = await apiRequest(v1, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'PATCH',
    path: `/v1/windows/${anchor!.id}`,
    query: { scope: 'series' },
    idempotencyKey: randomUUID(),
    body: {
      starts_at: `${boundary.editedDate}T10:00:00Z`,
      ends_at: `${boundary.editedDate}T11:00:00Z`,
      tz: 'UTC'
    }
  })
  expect(response.status).toBe(200)
  await apply(doc({ target: true }))
  const rows = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  const member = rows.find((row) => row.id !== anchor!.id)!
  expect(member).toMatchObject({ startsAt: new Date(boundary.effective), localOverride: false })
  const read = async () => (await tenant((tx) => tx.select().from(window).where(eq(window.id, member.id))))[0]!
  return { apply, doc, read, member, at: new Date(boundary.at) }
}

describe.each(shiftedBoundaries)('source-managed defaults: $label', (boundary) => {
  test('a parsed title update remains authoritative', async () => {
    const { apply, doc, read, member, at } = await shiftedSourceMember(boundary)
    await apply(doc({ target: true, title: 'Revised lecture' }), at)
    expect(await read()).toMatchObject({ id: member.id, title: 'Revised lecture', cancelledAt: null })
  })

  test('a source exception date change updates the original identity', async () => {
    const { apply, doc, read, member, at } = await shiftedSourceMember(boundary)
    const moved = [
      'BEGIN:VEVENT',
      'UID:shifted',
      `RECURRENCE-ID:${boundary.sourceDate}T090000Z`,
      `DTSTART:${boundary.movedDate}T090000Z`,
      `DTEND:${boundary.movedDate}T100000Z`,
      'SUMMARY:Moved lecture',
      'END:VEVENT'
    ].join('\r\n')
    await apply(doc({ target: true }).replace('END:VCALENDAR', `${moved}\r\nEND:VCALENDAR`), at)
    expect(await read()).toMatchObject({
      id: member.id,
      icsRecurrenceId: member.icsRecurrenceId,
      seriesId: member.seriesId,
      title: 'Moved lecture',
      startsAt: new Date(boundary.movedEffective),
      cancelledAt: null
    })
  })

  test.each(['EXDATE', 'master cancellation', 'disappearance'])(
    '%s cancels and restores the later-created identity',
    async (change) => {
      const { apply, doc, read, member, at } = await shiftedSourceMember(boundary)
      await apply(
        doc({
          target: true,
          absent: change === 'disappearance',
          extra: change === 'EXDATE' ? [`EXDATE:${boundary.sourceDate}T090000Z`] : ['STATUS:CANCELLED']
        }),
        at
      )
      expect(await read()).toMatchObject({ id: member.id, cancelledAt: at, cancellationOrigin: 'source' })
      await apply(doc({ target: true, title: 'Restored lecture' }), at)
      expect(await read()).toMatchObject({
        id: member.id,
        title: 'Restored lecture',
        cancelledAt: null,
        startsAt: new Date(boundary.effective)
      })
    }
  )

  test.each(['20271101', '20251101'])(
    'a source exception moved outside the horizon (%s) preserves its existing identity',
    async (date) => {
      const { apply, doc, read, member, at } = await shiftedSourceMember(boundary)
      const moved = [
        'BEGIN:VEVENT',
        'UID:shifted',
        `RECURRENCE-ID:${boundary.sourceDate}T090000Z`,
        `DTSTART:${date}T090000Z`,
        `DTEND:${date}T100000Z`,
        'SUMMARY:Outside horizon',
        'END:VEVENT'
      ].join('\r\n')
      await apply(doc({ target: true }).replace('END:VCALENDAR', `${moved}\r\nEND:VCALENDAR`), at)
      expect(await read()).toMatchObject({
        id: member.id,
        title: 'Lecture',
        startsAt: new Date(boundary.effective),
        cancelledAt: null
      })
    }
  )
})

test.each([true, false])(
  'recurring and standalone roundtrips retain their own parents (starts recurring: %s)',
  async (first) => {
    const p = await project()
    const feed = await tenant((tx) =>
      makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
    )
    const doc = (recurring: boolean) =>
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:changing',
        'DTSTART:20261116T090000Z',
        'DTEND:20261116T100000Z',
        'SUMMARY:Lecture',
        ...(recurring ? ['RRULE:FREQ=WEEKLY;COUNT=2'] : []),
        'END:VEVENT',
        'END:VCALENDAR',
        ''
      ].join('\r\n')
    const identities = new Map<string, { id: string; seriesId: string | null }>()
    let seriesId: string | undefined
    for (const recurring of [first, !first, first]) {
      await tenant((tx) =>
        applyCalendar(
          { tx, principal: viewer },
          { feedId: feed.id, now, result: { status: 'changed', text: doc(recurring), etag: null, lastModified: null } }
        )
      )
      const series = await tenant((tx) => tx.select().from(windowSeries).where(eq(windowSeries.icsFeedId, feed.id)))
      if (recurring || seriesId) {
        expect(series).toHaveLength(1)
        seriesId ??= series[0]!.id
        expect(series[0]).toMatchObject({ id: seriesId, cancelledAt: null })
      } else expect(series).toEqual([])
      const rows = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
      const active = rows.filter((row) => !row.cancelledAt)
      expect(active.map((row) => row.icsRecurrenceId).sort()).toEqual(
        recurring ? ['2026-11-16T09:00:00Z', '2026-11-23T09:00:00Z'] : ['']
      )
      for (const row of active) expect(row.seriesId).toBe(recurring ? seriesId : null)
      for (const row of rows) {
        const original = identities.get(row.icsRecurrenceId!)
        if (original) expect(row).toMatchObject(original)
        else identities.set(row.icsRecurrenceId!, { id: row.id, seriesId: row.seriesId })
      }
    }
    expect(identities.size).toBe(3)
  }
)

test.each([
  {
    label: 'backward across through',
    projectTz: 'Pacific/Pago_Pago',
    overrideTz: 'Pacific/Kiritimati',
    sourceStart: '20261116T235900',
    sourceEnd: '20261117T005900',
    editedStart: '2026-11-15T10:00:00Z',
    editedEnd: '2026-11-15T11:00:00Z',
    at: '2026-11-12T10:00:00Z',
    targets: ['20270211T232900', '20270211T235900'],
    expected: [
      ['2027-02-11T23:29:00', '2027-02-10T10:00:00.000Z'],
      ['2027-02-11T23:59:00', '2027-02-10T10:00:00.000Z']
    ]
  },
  {
    label: 'forward across now',
    projectTz: 'Pacific/Kiritimati',
    overrideTz: 'Pacific/Pago_Pago',
    sourceStart: '20261106T000000',
    sourceEnd: '20261106T010000',
    editedStart: '2026-11-07T10:59:00Z',
    editedEnd: '2026-11-07T11:59:00Z',
    at: '2026-11-12T10:30:00Z',
    targets: ['20261111T000000'],
    expected: [['2026-11-11T00:00:00', '2026-11-12T10:59:00.000Z']]
  }
])('clock and zone defaults cover a shift over 48 hours: $label', async (scenario) => {
  const setupNow = new Date('2026-11-01T00:00:00Z')
  const p = await tenant((tx) => makeProject(tx, { timeZone: scenario.projectTz }))
  const feed = await tenant((tx) =>
    makeIcsFeed(tx, { projectId: p.id, provenance: { version: 1, declaredBy: 'account', via: 'app' } })
  )
  const doc = (targets: string[]) =>
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:extreme-zones',
      `DTSTART:${scenario.sourceStart}`,
      `DTEND:${scenario.sourceEnd}`,
      'SUMMARY:Lecture',
      'RRULE:FREQ=WEEKLY;COUNT=1',
      ...(targets.length ? [`RDATE:${targets.join(',')}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n')
  const apply = (targets: string[], at: Date) =>
    tenant((tx) =>
      applyCalendar(
        { tx, principal: viewer },
        { feedId: feed.id, now: at, result: { status: 'changed', text: doc(targets), etag: null, lastModified: null } }
      )
    )
  await apply([], setupNow)
  const [anchor] = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  const api = createTestApi({ deps: testDeps({ withTenant, recordAudit, now: () => setupNow, can: testCan }) }).v1
  const response = await apiRequest(api, {
    as: asSession({ org: ORG, role: 'editor' }),
    org: ORG,
    method: 'PATCH',
    path: `/v1/windows/${anchor!.id}`,
    query: { scope: 'series' },
    idempotencyKey: randomUUID(),
    body: { starts_at: scenario.editedStart, ends_at: scenario.editedEnd, tz: scenario.overrideTz }
  })
  expect(response.status).toBe(200)
  const [series] = await tenant((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, anchor!.seriesId!)))
  expect(series?.definition).toMatchObject({ manualDefaults: { dateOffsetDays: 0 } })
  await apply(scenario.targets, new Date(scenario.at))
  const rows = await tenant((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))
  expect(
    rows
      .filter((row) => row.id !== anchor!.id)
      .map((row) => [row.icsRecurrenceId, row.startsAt.toISOString()])
      .sort()
  ).toEqual(scenario.expected)
})

test('createIcsFeed, getIcsFeed and deleteIcsFeed reject foreign tenant resources', async () => {
  const foreignPrincipal = { ...asApiKey({ org: OTHER, role: 'editor', scopes: ['read', 'draft'] }) }
  const foreign = await withTenant({ orgId: testOrg(OTHER).id, principal: foreignPrincipal }, async (tx) => {
    const project = await makeProject(tx)
    return { project, feed: await makeIcsFeed(tx, { projectId: project.id }) }
  })
  const editor = asApiKey({ org: ORG, role: 'editor', scopes: ['read', 'draft'] })
  await crossOrgCase('createIcsFeed', {
    app: v1,
    as: editor,
    org: ORG,
    params: { id: foreign.project.id },
    body: { url: 'https://calendar.example.org/schedule.ics' }
  }).run()
  await crossOrgCase('getIcsFeed', { app: v1, as: editor, org: ORG, params: { id: foreign.feed.id } }).run()
  await crossOrgCase('deleteIcsFeed', { app: v1, as: editor, org: ORG, params: { id: foreign.feed.id } }).run()
  const [unchanged] = await withTenant({ orgId: testOrg(OTHER).id, principal: foreignPrincipal }, (tx) =>
    tx.select().from(icsFeed).where(eq(icsFeed.id, foreign.feed.id))
  )
  expect(unchanged!.deletedAt).toBeNull()
})
