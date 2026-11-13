import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import {
  lockWindowParent,
  lockWindowParents,
  verifyLedger,
  withTenant,
  writeWindowChange,
  type Tx,
  type WindowMutationInsert
} from '../src'
import { bundle, call, domainEvent, icsFeed, ledgerEntry, window, windowSeries } from '../src/schema'
import { makeCall, makeIcsFeed, makeOrganization, makeProject, makeWindow, makeWindowSeries } from './factories'
import { asLogin, memberOf, refusal, testDatabase } from './harness'
import { migrate } from '../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder } from '../scripts/local'

const now = new Date('2026-11-14T00:00:00.123Z')
async function context() {
  const { id: orgId } = await makeOrganization()
  const principal = memberOf(orgId)
  const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await run(makeProject)
  const values: WindowMutationInsert = {
    projectId: project.id,
    title: 'Lecture',
    kind: 'class',
    startsAt: new Date('2026-11-15T01:00:00Z'),
    endsAt: new Date('2026-11-15T02:00:00Z'),
    tz: 'Asia/Kuala_Lumpur',
    declaredBy: 'declaration-id',
    via: 'app'
  }
  return { orgId, principal, run, project, values }
}

test('durable native and imported identities reject duplicates while legacy unknown identities remain nullable', async () => {
  const c = await context()
  const series = await c.run((tx) => makeWindowSeries(tx, { projectId: c.project.id }))
  const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
  await c.run(async (tx) => {
    await makeWindow(tx, { ...c.values, seriesId: series.id })
    await makeWindow(tx, { ...c.values, seriesId: series.id })
    await makeWindow(tx, { ...c.values, icsFeedId: feed.id })
    await makeWindow(tx, { ...c.values, icsFeedId: feed.id })
    await makeWindow(tx, { ...c.values, seriesId: series.id, seriesOccurrenceDate: '2026-11-15' })
    await makeWindow(tx, { ...c.values, icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: '' })
  })
  expect(
    await refusal(
      c.run((tx) => makeWindow(tx, { ...c.values, seriesId: series.id, seriesOccurrenceDate: '2026-11-15' }))
    )
  ).toMatch(/unique/)
  expect(
    await refusal(
      c.run((tx) => makeWindow(tx, { ...c.values, icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: '' }))
    )
  ).toMatch(/unique/)
  await c.run((tx) => makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: feed.id, icsUid: 'recurring' }))
  expect(
    await refusal(
      c.run((tx) => makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: feed.id, icsUid: 'recurring' }))
    )
  ).toMatch(/unique/)
})

test('same-org parents, paired identities, byte limits and versioned documents are enforced by storage', async () => {
  const a = await context()
  const b = await context()
  const foreignFeed = await b.run(makeIcsFeed)
  const foreignSeries = await b.run(makeWindowSeries)
  expect(
    await refusal(
      a.run((tx) => makeWindowSeries(tx, { projectId: a.project.id, icsFeedId: foreignFeed.id, icsUid: 'x' }))
    )
  ).toMatch(/foreign key/)
  expect(await refusal(a.run((tx) => makeWindow(tx, { ...a.values, seriesId: foreignSeries.id })))).toMatch(
    /foreign key/
  )
  expect(await refusal(a.run((tx) => makeWindow(tx, { ...a.values, icsFeedId: foreignFeed.id })))).toMatch(
    /foreign key/
  )
  for (const patch of [{ icsUid: 'alone' }, { seriesOccurrenceDate: '2026-11-15' }]) {
    expect(await refusal(a.run((tx) => makeWindow(tx, { ...a.values, ...patch })))).toMatch(/check constraint/)
  }
  const feed = await a.run(makeIcsFeed)
  expect(
    await refusal(
      a.run((tx) => makeWindow(tx, { ...a.values, icsFeedId: feed.id, icsUid: '界'.repeat(342), icsRecurrenceId: '' }))
    )
  ).toMatch(/check constraint/)
  expect(await refusal(a.run((tx) => makeWindowSeries(tx, { definition: { version: 2 } })))).toMatch(/check constraint/)
  expect(
    await refusal(
      a.run((tx) =>
        tx
          .update(icsFeed)
          .set({ document: { version: 1 } })
          .where(eq(icsFeed.id, feed.id))
      )
    )
  ).toMatch(/check constraint/)
  expect(await a.run((tx) => lockWindowParent(tx, randomUUID()))).toBeNull()
})

