import {
  icsFeed,
  project as projectTable,
  systemPrincipal,
  window,
  windowSeries,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeIcsFeed, makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import type { CalendarTransport } from '@skyclause/api/windows'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { runWindowDueProject } from '../src/windows'

test('commits the feed lease before HTTP and applies with a fresh tenant transaction', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const now = new Date('2026-11-16T00:00:00Z')
  const feed = await inOrg((tx) =>
    makeIcsFeed(tx, {
      projectId: project.id,
      url: 'https://example.com/calendar',
      nextRefreshAt: now,
      provenance: { version: 1, declaredBy: 'account', via: 'app' }
    })
  )
  let fetches = 0
  const transport = {
    assertPublicUrl: async () => {},
    safeFetch: async () => {
      fetches++
      const [claimed] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
      expect(claimed!.refreshClaim).not.toBeNull()
      expect(claimed!.lastAttemptAt).toEqual(now)
      return new Response(
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'BEGIN:VEVENT',
          'UID:one',
          'DTSTART:20261117T090000Z',
          'DTEND:20261117T100000Z',
          'SUMMARY:Class',
          'END:VEVENT',
          'END:VCALENDAR',
          ''
        ].join('\r\n'),
        { status: 200 }
      )
    }
  } as unknown as CalendarTransport
  await runWindowDueProject({ orgId, projectId: project.id }, now, { now: () => now, transport })
  expect(fetches).toBe(1)
  const [stored] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored!.refreshedAt).toEqual(now)
  expect(await inOrg((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))).toHaveLength(1)
  await runWindowDueProject({ orgId, projectId: project.id }, now, { now: () => now, transport })
  expect(fetches).toBe(1)
  const later = new Date('2026-11-17T00:00:00Z')
  await inOrg((tx) =>
    tx.update(icsFeed).set({ url: null, filename: 'calendar.ics', nextRefreshAt: later }).where(eq(icsFeed.id, feed.id))
  )
  await runWindowDueProject({ orgId, projectId: project.id }, later, { now: () => later, transport })
  expect(fetches).toBe(1)
  const [file] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(file!.refreshedAt).toEqual(later)
  expect(file!.nextRefreshAt!.getTime()).toBeGreaterThan(later.getTime())
})

test('a failed fetch keeps successful validators and defers the retry for an hour', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const now = new Date('2026-11-16T00:00:00Z')
  const feed = await inOrg((tx) =>
    makeIcsFeed(tx, {
      projectId: project.id,
      url: 'https://example.com/calendar',
      nextRefreshAt: now,
      etag: 'old',
      provenance: { version: 1, declaredBy: 'account', via: 'app' }
    })
  )
  let attempts = 0
  const transport = {
    assertPublicUrl: async () => {},
    safeFetch: async () => {
      attempts++
      throw new Error('offline')
    }
  } as unknown as CalendarTransport
  const target = { orgId, projectId: project.id }
  await runWindowDueProject(target, now, { now: () => now, transport })
  const [failed] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(failed!.etag).toBe('old')
  expect(failed!.lastError).toContain('fetch-failed')
  expect(failed!.refreshClaim).toBeNull()
  expect(failed!.nextRefreshAt).toEqual(new Date(now.getTime() + 3_600_000))
  await runWindowDueProject(target, now, { now: () => now, transport })
  expect(attempts).toBe(1)
})

test('a project archived during HTTP cannot apply the claimed calendar', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const now = new Date('2026-11-16T00:00:00Z')
  const feed = await inOrg((tx) =>
    makeIcsFeed(tx, {
      projectId: project.id,
      url: 'https://example.com/calendar',
      nextRefreshAt: now,
      provenance: { version: 1, declaredBy: 'account', via: 'app' }
    })
  )
  const transport = {
    assertPublicUrl: async () => {},
    safeFetch: async () => {
      await inOrg((tx) => tx.update(projectTable).set({ archivedAt: now }).where(eq(projectTable.id, project.id)))
      return new Response(
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'BEGIN:VEVENT',
          'UID:one',
          'DTSTART:20261117T090000Z',
          'DTEND:20261117T100000Z',
          'SUMMARY:Class',
          'END:VEVENT',
          'END:VCALENDAR',
          ''
        ].join('\r\n'),
        { status: 200 }
      )
    }
  } as unknown as CalendarTransport
  await runWindowDueProject({ orgId, projectId: project.id }, now, { now: () => now, transport })
  expect(await inOrg((tx) => tx.select().from(window).where(eq(window.icsFeedId, feed.id)))).toEqual([])
  const [stored] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored!.refreshedAt).toBeNull()
})

test('a depleted global feed budget leaves due feeds unclaimed', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const now = new Date('2026-11-16T00:00:00Z')
  const feed = await inOrg((tx) =>
    makeIcsFeed(tx, { projectId: project.id, url: 'https://example.com/calendar', nextRefreshAt: now })
  )
  let fetches = 0
  const transport = {
    assertPublicUrl: async () => {},
    safeFetch: async () => {
      fetches++
      throw new Error('unexpected')
    }
  } as unknown as CalendarTransport
  await runWindowDueProject(
    { orgId, projectId: project.id },
    now,
    { now: () => now, transport },
    { series: 0, feeds: 0 }
  )
  expect(fetches).toBe(0)
  const [stored] = await inOrg((tx) => tx.select().from(icsFeed).where(eq(icsFeed.id, feed.id)))
  expect(stored!.lastAttemptAt).toBeNull()
})

test('failed legacy series move behind later due series without being marked checked', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const now = new Date('2026-11-16T00:00:00Z')
  const common = { orgId, projectId: project.id, localStart: '09:00', localEnd: '10:00' }
  const [first, second, valid] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values([
        { ...common, rule: {}, definition: null, updatedAt: new Date('2026-01-01') },
        { ...common, rule: {}, definition: null, updatedAt: new Date('2026-01-02') },
        {
          ...common,
          updatedAt: new Date('2026-01-03'),
          rule: { frequency: 'weekly', days_of_week: ['monday'], count: 2, skip_dates: [] },
          definition: {
            version: 1,
            source: 'native',
            anchor: '2026-11-16',
            dateOffsetDays: 0,
            endDayOffset: 0,
            title: 'Class',
            kind: 'class',
            tz: 'UTC',
            provenance: { declaredBy: 'account', via: 'app', shareLinkId: null, guest: false }
          }
        }
      ])
      .returning()
  )
  const target = { orgId, projectId: project.id }
  const transport = {
    assertPublicUrl: async () => {},
    safeFetch: async () => {
      throw new Error('unexpected')
    }
  } as unknown as CalendarTransport
  await runWindowDueProject(target, now, { now: () => now, transport })
  await runWindowDueProject(target, now, { now: () => now, transport })
  const rows = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.projectId, project.id)))
  for (const id of [first!.id, second!.id])
    expect(rows.find((row) => row.id === id)).toMatchObject({ checkedOn: null, lastError: 'extension-failed' })
  expect(rows.find((row) => row.id === valid!.id)!.checkedOn).not.toBeNull()
})
