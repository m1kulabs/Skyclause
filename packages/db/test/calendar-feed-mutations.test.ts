import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  allocateCalendarIds,
  claimDueIcsFeeds,
  getIcsFeedRecord,
  insertIcsFeedRecord,
  mutateIcsFeed,
  recordIcsFeedError,
  withTenant,
  writeWindowChange,
  type IcsFeedPlan,
  type Tx
} from '../src'
import { domainEvent, icsFeed, ledgerEntry, window, windowSeries } from '../src/schema'
import { makeCall, makeOrganization, makeProject, makeWindow, makeWindowSeries } from './factories'
import { memberOf } from './harness'

const now = new Date('2026-11-14T00:00:00Z')
const later = new Date('2026-11-15T01:00:00Z')
async function context() {
  const { id: orgId } = await makeOrganization()
  const principal = memberOf(orgId)
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await run(makeProject)
  const feed = await run((tx) =>
    insertIcsFeedRecord(tx, {
      projectId: project.id,
      url: 'https://calendar.example.test/schedule',
      provenance: { version: 1, declaredBy: 'account-id', via: 'ics' },
      nextRefreshAt: now
    })
  )
  const values = {
    projectId: project.id,
    startsAt: later,
    endsAt: new Date('2026-11-15T02:00:00Z'),
    title: 'Original',
    kind: 'class' as const,
    tz: 'Asia/Kuala_Lumpur',
    declaredBy: 'account-id',
    via: 'ics' as const,
    icsFeedId: feed.id,
    icsUid: 'uid',
    icsRecurrenceId: ''
  }
  return { orgId, principal, run, project, feed, values }
}
const empty = (): IcsFeedPlan => ({ changes: [] })

test('bounded concurrent claims lease distinct due feeds and leave unclaimed attempts untouched', async () => {
  const c = await context()
  await c.run((tx) =>
    insertIcsFeedRecord(tx, {
      projectId: c.project.id,
      url: 'https://calendar.example.test/second',
      nextRefreshAt: now
    })
  )
  await c.run((tx) =>
    insertIcsFeedRecord(tx, { projectId: c.project.id, url: 'https://calendar.example.test/third', nextRefreshAt: now })
  )
  const [a, b] = await Promise.all([
    c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now })),
    c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now }))
  ])
  expect(a).toHaveLength(1)
  expect(b).toHaveLength(1)
  expect(a[0]!.feedId).not.toBe(b[0]!.feedId)
  expect(a[0]!.claimId).not.toBe(b[0]!.claimId)
  const rows = await c.run((tx) => tx.select().from(icsFeed))
  expect(rows.filter((row) => row.lastAttemptAt === null)).toHaveLength(1)
  expect(rows.filter((row) => row.lastAttemptAt !== null).map((row) => row.nextRefreshAt!.toISOString())).toEqual([
    '2026-11-14T01:00:00.000Z',
    '2026-11-14T01:00:00.000Z'
  ])
  await expect(c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now, limit: 11 }))).rejects.toThrow(
    /limit/
  )
})

test('claim expiry, replacement and deletion fence late apply/error callbacks', async () => {
  const c = await context()
  const [old] = await c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now }))
  let called = false
  const expired = new Date('2026-11-14T01:00:00Z')
  expect(
    await c.run((tx) =>
      mutateIcsFeed(tx, { feedId: c.feed.id, claimId: old!.claimId, now: expired }, async () => {
        called = true
        return empty()
      })
    )
  ).toEqual({ status: 'stale' })
  expect(called).toBe(false)
  const [fresh] = await c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now: expired }))
  expect(fresh!.claimId).not.toBe(old!.claimId)
  expect(
    await c.run((tx) =>
      recordIcsFeedError(tx, { feedId: c.feed.id, claimId: old!.claimId, now: expired, code: 'fetch-failed' })
    )
  ).toEqual({ status: 'stale' })
  const removed = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now: expired }, async () => ({
      changes: [],
      feedPatch: { deletedAt: expired, nextRefreshAt: null, refreshClaim: null }
    }))
  )
  expect(removed.status).toBe('applied')
  expect(
    await c.run((tx) =>
      mutateIcsFeed(tx, { feedId: c.feed.id, claimId: fresh!.claimId, now: expired }, async () => {
        called = true
        return empty()
      })
    )
  ).toEqual({ status: 'stale' })
  expect(called).toBe(false)
  expect(
    await c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now: new Date('2026-11-16T00:00:00Z') }))
  ).toEqual([])
})

