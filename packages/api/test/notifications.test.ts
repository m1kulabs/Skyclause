// #156 (c-notifications) at the operation seam: `/api/notifications[/stream,/{id}/read]` and
// `/api/me/notification-preferences`, on the #79 §7 test database. The SSE hub (#175) isn't built: a double stands in.
import { randomUUID } from 'node:crypto'
import type { Notification, NotificationPreference, Principal, Role } from '@skyclause/contracts'
import { listenEvents, notificationRows, notify, systemPrincipal, withTenant, type Tx } from '@skyclause/db'
import { makeMember, makeOrganization, makeProject, makeUser } from '@skyclause/db/test/factories/index'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import type { WithTenant } from '../src/tenancy'
import {
  apiRequest,
  asApiKey,
  asDevice,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testDeps
} from './harness'

vi.mock('@skyclause/db', async (original) => ({ ...(await original<object>()), listenEvents: vi.fn(() => () => {}) }))

const { api, deps } = createTestApi({ deps: testDeps({ withTenant: withTenant as unknown as WithTenant }) })
const json = async <T>(response: Promise<Response>) => (await (await response).json()) as T
const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test') }, fn)

let acme: { id: string; slug: string }
let beta: { id: string; slug: string }
let projectId: string
let projectSlug: string

/** A real account that is a member of each organisation given, with a cookie session principal. */
async function account(...orgs: Array<[{ id: string; slug: string }, Role]>): Promise<Principal & { kind: 'session' }> {
  const user = await makeUser()
  for (const [org, role] of orgs) await makeMember({ organizationId: org.id, userId: user.id, role })
  const [first] = orgs
  return {
    ...(asSession({ org: first?.[0].slug ?? 'none', role: first?.[1] ?? 'viewer' }) as Principal & { kind: 'session' }),
    accountId: user.id
  }
}
const item = (orgId: string, accountId: string, o: { projectId?: string; kind?: 'needs_review' | 'auditor' } = {}) =>
  inOrg(orgId, (tx) =>
    notify(tx, {
      accountIds: [accountId],
      kind: o.kind ?? 'needs_review',
      ref: { type: 'bundle', id: randomUUID() },
      projectId: o.projectId
    })
  )
const list = (as: Principal, query?: Record<string, string>) =>
  json<{ data: Notification[]; next_cursor: string | null; unread_count?: number }>(
    apiRequest(api, { as, method: 'GET', path: '/api/notifications', query })
  )

beforeAll(async () => {
  acme = await makeOrganization()
  beta = await makeOrganization()
  const project = await inOrg(acme.id, (tx) => makeProject(tx, { slug: `p-${randomUUID()}` }))
  projectId = project.id
  projectSlug = project.slug
})

describe('GET /api/notifications', () => {
  test("lists the caller's items across its organisations, newest first, with project slugs, paged, and the unread count", async () => {
    const ana = await account([acme, 'approver'], [beta, 'viewer'])
    const ben = await account([acme, 'approver'])
    await item(acme.id, ana.accountId, { projectId })
    await item(beta.id, ana.accountId, { kind: 'auditor' })
    await item(acme.id, ana.accountId)
    await item(acme.id, ben.accountId)

    const first = await list(ana, { limit: '2' })
    expect(first.unread_count).toBe(3)
    expect(first.data.map((n) => n.kind)).toEqual(['needs_review', 'auditor'])
    expect(first.data[0]!.project).toBeNull()
    expect(first.next_cursor).toEqual(expect.any(String))
    const second = await list(ana, { limit: '2', cursor: first.next_cursor! })
    expect(second.data).toEqual([
      expect.objectContaining({
        kind: 'needs_review',
        project: { id: projectId, slug: projectSlug, org_slug: acme.slug },
        recovered: false,
        read_at: null
      })
    ])
    expect(second.next_cursor).toBeNull()
    expect((await list(ben)).data).toHaveLength(1)
  })

  test('leaves out items in an organisation the account is no longer a member of', async () => {
    const ana = await account([acme, 'viewer'])
    await item(beta.id, ana.accountId)
    expect(await list(ana)).toEqual({ data: [], next_cursor: null, unread_count: 0 })
  })
})