test.each(['native', 'imported'] as const)(
  'concurrent %s writers materialise one occurrence and one event with canonical tenant scope',
  async (identity) => {
    const c = await context()
    const series = await c.run((tx) => makeWindowSeries(tx, { projectId: c.project.id }))
    const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
    const occurrence =
      identity === 'native'
        ? { seriesId: series.id, seriesOccurrenceDate: '2026-11-15' }
        : { icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: 'original-frame' }
    const change = {
      kind: 'create' as const,
      values: { ...c.values, ...occurrence, orgId: randomUUID() },
      now
    }
    const results = await Promise.allSettled([
      c.run((tx) => writeWindowChange(tx, change)),
      c.run((tx) => writeWindowChange(tx, change))
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const persisted = await c.run(async (tx) => ({
      rows: await tx.select().from(window),
      events: await tx.select().from(domainEvent)
    }))
    expect(persisted.rows).toHaveLength(1)
    expect(persisted.rows[0]!.orgId).toBe(c.orgId)
    expect(persisted.events).toHaveLength(1)
  }
)

test('actual changes emit once and sent-call cancellation preserves history and a verifiable pseudonymous ledger', async () => {
  const c = await context()
  const row = await c.run((tx) => writeWindowChange(tx, { kind: 'create', values: c.values, now }))
  const sent = await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'update',
      id: row.id,
      patch: { title: row.title, startsAt: new Date(row.startsAt) },
      now
    })
  )
  await c.run((tx) => writeWindowChange(tx, { kind: 'update', id: row.id, patch: { title: 'Revised' }, now }))
  const bundlesBefore = await c.run((tx) => tx.select().from(bundle))
  const cancelled = await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'manual', now }))
  await c.run((tx) =>
    writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'manual', now: new Date(now.getTime() + 1000) })
  )
  expect(cancelled.cancelledAt).toEqual(now)
  expect(cancelled.localOverride).toBe(true)
  const saved = await c.run(async (tx) => ({
    events: await tx.select().from(domainEvent),
    ledger: await tx.select().from(ledgerEntry),
    calls: await tx.select().from(call),
    verdict: await verifyLedger(tx, c.project.id)
  }))
  expect(saved.events.map((event) => [event.type, event.data])).toEqual([
    ['window.created', { window_id: row.id, via: 'form', times_changed: false, series_id: null }],
    ['window.updated', { window_id: row.id, via: 'form', times_changed: false, series_id: null }],
    ['window.cancelled', { window_id: row.id, via: 'form', times_changed: false, series_id: null }]
  ])
  expect(saved.ledger).toHaveLength(1)
  expect(saved.ledger[0]).toMatchObject({
    kind: 'window_cancelled',
    refs: { window_id: row.id },
    body: {
      actor_type: 'account',
      actor_id: 'accountId' in c.principal ? c.principal.accountId : '',
      cancelled_at: now.toISOString()
    }
  })
  expect(saved.calls.map((item) => item.id)).toContain(sent.id)
  expect(saved.calls).toHaveLength(2)
  expect(await c.run((tx) => tx.select().from(bundle))).toEqual(bundlesBefore)
  expect(saved.verdict).toMatchObject({ ok: true })
})

test('ledger rejection rolls back the cancellation and event together', async () => {
  const c = await context()
  const row = await c.run((tx) => writeWindowChange(tx, { kind: 'create', values: c.values, now }))
  await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  const principal = {
    kind: 'system' as const,
    job: 'invalid@example.test',
    client: 'worker' as const,
    clientName: null
  }
  await expect(
    withTenant({ orgId: c.orgId, principal }, (tx) =>
      writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'source', now })
    )
  ).rejects.toThrow(/email/)
  const persisted = await c.run(async (tx) => ({
    row: await tx.select().from(window).where(eq(window.id, row.id)),
    events: await tx.select().from(domainEvent),
    ledger: await tx.select().from(ledgerEntry)
  }))
  expect(persisted.row[0]!.cancelledAt).toBeNull()
  expect(persisted.events).toHaveLength(1)
  expect(persisted.ledger).toEqual([])
})