test('file claims are opt-in and fenced failures preserve confirmed source evidence', async () => {
  const c = await context()
  await c.run((tx) =>
    tx
      .update(icsFeed)
      .set({
        url: null,
        filename: 'schedule.ics',
        document: { version: 1, jcal: [] },
        etag: 'confirmed',
        refreshedAt: now
      })
      .where(eq(icsFeed.id, c.feed.id))
  )
  expect(await c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now }))).toEqual([])
  const [claim] = await c.run((tx) => claimDueIcsFeeds(tx, { projectId: c.project.id, now, includeFiles: true }))
  expect(claim!.url).toBeNull()
  const result = await c.run((tx) =>
    recordIcsFeedError(tx, { feedId: c.feed.id, claimId: claim!.claimId, now, code: 'parse-failed' })
  )
  expect(result.status).toBe('applied')
  const row = await c.run((tx) => getIcsFeedRecord(tx, c.feed.id))
  expect(row).toMatchObject({
    document: { version: 1, jcal: [] },
    etag: 'confirmed',
    refreshedAt: now,
    refreshClaim: null
  })
  expect(JSON.parse(row!.lastError!)).toEqual({ version: 1, code: 'parse-failed' })
})

test('actual differences choose a non-noop representative and one immutable complete set', async () => {
  const c = await context()
  const rows = await c.run(async (tx) => [
    await makeWindow(tx, { ...c.values, icsUid: 'a' }),
    await makeWindow(tx, { ...c.values, icsUid: 'b' }),
    await makeWindow(tx, { ...c.values, icsUid: 'c' })
  ])
  const result = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => ({
      changes: state.members.map((row, index) => ({
        kind: 'update' as const,
        id: row.id,
        patch: { title: index === 0 ? row.title : 'Changed' },
        now
      })),
      feedPatch: { document: { version: 1, jcal: [] }, refreshedAt: now, skipped: [] }
    }))
  )
  const ids = rows
    .slice(1)
    .map((row) => row.id)
    .sort()
  expect(result).toMatchObject({ status: 'applied', changedIds: ids })
  const events = await c.run((tx) => tx.select().from(domainEvent).orderBy(domainEvent.seq))
  expect(events).toHaveLength(2)
  const calendars = events.map(
    (event) => (event.data as { calendar: { revision: string; window_ids?: string[] } }).calendar
  )
  expect(calendars[0]!.window_ids).toEqual(ids)
  expect(calendars[1]!.window_ids).toBeUndefined()
  expect(calendars[1]!.revision).toBe(calendars[0]!.revision)
  const replay = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => ({
      changes: state.members.map((row) => ({ kind: 'update' as const, id: row.id, patch: { title: row.title }, now }))
    }))
  )
  expect(replay).toMatchObject({ changedIds: [] })
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(2)
})

