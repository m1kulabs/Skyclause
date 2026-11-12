// #139: b-windows-api's list and declare for single windows, through the mounted app on the #79 §7 test database:
// WIN-6 (one window per Idempotency-Key), WIN-8 (each violation its own field error), the event and analytic a
// declaration writes, a Viewer's 403 and a cross-organisation 404. Series, ICS, edit and cancel are not built.
import { randomUUID } from 'node:crypto'
import type { Page, Principal } from '@skyclause/contracts'
import { analyticsEvent, domainEvent, window, withSystem, withTenant, systemPrincipal, type Tx } from '@skyclause/db'
import { makeBundle, makeCall, makeOrganization, makeProject, makeRun } from '@skyclause/db/test/factories/index'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, test } from 'vitest'
import { encodeCursor } from '../src/pagination'
const { can: canonicalCan } = (await import(new URL('../../auth/src/can.ts', import.meta.url).href)) as {
  can: import('@skyclause/contracts').Can
}
import {
  apiRequest,
  asApiKey,
  asGuestToken,
  asOAuth,
  asSession,
  asShareLink,
  createTestApi,
  crossOrgCase,
  testDeps,
  testOrg
} from './harness'

const ORG = 'windows-home'
const OTHER = 'windows-other'
const deps = testDeps({ withTenant })
const { v1 } = createTestApi({ deps })
const inOrg = <T>(slug: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(slug).id, principal: systemPrincipal('test') }, fn)
// A well-formed ID (UUIDv7) that names no project.
const UNKNOWN = '01900000-0000-7000-8000-000000000000'
const editor = () => asSession({ org: ORG, role: 'editor' })

// The harness clock reads 2026-11-08T02:00:00Z; Kuala Lumpur is UTC+8.
const body = (over: Record<string, unknown> = {}) => ({
  title: 'Lecture',
  kind: 'class',
  starts_at: '2026-11-09T06:00:00Z',
  ends_at: '2026-11-09T08:00:00Z',
  tz: 'Asia/Kuala_Lumpur',
  ...over
})
const declare = (as: Principal, projectId: string, payload: unknown, key: string = randomUUID()) =>
  apiRequest(v1, {
    as,
    method: 'POST',
    path: `/v1/projects/${projectId}/windows`,
    org: ORG,
    body: payload,
    idempotencyKey: key
  })
const list = (as: Principal, projectId: string, query: Record<string, string> = {}) =>
  apiRequest(v1, {
    as,
    method: 'GET',
    path: `/v1/projects/${projectId}/windows`,
    org: ORG,
    query
  })
type View = {
  id: string
  title: string
  kind: string
  via: string
  declared_by: string
  share_link_id: string | null
  cancelled_at: string | null
  at_risk: boolean
  latest_calls: { sky: unknown; crowd: unknown }
}
const pointers = async (response: Response) =>
  ((await response.json()) as { errors: Array<{ pointer: string; code: string }> }).errors.map(
    (error) => `${error.pointer}:${error.code}`
  )

let projectId: string
let otherProjectId: string
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  projectId = (await inOrg(ORG, (tx) => makeProject(tx))).id
  otherProjectId = (await inOrg(OTHER, (tx) => makeProject(tx))).id
})