test('source tombstones restore only active non-overridden rows and manual cancellation survives refresh', async () => {
  const c = await context()
  const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
  const series = await c.run((tx) =>
    makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: feed.id, icsUid: 'uid' })
  )
  const row = await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'create',
      values: {
        ...c.values,
        seriesId: series.id,
        icsFeedId: feed.id,
        icsUid: 'uid',
        icsRecurrenceId: '20261115T090000'
      },
      now
    })
  )
  const calendar = { feedId: feed.id, revision: '019c0970-0000-7000-8000-000000000139', windowIds: [row.id] }
  await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'source', now, calendar }))
  const restored = await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: row.id, now, calendar }))
  expect(restored.id).toBe(row.id)
  expect(restored.cancelledAt).toBeNull()
  expect(await c.run((tx) => tx.select().from(ledgerEntry))).toHaveLength(1)
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'manual', now }))
  const untouched = await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: row.id, now, calendar }))
  expect(untouched.cancelledAt).toEqual(now)
  const events = await c.run((tx) => tx.select().from(domainEvent))
  expect(events).toHaveLength(4)
  expect(events[1]!.data).toMatchObject({
    calendar: { feed_id: feed.id, revision: calendar.revision, window_ids: [row.id] }
  })
  const second = await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'create',
      values: { ...c.values, icsFeedId: feed.id, icsUid: 'other', icsRecurrenceId: '' },
      now
    })
  )
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: second.id, origin: 'source', now }))
  await c.run((tx) => tx.update(icsFeed).set({ deletedAt: now }).where(eq(icsFeed.id, feed.id)))
  expect(
    (await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: second.id, now, calendar }))).cancelledAt
  ).toEqual(now)
  await c.run((tx) => tx.update(windowSeries).set({ cancelledAt: now }).where(eq(windowSeries.id, series.id)))
})

test('caller transaction rollback retains neither rows nor outbox events', async () => {
  const c = await context()
  expect(
    await refusal(
      c.run(async (tx) => {
        await writeWindowChange(tx, { kind: 'create', values: c.values, now })
        await tx.execute(sql`SELECT 1/0`)
      })
    )
  ).toMatch(/division by zero/)
  expect(await c.run((tx) => tx.select().from(window))).toEqual([])
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})

test('creation validates locked parent projects and imported series identity', async () => {
  const c = await context()
  const other = await c.run(makeProject)
  const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: other.id }))
  const series = await c.run((tx) => makeWindowSeries(tx, { projectId: other.id }))
  await expect(
    c.run((tx) =>
      writeWindowChange(tx, {
        kind: 'create',
        values: { ...c.values, icsFeedId: feed.id, icsUid: 'x', icsRecurrenceId: '' },
        now
      })
    )
  ).rejects.toThrow(/parent project/)
  await expect(
    c.run((tx) =>
      writeWindowChange(tx, {
        kind: 'create',
        values: { ...c.values, seriesId: series.id, seriesOccurrenceDate: '2026-11-15' },
        now
      })
    )
  ).rejects.toThrow(/parent project/)
  const ownFeed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
  const imported = await c.run((tx) =>
    makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: ownFeed.id, icsUid: 'correct' })
  )
  await expect(
    c.run((tx) =>
      writeWindowChange(tx, {
        kind: 'create',
        values: {
          ...c.values,
          seriesId: imported.id,
          icsFeedId: ownFeed.id,
          icsUid: 'wrong',
          icsRecurrenceId: 'frame'
        },
        now
      })
    )
  ).rejects.toThrow(/series identity/)
})