test('one batch creates several owned series and occurrences under the shared parent lock protocol', async () => {
  const c = await context()
  let budgetIds: string[] = []
  const result = await c.run((tx) =>
    mutateIcsFeed(
      tx,
      {
        feedId: c.feed.id,
        now,
        beforeApply: async (creates) => {
          budgetIds = creates.map((row) => row.id!)
        }
      },
      async () => {
        const { ids } = await allocateCalendarIds(tx, 4)
        return {
          seriesCreates: ['a', 'b'].map((uid, index) => ({
            id: ids[index]!,
            projectId: c.project.id,
            icsFeedId: c.feed.id,
            icsUid: uid,
            rule: { version: 1, source: 'ics', uid },
            definition: { version: 1, source: 'ics', manualDefaults: {} },
            localStart: '09:00',
            localEnd: '10:00'
          })),
          changes: ['a', 'b'].map((uid, index) => ({
            kind: 'create' as const,
            values: { ...c.values, id: ids[index + 2]!, seriesId: ids[index]!, icsUid: uid, icsRecurrenceId: 'frame' },
            now
          }))
        }
      }
    )
  )
  expect(result.status).toBe('applied')
  expect(budgetIds).toHaveLength(2)
  expect(await c.run((tx) => tx.select().from(windowSeries))).toHaveLength(2)
  expect(await c.run((tx) => tx.select().from(window))).toHaveLength(2)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(2)
})

test('restoration applies final source fields in one event and retains prior withdrawal history', async () => {
  const c = await context()
  const row = await c.run((tx) => makeWindow(tx, c.values))
  await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'source', now }))
  const result = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now }, async () => ({
      changes: [
        {
          kind: 'restore-source',
          id: row.id,
          now,
          patch: { title: 'Restored', endsAt: new Date('2026-11-15T03:00:00Z') }
        }
      ]
    }))
  )
  expect(result).toMatchObject({ changedIds: [row.id] })
  expect((await c.run((tx) => tx.select().from(window)))[0]).toMatchObject({
    id: row.id,
    title: 'Restored',
    endsAt: new Date('2026-11-15T03:00:00Z'),
    cancelledAt: null
  })
  const events = await c.run((tx) => tx.select().from(domainEvent).orderBy(domainEvent.seq))
  expect(events.map((event) => event.type)).toEqual(['window.cancelled', 'window.updated'])
  expect(events[1]!.data).toMatchObject({ times_changed: true })
  expect(await c.run((tx) => tx.select().from(ledgerEntry))).toHaveLength(1)
})

test('invalid scope, duplicate actions, bad containers and hook failures leave no half state even if caught', async () => {
  const c = await context()
  const row = await c.run((tx) => makeWindow(tx, c.values))
  const other = await context()
  const foreign = await other.run((tx) => makeWindow(tx, other.values))
  const plans = [
    { changes: [{ kind: 'update', id: foreign.id, patch: { title: 'Escape' }, now }] },
    {
      changes: [
        { kind: 'update', id: row.id, patch: { title: 'First' }, now },
        { kind: 'cancel', id: row.id, origin: 'source', now }
      ]
    },
    { changes: [], feedPatch: { document: { version: 2, jcal: [] } } },
    { changes: [], feedPatch: { projectId: other.project.id, refreshedAt: now } }
  ]
  for (const plan of plans) {
    await expect(
      c.run((tx) => mutateIcsFeed(tx, { feedId: c.feed.id, now }, async () => plan as IcsFeedPlan))
    ).rejects.toThrow()
  }
  await c.run(async (tx) => {
    try {
      await mutateIcsFeed(
        tx,
        {
          feedId: c.feed.id,
          now,
          beforeApply: async () => {
            await tx.update(icsFeed).set({ etag: 'half-state' }).where(eq(icsFeed.id, c.feed.id))
            throw new Error('budget refused')
          }
        },
        async () => {
          const { ids } = await allocateCalendarIds(tx, 1)
          return { changes: [{ kind: 'create', values: { ...c.values, id: ids[0]!, icsUid: 'new' }, now }] }
        }
      )
    } catch (error) {
      expect(String(error)).toMatch(/budget refused/)
    }
  })
  expect((await c.run((tx) => getIcsFeedRecord(tx, c.feed.id)))!.etag).toBeNull()
  expect(await c.run((tx) => tx.select().from(window))).toEqual([row])
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})