describe('POST /api/notifications/{id}/read', () => {
  const read = (as: Principal, id: string) =>
    apiRequest(api, { as, method: 'POST', path: `/api/notifications/${id}/read` })

  test("sets read_at once, for the item's own account only", async () => {
    const [ana, ben] = [await account([acme, 'approver']), await account([acme, 'approver'])]
    await item(acme.id, ana.accountId, { projectId })
    const [unread] = (await list(ana)).data
    expect((await read(ben, unread!.id)).status).toBe(404)
    const first = await read(ana, unread!.id)
    expect(first.status).toBe(200)
    const marked = (await first.json()) as Notification
    expect(marked).toEqual({ ...unread, read_at: expect.any(String) })
    deps.clock.advance(60_000)
    expect(await json(read(ana, unread!.id))).toEqual(marked)
    expect((await list(ana)).unread_count).toBe(0)
  })

  test('an unknown or malformed ID is 404', async () => {
    const ana = await account([acme, 'viewer'])
    for (const id of [randomUUID(), 'not-a-uuid']) expect((await read(ana, id)).status).toBe(404)
  })

  test("another organisation's item is 404 even for the same account, once it isn't a member there", async () => {
    const ana = await account([acme, 'owner'])
    await item(beta.id, ana.accountId)
    const id = await inOrg(beta.id, async (tx) => (await notificationRows(tx, { accountId: ana.accountId }))[0]!.id)
    await crossOrgCase('markNotificationRead', { app: api, as: ana, params: { id } }).run()
  })
})

describe('/api/me/notification-preferences', () => {
  const get = (as: Principal) =>
    json<{ data: NotificationPreference[] }>(
      apiRequest(api, { as, method: 'GET', path: '/api/me/notification-preferences' })
    )
  const patch = (as: Principal, preferences: NotificationPreference[]) =>
    apiRequest(api, { as, method: 'PATCH', path: '/api/me/notification-preferences', body: { preferences } })
  const off = async (as: Principal) => (await get(as)).data.filter((p) => !p.enabled).map((p) => p.kind)

  test("every kind starts on; a change applies in each of the caller's organisations and to no other account", async () => {
    const [ana, ben] = [await account([acme, 'approver'], [beta, 'viewer']), await account([acme, 'approver'])]
    expect((await get(ana)).data).toEqual([
      { kind: 'needs_review', enabled: true },
      { kind: 'escalated', enabled: true },
      { kind: 'source_error', enabled: true },
      { kind: 'review_item', enabled: true },
      { kind: 'auditor', enabled: true }
    ])
    const response = await patch(ana, [{ kind: 'source_error', enabled: false }])
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: NotificationPreference[] }).data).toContainEqual({
      kind: 'source_error',
      enabled: false
    })
    expect(await off(ana)).toEqual(['source_error'])
    expect(await off(ben)).toEqual([])
    for (const org of [acme, beta]) {
      await inOrg(org.id, (tx) =>
        notify(tx, { accountIds: [ana.accountId], kind: 'source_error', ref: { type: 'source', id: randomUUID() } })
      )
    }
    expect((await list(ana)).data).toEqual([])
  })
})

describe('the /api surface', () => {
  const operations: Array<[string, string, unknown?]> = [
    ['GET', '/api/notifications'],
    ['GET', '/api/notifications/stream'],
    ['POST', `/api/notifications/${randomUUID()}/read`],
    ['GET', '/api/me/notification-preferences'],
    ['PATCH', '/api/me/notification-preferences', { preferences: [{ kind: 'auditor', enabled: false }] }]
  ]

  test.each(operations)(
    '%s %s refuses keys and tokens with 403, and answers 401 without a session',
    async (method, path, body) => {
      const others = [
        asApiKey({ org: acme.slug, role: 'owner', scopes: ['read', 'draft', 'admin'] }),
        asGuestToken({ org: acme.slug }),
        asOAuth({ org: acme.slug, role: 'owner', resource: 'api' }),
        asShareLink({ org: acme.slug, access: 'reviewer' }),
        asDevice({ org: acme.slug })
      ]
      for (const as of others) expect((await apiRequest(api, { as, method, path, body })).status, as.kind).toBe(403)
      expect((await apiRequest(api, { method, path, body })).status).toBe(401)
    }
  )
})