test('source refresh cannot cancel an overridden occurrence or restore legacy and series tombstones', async () => {
  const c = await context()
  const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
  const series = await c.run((tx) =>
    makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: feed.id, icsUid: 'uid' })
  )
  const calendar = { feedId: feed.id, revision: '019c0970-0000-7000-8000-000000000139', windowIds: [] as string[] }
  const overridden = await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'create',
      values: { ...c.values, localOverride: true, icsFeedId: feed.id, icsUid: 'override', icsRecurrenceId: '' },
      now
    })
  )
  calendar.windowIds = [overridden.id]
  expect(
    (await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: overridden.id, origin: 'source', now, calendar })))
      .cancelledAt
  ).toBeNull()
  const legacy = await c.run((tx) => makeWindow(tx, { ...c.values, icsFeedId: feed.id, cancelledAt: now }))
  calendar.windowIds = [legacy.id]
  expect(
    (await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: legacy.id, now, calendar }))).cancelledAt
  ).toEqual(now)
  const row = await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'create',
      values: { ...c.values, seriesId: series.id, icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: 'frame' },
      now
    })
  )
  calendar.windowIds = [row.id]
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'series', now }))
  expect(
    (await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: row.id, now, calendar }))).cancelledAt
  ).toEqual(now)
  const source = await c.run((tx) =>
    writeWindowChange(tx, {
      kind: 'create',
      values: { ...c.values, seriesId: series.id, icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: 'other-frame' },
      now
    })
  )
  calendar.windowIds = [source.id]
  await c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: source.id, origin: 'source', now }))
  await c.run((tx) => tx.update(windowSeries).set({ cancelledAt: now }).where(eq(windowSeries.id, series.id)))
  expect(
    (await c.run((tx) => writeWindowChange(tx, { kind: 'restore-source', id: source.id, now, calendar }))).cancelledAt
  ).toEqual(now)
})

test('concurrent sent-call cancellations write exactly one transition and ledger entry', async () => {
  const c = await context()
  const row = await c.run((tx) => writeWindowChange(tx, { kind: 'create', values: c.values, now }))
  await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  await Promise.all(
    [0, 1].map(() => c.run((tx) => writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'manual', now })))
  )
  expect(await c.run((tx) => tx.select().from(ledgerEntry))).toHaveLength(1)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(2)
})

test('batch locks sort windows and representative metadata holds the complete immutable set', async () => {
  const c = await context()
  const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
  const rows = await c.run(async (tx) => [
    await makeWindow(tx, { ...c.values, icsFeedId: feed.id, icsUid: 'a', icsRecurrenceId: '' }),
    await makeWindow(tx, { ...c.values, icsFeedId: feed.id, icsUid: 'b', icsRecurrenceId: '' })
  ])
  const ids = rows.map((row) => row.id).sort()
  const calendar = { feedId: feed.id, revision: '019c0970-0000-7000-8000-000000000139', windowIds: [...ids].reverse() }
  await c.run(async (tx) => {
    const locked = await lockWindowParents(tx, [...ids].reverse())
    expect(locked.map((row) => row.id)).toEqual(ids)
    for (const row of locked)
      await writeWindowChange(tx, {
        kind: 'update',
        id: row.id,
        patch: { startsAt: new Date('2026-11-15T03:00:00Z') },
        now,
        calendar
      })
  })
  const events = await c.run((tx) => tx.select().from(domainEvent).orderBy(domainEvent.seq))
  expect(events.map((event) => event.data)).toEqual(
    ids.map((id, index) => ({
      window_id: id,
      via: 'form',
      series_id: null,
      times_changed: true,
      calendar: { feed_id: feed.id, revision: calendar.revision, ...(index === 0 ? { window_ids: ids } : {}) }
    }))
  )
})