test('soft deletion cancels only eligible upcoming source rows, respects overrides and fences repeats', async () => {
  const c = await context()
  const rows = await c.run(async (tx) => [
    await makeWindow(tx, c.values),
    await makeWindow(tx, { ...c.values, icsUid: 'override', localOverride: true }),
    await makeWindow(tx, {
      ...c.values,
      icsUid: 'past',
      startsAt: new Date('2026-11-12T01:00:00Z'),
      endsAt: new Date('2026-11-12T02:00:00Z')
    })
  ])
  const result = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => ({
      changes: state.members.map((row) => ({ kind: 'cancel' as const, id: row.id, origin: 'source' as const, now })),
      feedPatch: { deletedAt: now, refreshClaim: null, nextRefreshAt: null }
    }))
  )
  expect(result).toMatchObject({ changedIds: [rows[0]!.id], feed: { deletedAt: now } })
  expect(await c.run((tx) => mutateIcsFeed(tx, { feedId: c.feed.id, now }, async () => empty()))).toEqual({
    status: 'stale'
  })
  expect(await c.run((tx) => tx.select().from(window))).toHaveLength(3)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(1)
})

test('the 20k bound counts actual distinct changes and allocation is bounded before writes', async () => {
  const c = await context()
  await c.run((tx) =>
    tx.execute(
      sql`INSERT INTO "window" (org_id,project_id,starts_at,ends_at,title,kind,tz,declared_by,via,ics_feed_id,ics_uid,ics_recurrence_id) SELECT ${c.orgId}::uuid,${c.project.id}::uuid,${later}::timestamptz,${new Date('2026-11-15T02:00:00Z')}::timestamptz,'Original','class','UTC','account-id','ics',${c.feed.id}::uuid,g::text,'' FROM generate_series(1,20001) g`
    )
  )
  const noop = await c.run((tx) =>
    mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => ({
      changes: state.members.map((row) => ({ kind: 'update' as const, id: row.id, patch: { title: row.title }, now }))
    }))
  )
  expect(noop).toMatchObject({ changedIds: [] })
  await expect(
    c.run((tx) =>
      mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => ({
        changes: state.members.map((row) => ({ kind: 'update' as const, id: row.id, patch: { title: 'Changed' }, now }))
      }))
    )
  ).rejects.toThrow(/20000/)
  await expect(c.run((tx) => allocateCalendarIds(tx, 20001))).rejects.toThrow(/20000/)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})

test.each(['window', 'series'] as const)(
  'same-organisation %s rows linked from another project cannot escape feed scope',
  async (kind) => {
    const c = await context()
    const other = await c.run(makeProject)
    const plan: IcsFeedPlan = { changes: [] }
    if (kind === 'window') {
      const row = await c.run((tx) => makeWindow(tx, { ...c.values, projectId: other.id }))
      plan.changes = [{ kind: 'update', id: row.id, patch: { title: 'Escape' }, now }]
    } else {
      const row = await c.run((tx) =>
        makeWindowSeries(tx, { projectId: other.id, icsFeedId: c.feed.id, icsUid: 'uid' })
      )
      plan.seriesUpdates = [{ id: row.id, patch: { localStart: '11:00' } }]
    }
    await expect(c.run((tx) => mutateIcsFeed(tx, { feedId: c.feed.id, now }, async () => plan))).rejects.toThrow(
      /scope/
    )
    expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
  }
)

