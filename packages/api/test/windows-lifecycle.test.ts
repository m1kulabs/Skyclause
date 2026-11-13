import { randomUUID } from 'node:crypto'
import type { BudgetGate, Principal } from '@skyclause/contracts'
import {
  analyticsEvent,
  domainEvent,
  icsFeed,
  ledgerEntry,
  listDueNativeWindowSeries,
  windowLocalSpan,
  readWindowSeriesDefinition,
  window,
  windowSeries,
  withSystem,
  withTenant,
  systemPrincipal,
  type Tx
} from '@skyclause/db'
import {
  makeCall,
  makeOrganization,
  makeProject,
  makeWindow,
  makeWindowSeries,
  makeIcsFeed
} from '@skyclause/db/test/factories/index'
import { and, eq } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { cancelWindow, createWindow, createWindowSeries, updateWindow, windowViolations } from '../src/services/windows'
import { extendDueWindowSeries } from '../src/services/windows/due-native'
import { materializeNative, parseRule } from '../src/services/windows/series'
import {
  apiRequest,
  asApiKey,
  asOAuth,
  asSession,
  asGuestToken,
  asShareLink,
  createTestApi,
  testCan,
  testDeps,
  testOrg
} from './harness'

const ORG = 'window-lifecycle-member'
const OTHER = 'window-lifecycle-foreign'
const now = new Date('2026-11-08T02:00:00Z')
const deps = testDeps({ withTenant })
const { v1 } = createTestApi({ deps })
const run = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId: testOrg(ORG).id, principal: systemPrincipal('test') }, fn)
const editor = () => asSession({ org: ORG, role: 'editor' })
const rule = { frequency: 'weekly', days_of_week: ['monday', 'wednesday'], count: 12, skip_dates: ['2026-11-25'] }
const fields = (patch: Record<string, unknown> = {}) => ({
  title: 'Lecture',
  kind: 'class',
  starts_at: '2026-11-16T01:00:00.123Z',
  ends_at: '2026-11-16T02:00:00.123Z',
  tz: 'Asia/Kuala_Lumpur',
  ...patch
})
let projectId: string
let foreign: string
beforeAll(async () => {
  for (const slug of [ORG, OTHER]) await makeOrganization({ id: testOrg(slug).id, slug })
  projectId = (await run(makeProject)).id
  foreign = await withTenant(
    { orgId: testOrg(OTHER).id, principal: systemPrincipal('test') },
    async (tx) => (await makeWindow(tx)).id
  )
})
const post = (payload: unknown, as: Principal = editor(), key = randomUUID()) =>
  apiRequest(v1, {
    as,
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${projectId}/windows`,
    body: payload,
    idempotencyKey: key
  })
const mutate = (
  id: string,
  method: 'PATCH' | 'DELETE',
  body?: unknown,
  scope = 'occurrence',
  as: Principal = editor()
) => apiRequest(v1, { as, org: ORG, method, path: `/v1/windows/${id}`, body, query: { scope } })
type View = {
  id: string
  series_id: string | null
  title: string
  starts_at: string
  ends_at: string
  tz: string
  cancelled_at: string | null
  latest_calls: { sky: { id: string; state: string } | null }
}
async function create(patch: Record<string, unknown> = {}) {
  const response = await post(fields(patch))
  expect(response.status).toBe(201)
  return (await response.json()) as View
}
const members = (id: string) =>
  run((tx) => tx.select().from(window).where(eq(window.seriesId, id)).orderBy(window.startsAt))
const events = (id: string) =>
  run(async (tx) =>
    (await tx.select().from(domainEvent)).filter((row) => (row.data as { window_id: string }).window_id === id)
  )

test.each(['member', 'api', 'oauth-api', 'mcp', 'cli'] as const)(
  'recurring %s POST replays one series, eleven identities and eleven events',
  async (cohort) => {
    const as =
      cohort === 'api'
        ? asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] })
        : cohort === 'oauth-api' || cohort === 'mcp'
          ? asOAuth({ org: ORG, role: 'editor', scopes: ['draft'], resource: cohort === 'mcp' ? 'mcp' : 'api' })
          : asSession({ org: ORG, role: 'editor', via: cohort === 'cli' ? 'bearer' : 'cookie' })
    const key = randomUUID()
    const payload = fields({ title: `Repeated ${cohort}`, recurrence: rule })
    const first = await post(payload, as, key)
    expect(first.status).toBe(201)
    const view = (await first.json()) as View
    const replay = await post(payload, as, key)
    expect(replay.status).toBe(201)
    expect(await replay.json()).toEqual(view)
    const rows = await members(view.series_id!)
    expect(rows.map((row) => row.seriesOccurrenceDate)).toEqual([
      '2026-11-16',
      '2026-11-18',
      '2026-11-23',
      '2026-11-30',
      '2026-12-02',
      '2026-12-07',
      '2026-12-09',
      '2026-12-14',
      '2026-12-16',
      '2026-12-21',
      '2026-12-23'
    ])
    expect(rows[0]!.id).toBe(view.id)
    expect(rows.every((row) => row.startsAt.toISOString().endsWith('01:00:00.123Z'))).toBe(true)
    const saved = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)))
    expect(saved[0]!.definition).toMatchObject({
      version: 1,
      anchor: '2026-11-16',
      endDayOffset: 0,
      title: `Repeated ${cohort}`
    })
    const emitted = await run((tx) => tx.select().from(domainEvent))
    expect(emitted.filter((event) => (event.data as { series_id?: string }).series_id === view.series_id)).toHaveLength(
      11
    )
    const tracked = await withSystem('test', (tx) =>
      tx
        .select()
        .from(analyticsEvent)
        .where(and(eq(analyticsEvent.projectId, projectId), eq(analyticsEvent.name, 'window_declared')))
    )
    expect(tracked.some((row) => (row.props as { recurring: boolean }).recurring)).toBe(true)
    expect((await post({ ...payload, title: 'Changed' }, as, key)).status).toBe(422)
  }
)

test.each([
  { org_id: randomUUID() },
  { guest: true },
  { declared_by: 'spoof' },
  { recurrence: { ...rule, injected: true } }
])('POST rejects spoofed/unknown fields %j', async (patch) => {
  expect((await post(fields(patch))).status).toBe(422)
})

test('shared validator retains independent UI codes and refuses submillisecond input', () => {
  expect(
    windowViolations(
      fields({ starts_at: '2026-11-07T01:00:00Z', ends_at: '2026-11-07T00:00:00Z', tz: 'unknown' }) as never,
      now
    ).map((e) => e.code)
  ).toEqual(['invalid_tz', 'end_before_start', 'past'])
  expect(windowViolations(fields({ starts_at: '2026-11-16T01:00:00.1234Z' }) as never, now)).toMatchObject([
    { pointer: '/starts_at', code: 'invalid_instant' }
  ])
})

test('entirely skipped series and invalid recurrence leave no series or rows', async () => {
  const before = await run((tx) => tx.select().from(windowSeries))
  for (const recurrence of [
    { ...rule, count: 1, skip_dates: ['2026-11-16'] },
    { ...rule, days_of_week: ['tuesday'] },
    { ...rule, until: '2026-12-01' }
  ]) {
    const response = await post(fields({ recurrence }))
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ pointer: expect.stringMatching(/^\/recurrence/) })])
    })
  }
  expect(await run((tx) => tx.select().from(windowSeries))).toEqual(before)
})

test('occurrence overrides only itself, series explicit fields replace overrides and preserve other fields', async () => {
  const view = await create({ recurrence: rule })
  const rows = await members(view.series_id!)
  const second = rows[1]!
  expect((await mutate(second.id, 'PATCH', { title: 'Override', tz: 'UTC' })).status).toBe(200)
  const override = (await members(view.series_id!))[1]!
  expect(override).toMatchObject({ title: 'Override', tz: 'UTC', localOverride: true, startsAt: second.startsAt })
  expect((await mutate(view.id, 'PATCH', { title: 'All revised' }, 'series')).status).toBe(200)
  const revised = await members(view.series_id!)
  expect(revised.every((row) => row.title === 'All revised')).toBe(true)
  expect(revised[1]!.tz).toBe('UTC')
  expect(revised[1]!.startsAt).toEqual(second.startsAt)
})

test('same effective patch emits no event and does not manufacture a local override', async () => {
  const view = await create({ recurrence: rule })
  const before = await events(view.id)
  expect((await mutate(view.id, 'PATCH', { title: view.title, starts_at: view.starts_at })).status).toBe(200)
  expect(await events(view.id)).toEqual(before)
  expect((await members(view.series_id!))[0]!.localOverride).toBe(false)
  expect((await mutate(view.id, 'PATCH', {})).status).toBe(422)
  expect((await mutate(view.id, 'PATCH', { recurrence: rule })).status).toBe(422)
})

test('rule changes retain original dates and count, cancel removed identities and preserve tombstones', async () => {
  const view = await create({ recurrence: rule })
  const original = await members(view.series_id!)
  const second = original[1]!
  expect((await mutate(second.id, 'DELETE')).status).toBe(200)
  const change = { ...rule, days_of_week: ['monday', 'friday'], count: 12 }
  expect((await mutate(view.id, 'PATCH', { recurrence: change }, 'series')).status).toBe(200)
  let rows = await members(view.series_id!)
  expect(rows.find((row) => row.id === view.id)?.cancelledAt).toBeNull()
  expect(rows.find((row) => row.id === second.id)?.cancelledAt).not.toBeNull()
  expect(rows.filter((row) => !row.cancelledAt).map((row) => row.seriesOccurrenceDate)).toEqual([
    '2026-11-16',
    '2026-11-20',
    '2026-11-23',
    '2026-11-27',
    '2026-11-30',
    '2026-12-04',
    '2026-12-07',
    '2026-12-11',
    '2026-12-14',
    '2026-12-18',
    '2026-12-21',
    '2026-12-25'
  ])
  expect((await mutate(view.id, 'PATCH', { recurrence: rule }, 'series')).status).toBe(200)
  rows = await members(view.series_id!)
  expect(rows.find((row) => row.id === second.id)?.cancelledAt).not.toBeNull()
})

test('series timezone-only edits preserve template wall clocks and occurrence timezone-only edits preserve instants', async () => {
  const view = await create({ recurrence: rule })
  expect((await mutate(view.id, 'PATCH', { tz: 'UTC' }, 'series')).status).toBe(200)
  expect((await members(view.series_id!))[0]!.startsAt.toISOString()).toBe('2026-11-16T09:00:00.123Z')
})

test('historical occurrence withdrawal retains calls/times and writes one current ledger entry', async () => {
  const row = await run((tx) =>
    makeWindow(tx, { projectId, startsAt: new Date('2026-11-01T01:00:00Z'), endsAt: new Date('2026-11-01T02:00:00Z') })
  )
  const sent = await run((tx) => makeCall(tx, { projectId, windowId: row.id, state: 'sent' }))
  expect((await mutate(row.id, 'PATCH', { title: 'Annotated' })).status).toBe(200)
  expect((await mutate(row.id, 'PATCH', { starts_at: '2026-11-02T01:00:00Z' })).status).toBe(422)
  const response = await mutate(row.id, 'DELETE')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    starts_at: '2026-11-01T01:00:00Z',
    ends_at: '2026-11-01T02:00:00Z',
    cancelled_at: '2026-11-08T02:00:00Z',
    latest_calls: { sky: { id: sent.id, state: 'sent' } }
  })
  expect((await mutate(row.id, 'DELETE')).status).toBe(200)
  expect(
    (await run((tx) => tx.select().from(ledgerEntry))).filter(
      (e) => (e.refs as { window_id?: string }).window_id === row.id
    )
  ).toHaveLength(1)
  expect((await mutate(row.id, 'PATCH', { title: 'Cancelled' })).status).toBe(409)
})

test('series cancellation retains started history, returns the selected ID and stops generation', async () => {
  const view = await create({ recurrence: rule })
  const row = await run(async (tx) => {
    const [saved] = await tx
      .update(window)
      .set({ startsAt: new Date('2026-11-01T01:00:00Z'), endsAt: new Date('2026-11-01T02:00:00Z') })
      .where(eq(window.id, view.id))
      .returning()
    return saved!
  })
  const response = await mutate(view.id, 'DELETE', undefined, 'series')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: row.id, cancelled_at: null, starts_at: '2026-11-01T01:00:00Z' })
  expect((await members(view.series_id!)).filter((member) => member.cancelledAt)).toHaveLength(10)
  expect((await mutate(view.id, 'DELETE', undefined, 'series')).status).toBe(200)
  expect((await mutate(view.id, 'PATCH', { title: 'Inactive' }, 'series')).status).toBe(409)
})

test('legacy and manual non-series scope conflicts are explicit; imported recurrence is source-owned', async () => {
  const single = await create()
  expect((await mutate(single.id, 'PATCH', { title: 'All' }, 'series')).status).toBe(422)
  const legacy = await run(async (tx) => {
    const series = await makeWindowSeries(tx, { projectId })
    return makeWindow(tx, { projectId, seriesId: series.id })
  })
  expect((await mutate(legacy.id, 'PATCH', { title: 'Legacy' }, 'series')).status).toBe(409)
  const imported = await run(async (tx) => {
    const feed = await makeIcsFeed(tx, { projectId })
    const series = await makeWindowSeries(tx, {
      projectId,
      icsFeedId: feed.id,
      icsUid: 'source',
      definition: { version: 1, source: 'ics', manualDefaults: {} }
    })
    return makeWindow(tx, {
      projectId,
      seriesId: series.id,
      icsFeedId: feed.id,
      icsUid: 'source',
      icsRecurrenceId: 'original',
      startsAt: new Date('2026-11-16T01:00:00Z'),
      endsAt: new Date('2026-11-16T02:00:00Z')
    })
  })
  expect((await mutate(imported.id, 'PATCH', { recurrence: rule }, 'series')).status).toBe(422)
  expect((await mutate(imported.id, 'PATCH', { title: 'Manual' }, 'series')).status).toBe(200)
  expect((await events(imported.id))[0]!.data).not.toHaveProperty('calendar')
  expect((await run((tx) => tx.select().from(window).where(eq(window.id, imported.id))))[0]).toMatchObject({
    icsUid: 'source',
    icsRecurrenceId: 'original',
    localOverride: true
  })
})

test.each(['PATCH', 'DELETE'] as const)(
  '%s authorizes before target discovery and enforces tenant/resource scope',
  async (method) => {
    const payload = method === 'PATCH' ? { title: 'Revised' } : undefined
    const unknown = '01900000-0000-7000-8000-000000000000'
    for (const id of [unknown, foreign])
      expect((await mutate(id, method, payload, 'occurrence', asSession({ org: ORG, role: 'viewer' }))).status).toBe(
        403
      )
    expect((await mutate(foreign, method, payload)).status).toBe(404)
    const own = await create()
    expect(
      (
        await mutate(
          own.id,
          method,
          payload,
          'occurrence',
          asOAuth({ org: ORG, role: 'editor', scopes: ['draft'], projectIds: [] })
        )
      ).status
    ).toBe(404)
    for (const as of [
      asGuestToken({ org: ORG, scopes: ['draft'] }),
      asShareLink({ org: ORG, projectId, access: 'reviewer' }),
      asSession({ org: ORG, role: 'editor', guest: true })
    ])
      expect((await mutate(own.id, method, payload, 'occurrence', as)).status).toBe(403)
  }
)

test('direct service writes validate strict input again and deny scopes before looking up IDs', async () => {
  const key = asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] })
  const denied = asApiKey({ org: ORG, role: 'editor', scopes: ['read'] })
  const access = { can: testCan, now }
  const view = await create()
  for (const principal of [denied, { ...key, role: 'viewer' as const }]) {
    for (const id of [view.id, foreign, randomUUID()]) {
      await expect(
        withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
          updateWindow({ tx, principal }, { id, scope: 'occurrence', patch: { title: 'Denied' } }, access)
        )
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
          cancelWindow({ tx, principal }, { id, scope: 'occurrence' }, access)
        )
      ).rejects.toMatchObject({ status: 403 })
    }
  }
  const direct = <T>(fn: (ctx: { tx: Tx; principal: Principal }) => Promise<T>) =>
    withTenant({ orgId: testOrg(ORG).id, principal: key }, (tx) => fn({ tx, principal: key }))
  await expect(
    direct((ctx) => createWindow(ctx, { projectId, body: fields({ org_id: randomUUID() }) as never }, access))
  ).rejects.toMatchObject({ status: 422 })
  await expect(
    direct((ctx) =>
      updateWindow(ctx, { id: view.id, scope: 'occurrence', patch: { declared_by: 'spoof' } as never }, access)
    )
  ).rejects.toMatchObject({ status: 422 })
  await expect(direct((ctx) => cancelWindow(ctx, { id: foreign, scope: 'occurrence' }, access))).rejects.toMatchObject({
    status: 404
  })
  await expect(
    direct((ctx) => cancelWindow(ctx, { id: view.id, scope: 'all' as never }, access))
  ).rejects.toMatchObject({ status: 422 })
  await expect(
    withTenant({ orgId: testOrg(OTHER).id, principal: key }, (tx) =>
      updateWindow({ tx, principal: key }, { id: foreign, scope: 'occurrence', patch: { title: 'Mismatch' } }, access)
    )
  ).rejects.toMatchObject({ status: 404 })
  await expect(
    direct((ctx) =>
      updateWindow(
        ctx,
        { id: view.id, scope: 'occurrence', patch: { title: 'Scoped' } },
        { ...access, can: (p, s, target) => !target && testCan(p, s) }
      )
    )
  ).rejects.toMatchObject({ status: 403 })
})

test('real-shaped member budget refusal rolls back all series writes and uses ceiling Retry-After', async () => {
  const principal = asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] })
  let charged = 0
  const budget: BudgetGate = {
    async consume(handle, _principal, kind) {
      if (kind !== 'window' || (handle as Tx).orgId !== testOrg(ORG).id) throw new Error('wrong budget boundary')
      charged += 1
      return charged === 3 ? { ok: false, resetsAt: '2026-11-08T02:01:00.001Z' } : { ok: true }
    }
  }
  const before = await run(async (tx) => ({
    windows: await tx.select().from(window),
    series: await tx.select().from(windowSeries),
    events: await tx.select().from(domainEvent)
  }))
  await expect(
    withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
      createWindowSeries(
        { tx, principal },
        { projectId, body: fields({ recurrence: rule }) as never },
        { can: testCan, now, budget }
      )
    )
  ).rejects.toMatchObject({
    status: 429,
    extra: { resets_at: '2026-11-08T02:01:00.001Z' },
    headers: { 'Retry-After': '61' }
  })
  expect(
    await run(async (tx) => ({
      windows: await tx.select().from(window),
      series: await tx.select().from(windowSeries),
      events: await tx.select().from(domainEvent)
    }))
  ).toEqual(before)
})

test('series edits preserve started members and selected ID when recurrence removes its future identity', async () => {
  const view = await create({ recurrence: rule })
  const rows = await members(view.series_id!)
  await run((tx) =>
    tx
      .update(window)
      .set({ startsAt: new Date('2026-11-01T01:00:00Z'), endsAt: new Date('2026-11-01T02:00:00Z') })
      .where(eq(window.id, view.id))
  )
  expect(
    (
      await mutate(
        rows[1]!.id,
        'PATCH',
        { title: 'Future', recurrence: { ...rule, days_of_week: ['monday'] } },
        'series'
      )
    ).status
  ).toBe(200)
  expect((await members(view.series_id!)).find((row) => row.id === view.id)?.title).toBe('Lecture')
  expect((await members(view.series_id!)).find((row) => row.id === rows[1]!.id)?.cancelledAt).not.toBeNull()
  const response = await mutate(rows[2]!.id, 'PATCH', { title: 'Still selected' }, 'series')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: rows[2]!.id, title: 'Still selected' })
})

test('native series date shifts retain original anchor/count/identity rather than restarting at selected date', async () => {
  const view = await create({ recurrence: { ...rule, count: 3, skip_dates: [] } })
  const rows = await members(view.series_id!)
  const response = await mutate(
    rows[1]!.id,
    'PATCH',
    { starts_at: '2026-11-19T01:00:00.123Z', ends_at: '2026-11-19T02:00:00.123Z' },
    'series'
  )
  expect(response.status).toBe(200)
  const shifted = await members(view.series_id!)
  expect(shifted.map((row) => [row.id, row.seriesOccurrenceDate, row.startsAt.toISOString()])).toEqual([
    [rows[0]!.id, '2026-11-16', '2026-11-17T01:00:00.123Z'],
    [rows[1]!.id, '2026-11-18', '2026-11-19T01:00:00.123Z'],
    [rows[2]!.id, '2026-11-23', '2026-11-24T01:00:00.123Z']
  ])
  expect(
    (await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!))))[0]!.definition
  ).toMatchObject({ anchor: '2026-11-16', dateOffsetDays: 1 })
})

test('imported same-effective series patch leaves defaults, claim and local override unchanged', async () => {
  const claim = randomUUID()
  const imported = await run(async (tx) => {
    const feed = await makeIcsFeed(tx, { projectId, refreshClaim: claim })
    const series = await makeWindowSeries(tx, {
      projectId,
      icsFeedId: feed.id,
      icsUid: 'same',
      definition: { version: 1, source: 'ics', manualDefaults: {} },
      localStart: '09:00',
      localEnd: '10:00'
    })
    const row = await makeWindow(tx, {
      projectId,
      seriesId: series.id,
      icsFeedId: feed.id,
      icsUid: 'same',
      icsRecurrenceId: 'identity',
      title: 'Same',
      startsAt: new Date('2026-11-16T01:00:00Z'),
      endsAt: new Date('2026-11-16T02:00:00Z')
    })
    return { row, series, feed }
  })
  expect((await mutate(imported.row.id, 'PATCH', { title: 'Same' }, 'series')).status).toBe(200)
  expect(await events(imported.row.id)).toEqual([])
  expect((await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, imported.series.id))))[0]).toEqual(
    imported.series
  )
  expect((await run((tx) => tx.select().from(window).where(eq(window.id, imported.row.id))))[0]!.localOverride).toBe(
    false
  )
  expect((await run((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, imported.feed.id))))[0]!.refreshClaim).toBe(
    claim
  )
})

test('after a date shift explicit recurrence weekdays/until/skips use visible local dates exactly once', async () => {
  const view = await create({ recurrence: { ...rule, count: 3, skip_dates: [] } })
  const rows = await members(view.series_id!)
  expect(
    (
      await mutate(
        rows[1]!.id,
        'PATCH',
        { starts_at: '2026-11-19T01:00:00.123Z', ends_at: '2026-11-19T02:00:00.123Z' },
        'series'
      )
    ).status
  ).toBe(200)
  const counted = { frequency: 'weekly', days_of_week: ['tuesday', 'friday'], count: 3, skip_dates: ['2026-11-20'] }
  expect((await mutate(view.id, 'PATCH', { recurrence: counted }, 'series')).status).toBe(200)
  expect(
    (await members(view.series_id!))
      .filter((row) => !row.cancelledAt)
      .map((row) => row.startsAt.toISOString().slice(0, 10))
  ).toEqual(['2026-11-17', '2026-11-24'])
  const until = {
    frequency: 'weekly',
    days_of_week: ['tuesday', 'friday'],
    until: '2026-11-27',
    skip_dates: ['2026-11-24']
  }
  expect((await mutate(view.id, 'PATCH', { recurrence: until }, 'series')).status).toBe(200)
  expect(
    (await members(view.series_id!))
      .filter((row) => !row.cancelledAt)
      .map((row) => [row.seriesOccurrenceDate, row.startsAt.toISOString().slice(0, 10)])
  ).toEqual([
    ['2026-11-16', '2026-11-17'],
    ['2026-11-19', '2026-11-20'],
    ['2026-11-26', '2026-11-27']
  ])
  expect((await members(view.series_id!)).find((row) => row.id === rows[1]!.id)?.cancelledAt).not.toBeNull()
})

test('successive imported series clock edits do not reapply the stored source date shift', async () => {
  const row = await run(async (tx) => {
    const feed = await makeIcsFeed(tx, { projectId })
    const series = await makeWindowSeries(tx, {
      projectId,
      icsFeedId: feed.id,
      icsUid: 'time-edits',
      definition: { version: 1, source: 'ics', manualDefaults: {} }
    })
    return makeWindow(tx, {
      projectId,
      seriesId: series.id,
      icsFeedId: feed.id,
      icsUid: 'time-edits',
      icsRecurrenceId: 'original-date',
      startsAt: new Date('2026-11-16T01:00:00Z'),
      endsAt: new Date('2026-11-16T02:00:00Z'),
      tz: 'Asia/Kuala_Lumpur'
    })
  })
  expect(
    (await mutate(row.id, 'PATCH', { starts_at: '2026-11-17T01:00:00Z', ends_at: '2026-11-17T02:00:00Z' }, 'series'))
      .status
  ).toBe(200)
  const response = await mutate(
    row.id,
    'PATCH',
    { starts_at: '2026-11-17T02:00:00Z', ends_at: '2026-11-17T03:00:00Z' },
    'series'
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    id: row.id,
    starts_at: '2026-11-17T02:00:00Z',
    ends_at: '2026-11-17T03:00:00Z'
  })
  expect(
    (await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, row.seriesId!))))[0]!.definition
  ).toMatchObject({
    manualDefaults: { dateOffsetDays: 1, localStart: '10:00:00.000', localEnd: '11:00:00.000', endDayOffset: 0 }
  })
})

test('hidden rows are unavailable and deleted imported parents conflict without changing rows/events', async () => {
  const hidden = await run((tx) => makeWindow(tx, { projectId, moderation: 'hidden_pending_review' }))
  for (const method of ['PATCH', 'DELETE'] as const)
    expect((await mutate(hidden.id, method, method === 'PATCH' ? { title: 'Hidden' } : undefined)).status).toBe(404)
  const imported = await run(async (tx) => {
    const feed = await makeIcsFeed(tx, { projectId, deletedAt: now })
    const row = await makeWindow(tx, { projectId, icsFeedId: feed.id, icsUid: 'inactive', icsRecurrenceId: '' })
    return row
  })
  for (const method of ['PATCH', 'DELETE'] as const)
    expect((await mutate(imported.id, method, method === 'PATCH' ? { title: 'Inactive' } : undefined)).status).toBe(409)
  expect(await events(imported.id)).toEqual([])
})

test('member windows in Commons use the genuine unavailable budget gate', async () => {
  const slug = 'commons'
  await makeOrganization({ id: testOrg(slug).id, slug })
  const principal = asApiKey({ org: slug, role: 'editor', scopes: ['draft'] })
  const target = await withTenant({ orgId: testOrg(slug).id, principal }, makeProject)
  const response = await apiRequest(v1, {
    as: principal,
    org: slug,
    method: 'POST',
    path: `/v1/projects/${target.id}/windows`,
    body: fields({ recurrence: rule }),
    idempotencyKey: randomUUID()
  })
  expect(response.status).toBe(501)
  expect(await response.json()).toMatchObject({ owner: 'd-guest-rules' })
  expect(await withTenant({ orgId: testOrg(slug).id, principal }, (tx) => tx.select().from(windowSeries))).toEqual([])
})

test('a series edit validates every effective override before changing any member or metadata', async () => {
  const view = await create({ recurrence: { ...rule, count: 3, skip_dates: [] } })
  const rows = await members(view.series_id!)
  expect(
    (await mutate(rows[1]!.id, 'PATCH', { kind: 'commute_wave', ends_at: rows[1]!.startsAt.toISOString() })).status
  ).toBe(200)
  const before = await run(async (tx) => ({
    rows: await tx.select().from(window).where(eq(window.seriesId, view.series_id!)).orderBy(window.id),
    series: await tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)),
    events: await tx.select().from(domainEvent)
  }))
  expect((await mutate(view.id, 'PATCH', { title: 'Must roll back', kind: 'class' }, 'series')).status).toBe(422)
  expect(
    await run(async (tx) => ({
      rows: await tx.select().from(window).where(eq(window.seriesId, view.series_id!)).orderBy(window.id),
      series: await tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)),
      events: await tx.select().from(domainEvent)
    }))
  ).toEqual(before)
  const differentActor = asApiKey({ org: ORG, role: 'editor', scopes: ['draft'] })
  expect((await mutate(view.id, 'PATCH', { title: 'An annotation' }, 'occurrence', differentActor)).status).toBe(200)
  const after = (await members(view.series_id!)).find((row) => row.id === view.id)!
  expect([after.declaredBy, after.via, after.guest, after.shareLinkId]).toEqual([
    rows[0]!.declaredBy,
    rows[0]!.via,
    false,
    null
  ])
})

// Review I1: original rule membership is independent of today's new-materialization horizon.
test('unchanged series recurrence after the original date preserves a moved future override and its sent call', async () => {
  const view = await create({ recurrence: rule })
  const rows = await members(view.series_id!)
  expect(
    (await mutate(view.id, 'PATCH', { starts_at: '2026-11-20T01:00:00.123Z', ends_at: '2026-11-20T02:00:00.123Z' }))
      .status
  ).toBe(200)
  const sent = await run((tx) => makeCall(tx, { projectId, windowId: view.id, state: 'sent' }))
  const snapshot = () =>
    run(async (tx) => ({
      rows: await tx.select().from(window).where(eq(window.seriesId, view.series_id!)).orderBy(window.id),
      series: await tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)),
      events: (await tx.select().from(domainEvent)).filter(
        (event) => (event.data as { series_id?: string }).series_id === view.series_id
      ),
      ledger: await tx.select().from(ledgerEntry)
    }))
  const before = await snapshot()
  const late = createTestApi({ deps: testDeps({ withTenant, now: () => new Date('2026-11-17T02:00:00Z') }) })
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await apiRequest(late.v1, {
      as: editor(),
      org: ORG,
      method: 'PATCH',
      path: `/v1/windows/${rows[1]!.id}`,
      query: { scope: 'series' },
      body: { recurrence: rule }
    })
    expect(response.status).toBe(200)
    expect(await snapshot()).toEqual(before)
  }
  const listed = await apiRequest(late.v1, {
    as: editor(),
    org: ORG,
    method: 'GET',
    path: `/v1/projects/${projectId}/windows`
  })
  expect(((await listed.json()) as { data: View[] }).data.find((row) => row.id === view.id)).toMatchObject({
    cancelled_at: null,
    latest_calls: { sky: { id: sent.id, state: 'sent' } }
  })
})

test.each([false, true])(
  'a positive seven-day shift refuses its over-horizon tail atomically; explicit equivalent rule=%s',
  async (explicit) => {
    const recurrence = { ...rule, count: 100, skip_dates: [] }
    const view = await create({ recurrence })
    const rows = await members(view.series_id!)
    expect(rows.slice(-2).map((row) => row.seriesOccurrenceDate)).toEqual(['2027-02-01', '2027-02-03'])
    for (const row of rows.slice(-2)) await run((tx) => makeCall(tx, { projectId, windowId: row.id, state: 'sent' }))
    const snapshot = () =>
      run(async (tx) => ({
        rows: await tx.select().from(window).where(eq(window.seriesId, view.series_id!)).orderBy(window.id),
        series: await tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)),
        events: (await tx.select().from(domainEvent)).filter(
          (event) => (event.data as { series_id?: string }).series_id === view.series_id
        ),
        ledger: await tx.select().from(ledgerEntry)
      }))
    const before = await snapshot()
    const response = await mutate(
      view.id,
      'PATCH',
      {
        starts_at: '2026-11-23T01:00:00.123Z',
        ends_at: '2026-11-23T02:00:00.123Z',
        ...(explicit ? { recurrence } : {})
      },
      'series'
    )
    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ pointer: '/starts_at', code: 'too_far' })])
    })
    expect(await snapshot()).toEqual(before)
  }
)

test('series PATCH reports invalid zone and all independent supplied time violations together', async () => {
  const view = await create({ recurrence: rule })
  const response = await mutate(
    view.id,
    'PATCH',
    { tz: 'unknown', starts_at: '2026-11-07T01:00:00Z', ends_at: '2026-11-07T00:00:00Z' },
    'series'
  )
  expect(response.status).toBe(422)
  expect(
    ((await response.json()) as { errors: Array<{ in: string; pointer: string; code: string }> }).errors.map(
      ({ in: where, pointer, code }) => [where, pointer, code]
    )
  ).toEqual([
    ['body', '/tz', 'invalid_tz'],
    ['body', '/ends_at', 'end_before_start'],
    ['body', '/starts_at', 'past']
  ])
})

test('series PATCH validates supplied kind with supplied times', async () => {
  const view = await create({ recurrence: rule })
  expect((await mutate(view.id, 'PATCH', { kind: 'commute_wave', ends_at: view.starts_at }, 'series')).status).toBe(200)
})

test('series PATCH exempts unchanged historical instants from creation-time bounds', async () => {
  const historical = await create({ recurrence: rule })
  const late = createTestApi({ deps: testDeps({ withTenant, now: () => new Date('2026-11-17T02:00:00Z') }) })
  const response = await apiRequest(late.v1, {
    as: editor(),
    org: ORG,
    method: 'PATCH',
    path: `/v1/windows/${historical.id}`,
    query: { scope: 'series' },
    body: { starts_at: historical.starts_at }
  })
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ id: historical.id, starts_at: historical.starts_at })
})

test.each([
  { selection: 'started', at: '2026-11-17T02:00:00Z', status: 200 },
  { selection: 'future', at: '2026-11-08T02:00:00Z', status: 422 }
])('series kind reset respects a $selection selected zero-duration override', async ({ at, status }) => {
  const view = await create({ recurrence: { ...rule, count: 3, skip_dates: [] } })
  expect((await mutate(view.id, 'PATCH', { kind: 'commute_wave', ends_at: view.starts_at })).status).toBe(200)
  const sent = await run((tx) => makeCall(tx, { projectId, windowId: view.id, state: 'sent' }))
  const snapshot = () =>
    run(async (tx) => ({
      rows: await tx.select().from(window).where(eq(window.seriesId, view.series_id!)).orderBy(window.id),
      series: await tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)),
      events: (await tx.select().from(domainEvent)).filter(
        (event) => (event.data as { series_id?: string }).series_id === view.series_id
      ),
      ledger: await tx.select().from(ledgerEntry)
    }))
  const before = await snapshot()
  const app = createTestApi({ deps: testDeps({ withTenant, now: () => new Date(at) }) })
  const response = await apiRequest(app.v1, {
    as: editor(),
    org: ORG,
    method: 'PATCH',
    path: `/v1/windows/${view.id}`,
    query: { scope: 'series' },
    body: { kind: 'class' }
  })
  expect(response.status).toBe(status)
  if (status === 200) {
    expect(await response.json()).toMatchObject({
      id: view.id,
      kind: 'commute_wave',
      starts_at: view.starts_at,
      ends_at: view.starts_at,
      latest_calls: { sky: { id: sent.id, state: 'sent' } }
    })
    expect(
      before.rows
        .filter((row) => row.id !== view.id)
        .map((row) => [row.kind, row.startsAt.toISOString(), row.endsAt.toISOString()])
    ).toEqual([
      ['class', '2026-11-18T01:00:00.123Z', '2026-11-18T02:00:00.123Z'],
      ['class', '2026-11-23T01:00:00.123Z', '2026-11-23T02:00:00.123Z']
    ])
  } else {
    expect(await response.json()).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ pointer: '/ends_at', code: 'end_before_start' })])
    })
  }
  // The historical selection is immutable; refusing the future invalid target also applies no partial plan.
  expect(await snapshot()).toEqual(before)
})

test.each([{ count: 30 }, { until: '2027-06-06' }])(
  'a declared native series with %j refuses a future DST gap but extends after its civil date passes',
  async (end) => {
    const p = await run(makeProject)
    const declarationNow = new Date('2026-11-13T00:00:00Z')
    const app = createTestApi({ deps: testDeps({ withTenant, now: () => declarationNow }) }).v1
    const response = await apiRequest(app, {
      as: editor(),
      org: ORG,
      method: 'POST',
      path: `/v1/projects/${p.id}/windows`,
      idempotencyKey: randomUUID(),
      body: fields({
        title: 'London weekly',
        starts_at: '2026-11-15T01:30:00Z',
        ends_at: '2026-11-15T02:30:00Z',
        tz: 'Europe/London',
        recurrence: { frequency: 'weekly', days_of_week: ['sunday'], ...end, skip_dates: ['2026-12-06'] }
      })
    })
    expect(response.status).toBe(201)
    const view = (await response.json()) as View
    const seriesId = view.series_id!
    const before = await members(seriesId)
    const [original] = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, seriesId)))
    expect(before).toHaveLength(12)
    expect(before.map((row) => row.seriesOccurrenceDate)).not.toContain('2026-12-06')
    const principal = systemPrincipal('windows-due')
    for (const now of [new Date('2027-03-01T00:00:00Z'), new Date('2027-03-28T00:00:00Z')]) {
      await expect(
        withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
          extendDueWindowSeries({ tx, principal }, { projectId: p.id, seriesId, now })
        )
      ).rejects.toMatchObject({ status: 422 })
      expect(await members(seriesId)).toEqual(before)
      const [unchanged] = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, seriesId)))
      expect(unchanged).toEqual(original)
    }
    const afterGap = new Date('2027-03-29T00:00:00Z')
    await withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
      extendDueWindowSeries({ tx, principal }, { projectId: p.id, seriesId, now: afterGap })
    )
    const after = await members(seriesId)
    expect(after).toHaveLength(22)
    expect(after.slice(0, before.length)).toEqual(before)
    const identities = after.map((row) => row.seriesOccurrenceDate)
    expect(identities).not.toContain('2027-03-28')
    expect(identities).not.toContain('2027-03-21')
    expect(identities).toContain('2027-04-04')
    expect(identities).toContain('2027-06-06')
    expect(identities).not.toContain('2027-06-13')
    expect(new Set(identities).size).toBe(identities.length)
  }
)

test('a shifted series filters in its effective civil-date frame, not its original identity frame', async () => {
  const p = await run(makeProject)
  const declarationNow = new Date('2026-11-13T00:00:00Z')
  const app = createTestApi({ deps: testDeps({ withTenant, now: () => declarationNow }) }).v1
  const response = await apiRequest(app, {
    as: editor(),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/windows`,
    idempotencyKey: randomUUID(),
    body: fields({
      title: 'Shifted London',
      starts_at: '2026-11-15T01:30:00Z',
      ends_at: '2026-11-15T02:30:00Z',
      tz: 'Europe/London',
      recurrence: { frequency: 'weekly', days_of_week: ['sunday'], count: 30, skip_dates: [] }
    })
  })
  expect(response.status).toBe(201)
  const view = (await response.json()) as View
  const shifted = await apiRequest(app, {
    as: editor(),
    org: ORG,
    method: 'PATCH',
    path: `/v1/windows/${view.id}`,
    query: { scope: 'series' },
    body: { starts_at: '2026-11-16T01:30:00Z', ends_at: '2026-11-16T02:30:00Z' }
  })
  expect(shifted.status).toBe(200)
  const seriesId = view.series_id!
  const [series] = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, seriesId)))
  expect(series!.definition).toMatchObject({ anchor: '2026-11-15', dateOffsetDays: 1 })
  const before = await members(seriesId)
  const now = new Date('2027-03-29T00:00:00Z')
  const principal = systemPrincipal('windows-due')
  await withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
    extendDueWindowSeries({ tx, principal }, { projectId: p.id, seriesId, now })
  )
  const after = await members(seriesId)
  expect(after.slice(0, before.length)).toEqual(before)
  expect(after.find((row) => row.seriesOccurrenceDate === '2027-03-28')?.startsAt.toISOString()).toBe(
    '2027-03-29T00:30:00.000Z'
  )
  expect(after.map((row) => row.seriesOccurrenceDate)).not.toContain('2027-06-13')
})