test('a complete multi-feed batch locks parents before children and refuses late parents', async () => {
  const c = await context()
  const [a, b] = await c.run(async (tx) => [
    await makeIcsFeed(tx, { projectId: c.project.id }),
    await makeIcsFeed(tx, { projectId: c.project.id })
  ])
  const [sa, sb] = await c.run(async (tx) => [
    await makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: a!.id, icsUid: 'a' }),
    await makeWindowSeries(tx, { projectId: c.project.id, icsFeedId: b!.id, icsUid: 'b' })
  ])
  const values = [
    { ...c.values, icsFeedId: a!.id, seriesId: sa!.id, icsUid: 'a', icsRecurrenceId: 'first' },
    { ...c.values, icsFeedId: b!.id, seriesId: sb!.id, icsUid: 'b', icsRecurrenceId: 'first' }
  ]
  await expect(
    c.run(async (tx) => {
      await writeWindowChange(tx, { kind: 'create', values: values[0]!, now })
      await writeWindowChange(tx, { kind: 'create', values: values[1]!, now })
    })
  ).rejects.toThrow(/complete window batch/)
  const rows = await c.run(async (tx) => {
    await lockWindowParents(tx, [], values)
    return Promise.all(values.map((value) => writeWindowChange(tx, { kind: 'create', values: value, now })))
  })
  expect(rows).toHaveLength(2)
})

test('update writes only its declared patch fields and ignores caller organisation', async () => {
  const c = await context()
  const row = await c.run((tx) => writeWindowChange(tx, { kind: 'create', values: c.values, now }))
  const patch = { title: row.title, orgId: randomUUID() }
  const unchanged = await c.run((tx) => writeWindowChange(tx, { kind: 'update', id: row.id, patch, now }))
  expect(unchanged.orgId).toBe(c.orgId)
  expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(1)
})