test('a caught ledger failure rolls back rows, events, counter and held-key state before another feed retry', async () => {
  const c = await context()
  const retryFeed = await c.run((tx) => insertIcsFeedRecord(tx, { projectId: c.project.id, filename: 'retry.ics' }))
  const rows = await c.run(async (tx) => [
    await makeWindow(tx, { ...c.values, icsUid: 'first' }),
    await makeWindow(tx, { ...c.values, icsUid: 'second' }),
    await makeWindow(tx, { ...c.values, icsFeedId: retryFeed.id, icsUid: 'retry' })
  ])
  await c.run((tx) => makeCall(tx, { windowId: rows[1]!.id, state: 'sent', projectId: c.project.id }))
  const principal = {
    kind: 'system' as const,
    job: 'invalid@example.test',
    client: 'worker' as const,
    clientName: null
  }
  await withTenant({ orgId: c.orgId, principal }, async (tx) => {
    let failed = false
    try {
      await mutateIcsFeed(tx, { feedId: c.feed.id, now }, async () => ({
        changes: [
          { kind: 'update', id: rows[0]!.id, patch: { title: 'Rollback' }, now },
          { kind: 'cancel', id: rows[1]!.id, origin: 'source', now }
        ]
      }))
    } catch (error) {
      failed = true
      expect(String(error)).toMatch(/email/)
    }
    expect(failed).toBe(true)
    await mutateIcsFeed(tx, { feedId: retryFeed.id, now }, async () => ({
      changes: [{ kind: 'update', id: rows[2]!.id, patch: { title: 'Committed retry' }, now }]
    }))
  })
  const persisted = await c.run(async (tx) => ({
    rows: await tx.select().from(window).orderBy(window.id),
    events: await tx.select().from(domainEvent),
    ledger: await tx.select().from(ledgerEntry)
  }))
  expect(persisted.rows[0]).toEqual(rows[0])
  expect(persisted.rows[1]).toEqual(rows[1])
  expect(persisted.rows[2]!.title).toBe('Committed retry')
  expect(persisted.events).toHaveLength(1)
  expect(persisted.events[0]!.seq).toBe(1)
  expect(persisted.ledger).toEqual([])
})

test('concurrent feed applies discover committed membership under the feed lock instead of duplicating an occurrence', async () => {
  const c = await context()
  const apply = () =>
    c.run((tx) =>
      mutateIcsFeed(tx, { feedId: c.feed.id, now }, async (state) => {
        if (state.members.length) return { changes: [] }
        const { ids } = await allocateCalendarIds(tx, 1)
        return { changes: [{ kind: 'create', values: { ...c.values, id: ids[0]! }, now }] }
      })
    )
  const results = await Promise.all([apply(), apply()])
  expect(results.map((result) => (result.status === 'applied' ? result.changedIds.length : -1)).sort()).toEqual([0, 1])
  expect(await c.run((tx) => tx.select().from(window))).toHaveLength(1)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(1)
})

test('planner and budget callbacks use the actual child context and allocation retries do not leak across rollback', async () => {
  const c = await context()
  await c.run(async (outer) => {
    for (const attempt of [0, 1]) {
      const apply = () =>
        mutateIcsFeed(
          outer,
          {
            feedId: c.feed.id,
            now,
            beforeApply: async (_creates, child) => {
              expect(child.orgId).toBe(c.orgId)
              expect(child.principal).toBe(c.principal)
              if (attempt === 0) {
                await child.update(icsFeed).set({ etag: 'rolled-back-budget-state' }).where(eq(icsFeed.id, c.feed.id))
                throw new Error('budget refused')
              }
            }
          },
          async (state, child) => {
            expect(state.feed.etag).toBeNull()
            const { ids } = await allocateCalendarIds(child, 20000)
            expect(ids).toHaveLength(20000)
            return { changes: [{ kind: 'create', values: { ...c.values, id: ids[0]! }, now }] }
          }
        )
      if (attempt === 0) await expect(apply()).rejects.toThrow(/budget refused/)
      else expect(await apply()).toMatchObject({ status: 'applied' })
    }
  })
  expect(await c.run((tx) => tx.select().from(window))).toHaveLength(1)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(1)
  expect((await c.run((tx) => getIcsFeedRecord(tx, c.feed.id)))!.etag).toBeNull()
})