describe('POST /v1/projects/{id}/windows', () => {
  test('idempotent replay rechecks the current project grant', async () => {
    const app = createTestApi({ deps: testDeps({ withTenant, can: canonicalCan }) }).v1
    const replayProject = (await inOrg(ORG, (tx) => makeProject(tx))).id
    const as = asOAuth({ org: ORG, role: 'editor', scopes: ['draft'], projectIds: [replayProject] })
    if (as.kind !== 'oauth') throw new Error('OAuth fixture required')
    const key = randomUUID()
    const send = (principal: Principal) =>
      apiRequest(app, {
        as: principal,
        org: ORG,
        method: 'POST',
        path: `/v1/projects/${replayProject}/windows`,
        body: body(),
        idempotencyKey: key
      })
    const first = await send(as)
    expect(first.status).toBe(201)
    const replay = await send({ ...as, projectIds: [] })
    expect(replay.status).toBe(404)
  })
  test('authorized replay remains the original response after its start time passes', async () => {
    let clock = new Date('2026-11-08T02:00:00Z')
    const app = createTestApi({ deps: testDeps({ withTenant, can: canonicalCan, now: () => clock }) }).v1
    const as = asSession({ org: ORG, role: 'editor' })
    const key = randomUUID()
    const send = () =>
      apiRequest(app, {
        as,
        org: ORG,
        method: 'POST',
        path: `/v1/projects/${projectId}/windows`,
        body: body({ starts_at: '2026-11-08T03:00:00Z', ends_at: '2026-11-08T04:00:00Z' }),
        idempotencyKey: key
      })
    const first = await send()
    expect(first.status).toBe(201)
    const original = await first.json()
    clock = new Date('2026-11-08T05:00:00Z')
    const replay = await send()
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(original)
  })
  test('a member declares a window: 201, only the declared fields stored, then the list shows it', async () => {
    const as = editor()
    const response = await declare(as, projectId, body({ title: 'Morning lecture' }))
    expect(response.status).toBe(201)
    const created = (await response.json()) as View
    expect(created).toMatchObject({
      project_id: projectId,
      title: 'Morning lecture',
      kind: 'class',
      starts_at: '2026-11-09T06:00:00Z',
      ends_at: '2026-11-09T08:00:00Z',
      tz: 'Asia/Kuala_Lumpur',
      via: 'app',
      declared_by: as.accountId,
      guest: false,
      series_id: null,
      ics_feed_id: null,
      cancelled_at: null,
      share_link_id: null,
      expires_at: null,
      moderation: 'visible',
      at_risk: false,
      // A new window has no call yet.
      latest_calls: { sky: null, crowd: null }
    })
    const listed = (await (await list(editor(), projectId)).json()) as Page<View>
    expect(listed.data.map((item) => item.id)).toContain(created.id)
  })

  test('an API key declares via api, an OAuth grant via mcp and a bearer session via cli', async () => {
    const key = asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] })
    const grant = asOAuth({ org: ORG, role: 'editor', scopes: ['draft'] })
    const cli = asSession({ org: ORG, role: 'editor', via: 'bearer' })
    const vias: string[] = []
    for (const as of [key, grant, cli]) {
      const response = await declare(as, projectId, body({ title: `Via ${as.kind}` }))
      expect(response.status).toBe(201)
      const view = (await response.json()) as View
      vias.push(view.via)
      expect(view.declared_by).toBe((as as { accountId: string }).accountId)
    }
    expect(vias).toEqual(['api', 'mcp', 'cli'])
  })

  test('WIN-6: the same Idempotency-Key twice creates one window, one event and one analytic', async () => {
    const as = editor()
    const key = randomUUID()
    const payload = body({ title: 'Once only', starts_at: '2026-11-10T06:00:00Z', ends_at: '2026-11-10T07:00:00Z' })
    const first = await declare(as, projectId, payload, key)
    const again = await declare(as, projectId, payload, key)
    expect(first.status).toBe(201)
    expect(again.status).toBe(201)
    const created = (await first.json()) as View
    expect(await again.json()).toEqual(created)
    const rows = await inOrg(ORG, (tx) => tx.select().from(window).where(eq(window.title, 'Once only')))
    expect(rows).toHaveLength(1)
    const events = await inOrg(ORG, (tx) =>
      tx
        .select()
        .from(domainEvent)
        .where(and(eq(domainEvent.projectId, projectId), eq(domainEvent.type, 'window.created')))
    )
    expect(events.filter((event) => (event.data as { window_id: string }).window_id === created.id)).toHaveLength(1)
  })

  test('writes a window.created event and a window_declared analytic', async () => {
    const response = await declare(
      editor(),
      projectId,
      body({ title: 'Evented', starts_at: '2026-11-11T06:00:00Z', ends_at: '2026-11-11T07:00:00Z' })
    )
    const created = (await response.json()) as View
    const events = await inOrg(ORG, (tx) =>
      tx
        .select()
        .from(domainEvent)
        .where(and(eq(domainEvent.projectId, projectId), eq(domainEvent.type, 'window.created')))
    )
    const event = events.find((row) => (row.data as { window_id: string }).window_id === created.id)
    expect(event?.data).toEqual({ window_id: created.id, via: 'form', times_changed: false, series_id: null })
    const tracked = await withSystem('windows-test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.name, 'window_declared'), eq(analyticsEvent.projectId, projectId)))
    )
    expect(tracked.length).toBeGreaterThan(0)
    expect(tracked[0]!.props).toEqual({ via: 'form', recurring: false })
  })

  describe('WIN-8: each violation is its own field error', () => {
    test.each([
      ['ends before it starts', { ends_at: '2026-11-09T05:00:00Z' }, ['/ends_at:end_before_start']],
      ['a zero-length class', { ends_at: '2026-11-09T06:00:00Z' }, ['/ends_at:end_before_start']],
      ['over 12 hours long', { ends_at: '2026-11-09T18:00:01Z' }, ['/ends_at:too_long']],
      [
        'more than 90 days ahead',
        { starts_at: '2027-02-07T02:00:01Z', ends_at: '2027-02-07T03:00:00Z' },
        ['/starts_at:too_far']
      ],
      ['in the past', { starts_at: '2026-11-08T01:59:59Z', ends_at: '2026-11-08T03:00:00Z' }, ['/starts_at:past']],
      [
        'two at once',
        { starts_at: '2026-11-07T06:00:00Z', ends_at: '2026-11-07T05:00:00Z' },
        ['/ends_at:end_before_start', '/starts_at:past']
      ],
      ['an unknown zone', { tz: 'Mars/Olympus' }, ['/tz:invalid_tz']]
    ])('%s answers 422 validation-failed', async (_name, over, expected) => {
      const response = await declare(editor(), projectId, body(over))
      expect(response.status).toBe(422)
      expect(((await response.clone().json()) as { type: string }).type).toMatch(/validation-failed$/)
      expect(await pointers(response)).toEqual(expected)
    })

    test('the edges are valid: exactly 12 hours, exactly 90 days ahead, starting now', async () => {
      for (const over of [
        { ends_at: '2026-11-09T18:00:00Z' },
        { starts_at: '2027-02-06T02:00:00Z', ends_at: '2027-02-06T03:00:00Z' },
        { starts_at: '2026-11-08T02:00:00Z', ends_at: '2026-11-08T03:00:00Z' }
      ]) {
        expect((await declare(editor(), projectId, body(over))).status).toBe(201)
      }
    })

    test('a zero-length commute_wave is accepted (D13)', async () => {
      const response = await declare(
        editor(),
        projectId,
        body({ kind: 'commute_wave', title: 'Wave', ends_at: '2026-11-09T06:00:00Z' })
      )
      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        kind: 'commute_wave',
        starts_at: '2026-11-09T06:00:00Z',
        ends_at: '2026-11-09T06:00:00Z'
      })
    })
  })

  test('a recurrence declares its materialized series', async () => {
    const response = await declare(
      editor(),
      projectId,
      body({
        title: 'Weekly',
        recurrence: { frequency: 'weekly', days_of_week: ['monday'], count: 3, skip_dates: [] }
      })
    )
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ series_id: expect.any(String) })
    expect(await inOrg(ORG, (tx) => tx.select().from(window).where(eq(window.title, 'Weekly')))).toHaveLength(3)
  })

  test('a Viewer is denied with 403, and an API key without the draft scope too', async () => {
    const viewer = asSession({ org: ORG, role: 'viewer' })
    expect((await declare(viewer, projectId, body())).status).toBe(403)
    expect((await declare(asApiKey({ org: ORG, role: 'editor', scopes: ['read'] }), projectId, body())).status).toBe(
      403
    )
  })

  test('guest and share principals are refused with 403 in this slice', async () => {
    const guest = asSession({ org: ORG, role: 'viewer', guest: true })
    expect((await declare(guest, projectId, body())).status).toBe(403)
    expect((await declare(asGuestToken({ org: ORG, scopes: ['draft'] }), projectId, body())).status).toBe(403)
    expect((await declare(asShareLink({ org: ORG, projectId, access: 'reviewer' }), projectId, body())).status).toBe(
      403
    )
    expect(await inOrg(ORG, (tx) => tx.select().from(window).where(eq(window.guest, true)))).toHaveLength(0)
  })

  test('an unknown project is 404', async () => {
    expect((await declare(editor(), UNKNOWN, body())).status).toBe(404)
  })

  test("createWindow answers 404 for another organisation's project and writes nothing", async () => {
    await crossOrgCase('createWindow', {
      app: v1,
      as: asSession({ org: ORG, role: 'editor' }),
      org: ORG,
      params: { id: otherProjectId },
      body: body()
    }).run()
    expect(await inOrg(OTHER, (tx) => tx.select().from(window))).toHaveLength(0)
  })
})