describe('GET /api/notifications/stream', () => {
  type Frame = { event: string | undefined; data: unknown }
  /** The stream's events, skipping comment heartbeats. */
  async function* frames(response: Response): AsyncGenerator<Frame> {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += value
        for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
          const frame = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (frame.startsWith(':')) continue
          yield { event: /^event: (.*)$/m.exec(frame)?.[1], data: JSON.parse(/^data: (.*)$/m.exec(frame)![1]!) }
        }
      }
    } finally {
      // Returning the generator is the client going away: it cancels the stream.
      await reader.cancel()
    }
  }
  const hub: Array<{ q: Parameters<typeof listenEvents>[0]; fire: () => void; stopped: boolean }> = []
  const open = async (as: Principal) => {
    hub.length = 0
    vi.mocked(listenEvents).mockImplementation((q, cb) => {
      const entry = { q, fire: () => cb({} as never), stopped: false }
      hub.push(entry)
      return () => void (entry.stopped = true)
    })
    const response = await apiRequest(api, { as, method: 'GET', path: '/api/notifications/stream' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    return frames(response)
  }
  const next = async (events: AsyncGenerator<Frame>) => (await events.next()).value as Frame
  afterEach(() => vi.useRealTimers())

  test('opens with a snapshot (unread count, latest 20), then sends each new item within 10 s of the hub firing (DSH-3)', async () => {
    const ana = await account([acme, 'approver'], [beta, 'viewer'])
    for (let i = 0; i < 21; i++) await item(acme.id, ana.accountId)
    const events = await open(ana)
    const snapshot = (await next(events)) as { event: string; data: { unread_count: number; data: Notification[] } }
    expect(snapshot.event).toBe('snapshot')
    expect(snapshot.data.unread_count).toBe(21)
    expect(snapshot.data.data).toHaveLength(20)
    expect(hub.map(({ q }) => q)).toEqual([
      {
        orgId: acme.id,
        projectIds: expect.arrayContaining([projectId]),
        types: ['bundle.needs_review', 'bundle.escalated', 'source.error', 'review_item.opened']
      },
      {
        orgId: beta.id,
        projectIds: [],
        types: ['bundle.needs_review', 'bundle.escalated', 'source.error', 'review_item.opened']
      }
    ])

    const started = Date.now()
    await item(beta.id, ana.accountId, { kind: 'auditor' })
    hub[1]!.fire()
    const live = await next(events)
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(live).toEqual({ event: 'notification', data: expect.objectContaining({ kind: 'auditor', read_at: null }) })
    await events.return(undefined)
    expect(hub.every(({ stopped }) => stopped)).toBe(true)
  })

  test('re-reads on every 15 s heartbeat without a hub event, and sends nothing twice', async () => {
    vi.useFakeTimers({ toFake: ['setInterval'] })
    const ana = await account([acme, 'approver'])
    await item(acme.id, ana.accountId)
    const events = await open(ana)
    expect((await next(events)).event).toBe('snapshot')
    await item(acme.id, ana.accountId, { projectId })
    vi.advanceTimersByTime(15_000)
    const live = await next(events)
    expect(live).toEqual({
      event: 'notification',
      data: expect.objectContaining({ project: expect.objectContaining({ id: projectId }) })
    })
    await item(acme.id, ana.accountId, { kind: 'auditor' })
    hub[0]!.fire()
    vi.advanceTimersByTime(15_000)
    expect(await next(events)).toEqual({ event: 'notification', data: expect.objectContaining({ kind: 'auditor' }) })
    // Both triggers re-read the auditor item; had either sent it again, it would come before this one.
    await item(acme.id, ana.accountId)
    vi.advanceTimersByTime(15_000)
    expect(await next(events)).toEqual({
      event: 'notification',
      data: expect.objectContaining({ kind: 'needs_review', project: null })
    })
    await events.return(undefined)
  })

  test('ends after 5 minutes and stops listening; no Last-Event-ID resume', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const ana = await account([acme, 'viewer'])
    const events = await open(ana)
    expect((await next(events)).event).toBe('snapshot')
    vi.advanceTimersByTime(5 * 60_000)
    expect(await events.next()).toEqual({ done: true, value: undefined })
    expect(hub.every(({ stopped }) => stopped)).toBe(true)
  })
})