test('a same-day ambiguous fall-back time still resolves to the future standard-time instant', async () => {
  const p = await run(makeProject)
  const app = createTestApi({ deps: testDeps({ withTenant, now: () => new Date('2026-10-16T00:00:00Z') }) }).v1
  const response = await apiRequest(app, {
    as: editor(),
    org: ORG,
    method: 'POST',
    path: `/v1/projects/${p.id}/windows`,
    idempotencyKey: randomUUID(),
    body: fields({
      title: 'London fold',
      starts_at: '2026-10-18T00:30:00Z',
      ends_at: '2026-10-18T01:30:00Z',
      tz: 'Europe/London',
      recurrence: { frequency: 'weekly', days_of_week: ['sunday'], count: 3, skip_dates: [] }
    })
  })
  expect(response.status).toBe(201)
  const view = (await response.json()) as View
  const [series] = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, view.series_id!)))
  const definition = readWindowSeriesDefinition(series!)
  if (definition.source !== 'native') throw new Error('native fixture required')
  const principal = systemPrincipal('windows-due')
  const candidates = await withTenant({ orgId: testOrg(ORG).id, principal }, (tx) =>
    materializeNative(
      { tx, principal },
      {
        projectId: p.id,
        definition,
        rule: parseRule(series!.rule),
        localStart: series!.localStart,
        localEnd: series!.localEnd
      },
      new Date('2026-10-25T01:15:00Z')
    )
  )
  expect(candidates.find((row) => row.seriesOccurrenceDate === '2026-10-25')?.startsAt.toISOString()).toBe(
    '2026-10-25T01:30:00.000Z'
  )
})