describe('GET /v1/projects/{id}/windows', () => {
  let listed: string
  beforeAll(async () => {
    listed = (await inOrg(ORG, (tx) => makeProject(tx))).id
    // Three windows at 06:00, 06:00 and 07:00 UTC on 2026-11-09, one on 2026-11-09 16:30 UTC (00:30 on the 10th in KL).
    for (const [title, starts_at, ends_at, kind] of [
      ['A', '2026-11-09T06:00:00Z', '2026-11-09T07:00:00Z', 'class'],
      ['B', '2026-11-09T06:00:00Z', '2026-11-09T07:00:00Z', 'event'],
      ['C', '2026-11-09T07:00:00Z', '2026-11-09T08:00:00Z', 'class'],
      ['D', '2026-11-09T16:30:00Z', '2026-11-09T17:30:00Z', 'class']
    ] as const) {
      expect((await declare(editor(), listed, body({ title, starts_at, ends_at, kind }))).status).toBe(201)
    }
  })
  const titles = async (query: Record<string, string> = {}, as: Principal = editor()) => {
    const response = await list(as, listed, query)
    expect(response.status).toBe(200)
    return ((await response.json()) as Page<View>).data.map((item) => item.title)
  }

  test('orders by starts_at then id and pages with a string next_cursor while more remain', async () => {
    expect(await titles()).toEqual(['A', 'B', 'C', 'D'])
    const first = (await (await list(editor(), listed, { limit: '3' })).json()) as Page<View>
    expect(first.data.map((item) => item.title)).toEqual(['A', 'B', 'C'])
    expect(typeof first.next_cursor).toBe('string')
    const second = (await (
      await list(editor(), listed, { limit: '3', cursor: first.next_cursor! })
    ).json()) as Page<View>
    expect(second.data.map((item) => item.title)).toEqual(['D'])
    expect(second.next_cursor).toBeNull()
  })

  test('a cursor from another project or a made-up one is 422 on /cursor', async () => {
    const stray = encodeCursor({
      v: 1,
      org_id: testOrg(ORG).id,
      project_id: projectId,
      starts_at: '2026-11-09T06:00:00Z',
      id: randomUUID()
    })
    for (const cursor of [stray, 'not-a-cursor']) {
      const response = await list(editor(), listed, { cursor })
      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({ errors: [{ pointer: '/cursor' }] })
    }
  })

  test('filters by kind and by inclusive local dates in the project time zone', async () => {
    expect(await titles({ kind: 'event' })).toEqual(['B'])
    expect(await titles({ from: '2026-11-09', to: '2026-11-09' })).toEqual(['A', 'B', 'C'])
    // D starts at 00:30 on the 10th in Kuala Lumpur.
    expect(await titles({ from: '2026-11-10', to: '2026-11-10' })).toEqual(['D'])
    expect(await titles({ from: '2026-11-10' })).toEqual(['D'])
    expect(await titles({ to: '2026-11-09' })).toEqual(['A', 'B', 'C'])
    const backwards = await list(editor(), listed, { from: '2026-11-10', to: '2026-11-09' })
    expect(backwards.status).toBe(422)
  })

  test('latest_calls hold the newest call of each pack, and at_risk means above Normal', async () => {
    const calls = await inOrg(ORG, async (tx) => {
      const rows = (await tx.select().from(window).where(eq(window.projectId, listed))).sort((x, y) =>
        x.title.localeCompare(y.title)
      )
      const [a, b, c] = rows
      const skyRun = await makeRun(tx, { projectId: listed, pack: 'sky' })
      const crowdRun = await makeRun(tx, { projectId: listed, pack: 'crowd' })
      const sky = await makeBundle(tx, { runId: skyRun.id })
      const crowd = await makeBundle(tx, { runId: crowdRun.id })
      const old = await makeCall(tx, {
        bundleId: sky.id,
        windowId: a!.id,
        mode: 'outdoor_limited',
        draftedAt: new Date('2026-11-08T00:00:00Z'),
        state: 'superseded'
      })
      const newest = await makeCall(tx, {
        bundleId: sky.id,
        windowId: a!.id,
        mode: 'normal',
        watch: true,
        draftedAt: new Date('2026-11-08T01:00:00Z')
      })
      const other = await makeCall(tx, {
        bundleId: crowd.id,
        windowId: a!.id,
        mode: 'surge_night',
        draftedAt: new Date('2026-11-08T01:00:00Z')
      })
      const risky = await makeCall(tx, { bundleId: sky.id, windowId: b!.id, mode: 'commute_disruption', state: 'sent' })
      const noCall = await makeCall(tx, { bundleId: sky.id, windowId: c!.id, mode: null })
      return { a: a!.id, b: b!.id, old, newest, other, risky, noCall }
    })
    const all = ((await (await list(editor(), listed, { include: 'calls' })).json()) as Page<View>).data
    const byTitle = Object.fromEntries(all.map((item) => [item.title, item]))
    expect(byTitle.A!.latest_calls).toEqual({
      sky: { id: calls.newest.id, bundle_id: calls.newest.bundleId, state: 'drafted', mode: 'normal' },
      crowd: { id: calls.other.id, bundle_id: calls.other.bundleId, state: 'drafted', mode: 'surge_night' }
    })
    expect(byTitle.A!.at_risk).toBe(true)
    expect(byTitle.B!.latest_calls).toEqual({
      sky: { id: calls.risky.id, bundle_id: calls.risky.bundleId, state: 'sent', mode: 'commute_disruption' },
      crowd: null
    })
    expect(byTitle.B!.at_risk).toBe(true)
    // No call, and a Normal call, are not at risk; neither is a window with no call at all.
    expect(byTitle.C!.latest_calls.sky).toMatchObject({ mode: null })
    expect([byTitle.C!.at_risk, byTitle.D!.at_risk]).toEqual([false, false])
    expect(await titles({ at_risk: 'true' })).toEqual(['A', 'B'])
    expect(await titles({ at_risk: 'false' })).toEqual(['C', 'D'])
  })

  test('cancelled windows are listed with cancelled_at set', async () => {
    const cancelled = await inOrg(ORG, async (tx) => {
      const [row] = await tx
        .select()
        .from(window)
        .where(and(eq(window.projectId, listed), eq(window.title, 'D')))
      await tx
        .update(window)
        .set({ cancelledAt: new Date('2026-11-08T02:00:00Z') })
        .where(eq(window.id, row!.id))
      return row!.id
    })
    const all = ((await (await list(editor(), listed)).json()) as Page<View>).data
    expect(all.find((item) => item.id === cancelled)?.cancelled_at).toBe('2026-11-08T02:00:00Z')
  })

  test('a share link reads the project windows without titles or declarers', async () => {
    const response = await list(asShareLink({ org: ORG, projectId: listed, access: 'reviewer' }), listed)
    expect(response.status).toBe(200)
    const data = ((await response.json()) as Page<View>).data
    expect(data).toHaveLength(4)
    expect(data.every((item) => item.title === '' && item.declared_by === '')).toBe(true)
  })

  test('a Viewer can read; a share link of another project and an unknown project are 404', async () => {
    expect((await list(asSession({ org: ORG, role: 'viewer' }), listed)).status).toBe(200)
    expect((await list(asShareLink({ org: ORG, projectId, access: 'reviewer' }), listed)).status).toBe(404)
    expect((await list(editor(), UNKNOWN)).status).toBe(404)
  })

  test('an OAuth grant limited to other projects is 404', async () => {
    const grant = asOAuth({ org: ORG, role: 'viewer', projectIds: [projectId] })
    expect((await list(grant, listed)).status).toBe(404)
  })

  test("listWindows answers 404 for another organisation's project", async () => {
    await crossOrgCase('listWindows', {
      app: v1,
      as: asSession({ org: ORG, role: 'editor' }),
      org: ORG,
      params: { id: otherProjectId }
    }).run()
  })
})