test('lifecycle migration preserves legacy source evidence without inventing identities or definitions', async () => {
  const database = `${testDatabase()}_legacy`
  const folder = mkdtempSync(join(tmpdir(), 'window-legacy-'))
  await createDatabase(database)
  try {
    cpSync(migrationsFolder, folder, { recursive: true })
    const journalPath = join(folder, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const index = journal.entries.findIndex(({ tag }) => tag.endsWith('_b-windows-api-lifecycle'))
    expect(index).toBeGreaterThan(0)
    const lifecycleTag = journal.entries[index]!.tag
    journal.entries = journal.entries.slice(0, index)
    writeFileSync(journalPath, JSON.stringify(journal))
    const url = localUrl('migrator', database)
    await migrate(url, folder)
    const read = () =>
      asLogin(
        'postgres',
        async (client) => ({
          windows: (await client.query('SELECT * FROM "window"')).rows,
          series: (await client.query('SELECT * FROM window_series')).rows,
          feeds: (await client.query('SELECT * FROM ics_feed')).rows,
          hashes: (await client.query('SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id')).rows
        }),
        database
      )
    await asLogin(
      'postgres',
      async (client) => {
        const org = await client.query(
          "INSERT INTO auth.organization (name, slug, created_at) VALUES ('Legacy window', 'legacy-window', now()) RETURNING id"
        )
        const project = await client.query(
          "INSERT INTO project (org_id, slug, name, time_zone) VALUES ($1, 'legacy', 'Legacy', 'Asia/Kuala_Lumpur') RETURNING id",
          [org.rows[0].id]
        )
        const series = await client.query(
          "INSERT INTO window_series (org_id, project_id, rule, local_start, local_end) VALUES ($1, $2, '{\"freq\":\"weekly\"}', '09:00', '10:00') RETURNING id",
          [org.rows[0].id, project.rows[0].id]
        )
        const feed = await client.query(
          "INSERT INTO ics_feed (org_id, project_id, filename, etag) VALUES ($1, $2, 'legacy.ics', 'known-validator') RETURNING id",
          [org.rows[0].id, project.rows[0].id]
        )
        await client.query(
          "INSERT INTO \"window\" (org_id, project_id, starts_at, ends_at, title, kind, tz, declared_by, via, series_id, ics_feed_id, cancelled_at) VALUES ($1, $2, '2026-11-15T01:00:00Z', '2026-11-15T02:00:00Z', 'Legacy', 'class', 'Asia/Kuala_Lumpur', 'known-declarer', 'ics', $3, $4, '2026-11-14T00:00:00Z')",
          [org.rows[0].id, project.rows[0].id, series.rows[0].id, feed.rows[0].id]
        )
      },
      database
    )
    const before = await read()
    expect(await migrate(url, migrationsFolder)).toEqual([lifecycleTag])
    const after = await read()
    expect(after.windows).toEqual(
      before.windows.map((row) => ({
        ...row,
        cancellation_origin: null,
        series_occurrence_date: null,
        ics_uid: null,
        ics_recurrence_id: null,
        local_override: false
      }))
    )
    expect(after.series).toEqual(
      before.series.map((row) => ({
        ...row,
        definition: null,
        ics_feed_id: null,
        ics_uid: null,
        checked_on: null,
        cancelled_at: null,
        last_error: null
      }))
    )
    expect(after.feeds).toEqual(
      before.feeds.map((row) => ({
        ...row,
        kind: 'class',
        document: null,
        provenance: null,
        last_attempt_at: null,
        next_refresh_at: null,
        refresh_claim: null,
        last_error: null,
        deleted_at: null,
        skipped: [],
        materialised_until: null
      }))
    )
    expect(after.hashes.slice(0, before.hashes.length)).toEqual(before.hashes)
  } finally {
    await dropDatabase(database)
    rmSync(folder, { recursive: true, force: true })
  }
}, 120_000)

async function lifecycleParent(c: Awaited<ReturnType<typeof context>>, kind: 'feed' | 'series') {
  if (kind === 'feed') {
    const feed = await c.run((tx) => makeIcsFeed(tx, { projectId: c.project.id }))
    return {
      id: feed.id,
      values: { ...c.values, icsFeedId: feed.id, icsUid: 'uid', icsRecurrenceId: '' },
      stop: (tx: Tx) => tx.update(icsFeed).set({ deletedAt: now }).where(eq(icsFeed.id, feed.id))
    }
  }
  const series = await c.run((tx) => makeWindowSeries(tx, { projectId: c.project.id }))
  return {
    id: series.id,
    values: { ...c.values, seriesId: series.id, seriesOccurrenceDate: '2026-11-15' },
    stop: (tx: Tx) => tx.update(windowSeries).set({ cancelledAt: now }).where(eq(windowSeries.id, series.id))
  }
}

function signal<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test.each(['feed', 'series'] as const)('creation refuses an already inactive %s before inserting', async (kind) => {
  const c = await context()
  const parent = await lifecycleParent(c, kind)
  await c.run(parent.stop)
  await expect(c.run((tx) => writeWindowChange(tx, { kind: 'create', values: parent.values, now }))).rejects.toThrow(
    /inactive window parent/
  )
  expect(await c.run((tx) => tx.select().from(window))).toEqual([])
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})

test.each(['feed', 'series'] as const)('creation rechecks a stopping %s after waiting for its lock', async (kind) => {
  const c = await context()
  const parent = await lifecycleParent(c, kind)
  const stopped = signal<void>()
  const release = signal<void>()
  const backend = signal<number>()
  const stop = c.run(async (tx) => {
    await parent.stop(tx)
    stopped.resolve()
    await release.promise
  })
  await stopped.promise
  const create = c
    .run(async (tx) => {
      const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
      backend.resolve(rows[0]!.pid)
      return writeWindowChange(tx, { kind: 'create', values: parent.values, now })
    })
    .then(
      (row) => ({ row, error: null }),
      (error: unknown) => ({ row: null, error })
    )
  try {
    const pid = await backend.promise
    await expect
      .poll(async () => {
        const result = await asLogin('postgres', (client) =>
          client.query<{ blockers: number }>('SELECT cardinality(pg_blocking_pids($1)) AS blockers', [pid])
        )
        return result.rows[0]!.blockers
      })
      .toBe(1)
  } finally {
    release.resolve()
    await stop
  }
  const result = await create
  expect(result.error).toBeInstanceOf(Error)
  expect(String(result.error)).toMatch(/inactive window parent/)
  expect(result.row).toBeNull()
  expect(await c.run((tx) => tx.select().from(window))).toEqual([])
  expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
})

test.each(['feed', 'series'] as const)(
  'prelock accumulation rejects descending %s locks and accepts ascending locks',
  async (kind) => {
    const c = await context()
    const parents = [await lifecycleParent(c, kind), await lifecycleParent(c, kind)].sort((a, b) =>
      a.id.localeCompare(b.id)
    )
    await expect(
      c.run(async (tx) => {
        await lockWindowParents(tx, [], [parents[1]!.values])
        await lockWindowParents(tx, [], [parents[0]!.values])
      })
    ).rejects.toThrow(/complete window batch/)
    await c.run(async (tx) => {
      for (const parent of parents) await lockWindowParents(tx, [], [parent.values])
      for (const parent of parents) await writeWindowChange(tx, { kind: 'create', values: parent.values, now })
    })
    expect(await c.run((tx) => tx.select().from(window))).toHaveLength(2)
    expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(2)
  }
)

test.each([
  ['feed', false],
  ['feed', true],
  ['series', false],
  ['series', true]
] as const)(
  'creation freezes the planned %s parents after its first mutation; first has no parent=%s',
  async (kind, unparented) => {
    const c = await context()
    const parents = [await lifecycleParent(c, kind), await lifecycleParent(c, kind)].sort((a, b) =>
      a.id.localeCompare(b.id)
    )
    const first = unparented ? c.values : parents[0]!.values
    const second = parents[1]!.values
    await expect(
      c.run(async (tx) => {
        await writeWindowChange(tx, { kind: 'create', values: first, now })
        await writeWindowChange(tx, { kind: 'create', values: second, now })
      })
    ).rejects.toThrow(/complete window batch/)
    expect(await c.run((tx) => tx.select().from(window))).toEqual([])
    expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
    await c.run(async (tx) => {
      await lockWindowParents(tx, [], [first, second])
      await writeWindowChange(tx, { kind: 'create', values: first, now })
      await writeWindowChange(tx, { kind: 'create', values: second, now })
    })
    expect(await c.run((tx) => tx.select().from(window))).toHaveLength(2)
    expect(await c.run((tx) => tx.select().from(domainEvent))).toHaveLength(2)
  }
)

test('repeated creation under the same prelocked parent remains supported', async () => {
  const c = await context()
  const parent = await lifecycleParent(c, 'feed')
  await c.run(async (tx) => {
    await lockWindowParents(tx, [], [parent.values])
    await writeWindowChange(tx, { kind: 'create', values: parent.values, now })
    await writeWindowChange(tx, { kind: 'create', values: { ...parent.values, icsUid: 'another' }, now })
  })
  expect(await c.run((tx) => tx.select().from(window))).toHaveLength(2)
})

test.each([false, true])('guest cancellation with sent call=%s never creates public ledger history', async (sent) => {
  const c = await context()
  const row = await c.run((tx) => writeWindowChange(tx, { kind: 'create', values: { ...c.values, guest: true }, now }))
  if (sent) await c.run((tx) => makeCall(tx, { windowId: row.id, state: 'sent', projectId: c.project.id }))
  const failure = await c.run(async (tx) => {
    try {
      await writeWindowChange(tx, { kind: 'cancel', id: row.id, origin: 'manual', now })
      return null
    } catch (error) {
      return error
    }
  })
  const saved = await c.run(async (tx) => ({
    rows: await tx.select().from(window),
    events: await tx.select().from(domainEvent),
    ledger: await tx.select().from(ledgerEntry),
    calls: await tx.select().from(call)
  }))
  expect(saved.ledger).toEqual([])
  if (sent) {
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toMatch(/guest.*sent call/)
    expect(saved.rows[0]).toEqual(row)
    expect(saved.events).toHaveLength(1)
    expect(saved.calls).toHaveLength(1)
    expect(saved.calls[0]!.state).toBe('sent')
  } else {
    expect(failure).toBeNull()
    expect(saved.rows[0]!.cancelledAt).toEqual(now)
    expect(saved.rows[0]!.localOverride).toBe(true)
    expect(saved.events.map((event) => event.type)).toEqual(['window.created', 'window.cancelled'])
  }
})

test.each(['create', 'update'] as const)(
  'a first %s refuses unplanned existing-window locks after mutation begins',
  async (first) => {
    const c = await context()
    const rows = await c.run(async (tx) => [await makeWindow(tx, c.values), await makeWindow(tx, c.values)])
    const [a, b] = rows.sort((left, right) => left.id.localeCompare(right.id))
    await expect(
      c.run(async (tx) => {
        if (first === 'create') await writeWindowChange(tx, { kind: 'create', values: c.values, now })
        else await writeWindowChange(tx, { kind: 'update', id: a!.id, patch: { title: 'First edit' }, now })
        await writeWindowChange(tx, { kind: 'update', id: b!.id, patch: { title: 'Late edit' }, now })
      })
    ).rejects.toThrow(/complete window batch/)
    expect(await c.run((tx) => tx.select().from(window).orderBy(window.id))).toEqual([a, b])
    expect(await c.run((tx) => tx.select().from(domainEvent))).toEqual([])
  }
)

async function windowBlockers(pid: number): Promise<number[]> {
  const result = await asLogin('postgres', (client) =>
    client.query<{ blockers: number[] }>('SELECT pg_blocking_pids($1) AS blockers', [pid])
  )
  return result.rows[0]!.blockers
}

test('mixed create/update refuses the event-counter inversion before waiting on another transaction', async () => {
  const c = await context()
  const existing = await c.run((tx) => makeWindow(tx, c.values))
  const creatorReady = signal<number>()
  const updaterReady = signal<number>()
  const attempt = signal<void>()
  let creatorSettled = false
  const creator = c
    .run(async (tx) => {
      await writeWindowChange(tx, { kind: 'create', values: c.values, now })
      const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
      creatorReady.resolve(rows[0]!.pid)
      await attempt.promise
      try {
        await writeWindowChange(tx, { kind: 'update', id: existing.id, patch: { title: 'Unplanned edit' }, now })
        return null
      } catch (error) {
        return error
      }
    })
    .finally(() => {
      creatorSettled = true
    })
  const creatorPid = await creatorReady.promise
  const updater = c.run(async (tx) => {
    const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)
    updaterReady.resolve(rows[0]!.pid)
    return writeWindowChange(tx, { kind: 'update', id: existing.id, patch: { title: 'Concurrent edit' }, now })
  })
  const updaterPid = await updaterReady.promise
  try {
    await expect.poll(() => windowBlockers(updaterPid)).toContain(creatorPid)
  } finally {
    attempt.resolve()
  }
  let inverted = false
  while (!creatorSettled) {
    if ((await windowBlockers(creatorPid)).includes(updaterPid)) {
      inverted = true
      // Cancel only this test's blocked backend so a demonstrated RED inversion drains without timing out.
      await asLogin('postgres', (client) => client.query('SELECT pg_cancel_backend($1)', [creatorPid]))
      break
    }
  }
  const failure = await creator
  const concurrent = await updater
  expect(inverted).toBe(false)
  expect(String(failure)).toMatch(/complete window batch/)
  expect(concurrent.title).toBe('Concurrent edit')
  const persisted = await c.run(async (tx) => ({
    rows: await tx.select().from(window),
    events: await tx.select().from(domainEvent)
  }))
  expect(persisted.rows).toHaveLength(2)
  expect(persisted.events.map((event) => event.type)).toEqual(['window.created', 'window.updated'])
})

test('a fully prelocked mixed batch can update existing windows and reuse its newly inserted row', async () => {
  const c = await context()
  const existing = await c.run((tx) => makeWindow(tx, c.values))
  const created = await c.run(async (tx) => {
    await lockWindowParents(tx, [existing.id], [c.values])
    const row = await writeWindowChange(tx, { kind: 'create', values: c.values, now })
    await writeWindowChange(tx, { kind: 'update', id: existing.id, patch: { title: 'Planned edit' }, now })
    return writeWindowChange(tx, { kind: 'update', id: row.id, patch: { title: 'Owned row edit' }, now })
  })
  expect(created.title).toBe('Owned row edit')
  const persisted = await c.run(async (tx) => ({
    rows: await tx.select().from(window).orderBy(window.id),
    events: await tx.select().from(domainEvent).orderBy(domainEvent.seq)
  }))
  expect(persisted.rows.map((row) => row.title)).toEqual(['Planned edit', 'Owned row edit'])
  expect(persisted.events.map((event) => event.type)).toEqual(['window.created', 'window.updated', 'window.updated'])
})