test.each([
  {
    projectTz: 'UTC',
    declarationTz: 'Asia/Kuala_Lumpur',
    starts: '2026-11-15T20:00:00Z',
    checked: '2026-11-15',
    next: '2026-11-16T00:00:00Z'
  },
  {
    projectTz: 'Asia/Kuala_Lumpur',
    declarationTz: 'UTC',
    starts: '2026-11-15T17:00:00Z',
    checked: '2026-11-16',
    next: '2026-11-16T16:00:00Z'
  }
])(
  'creation and due discovery use project timezone: $projectTz / $declarationTz',
  async ({ projectTz, declarationTz, starts, checked, next }) => {
    const p = await run((tx) => makeProject(tx, { timeZone: projectTz }))
    const now = new Date('2026-11-15T16:30:00Z')
    const app = createTestApi({ deps: testDeps({ withTenant, now: () => now }) }).v1
    const response = await apiRequest(app, {
      as: editor(),
      org: ORG,
      method: 'POST',
      path: `/v1/projects/${p.id}/windows`,
      idempotencyKey: randomUUID(),
      body: fields({
        starts_at: starts,
        ends_at: new Date(Date.parse(starts) + 3600000).toISOString(),
        tz: declarationTz,
        recurrence: {
          frequency: 'weekly',
          days_of_week: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          count: 120,
          skip_dates: []
        }
      })
    })
    expect(response.status).toBe(201)
    const view = (await response.json()) as View
    const seriesId = view.series_id!
    const [series] = await run((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, seriesId)))
    const horizon = await run((tx) =>
      windowLocalSpan(tx, { startsAt: now, endsAt: new Date(now.getTime() + 90 * 86400000), tz: projectTz })
    )
    const frontier = new Date(Date.parse(`${horizon.date}T00:00:00Z`) + horizon.endDayOffset * 86400000)
      .toISOString()
      .slice(0, 10)
    expect(series).toMatchObject({ checkedOn: checked, materialisedUntil: frontier })
    const principal = systemPrincipal('windows-due')
    const inTenant = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: testOrg(ORG).id, principal }, fn)
    expect(await inTenant((tx) => listDueNativeWindowSeries(tx, { projectId: p.id, now, limit: 2 }))).toEqual([])
    const nextNow = new Date(next)
    expect(await inTenant((tx) => listDueNativeWindowSeries(tx, { projectId: p.id, now: nextNow, limit: 2 }))).toEqual([
      seriesId
    ])
    const before = await members(seriesId)
    await inTenant((tx) => extendDueWindowSeries({ tx, principal }, { projectId: p.id, seriesId, now: nextNow }))
    expect((await members(seriesId)).length).toBeGreaterThan(before.length)
  }
)
