import {
  mutateNativeWindowSeries,
  project as projectTable,
  systemPrincipal,
  window,
  windowSeries,
  withTenant,
  type Tx
} from '@skyclause/db'
import { makeOrganization, makeProject } from '@skyclause/db/test/factories/index'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { extendDueWindowSeries, recordNativeWindowFailure } from '../src/services/windows/due-native'

test('extension retains historical identities and count, and checks only once per project local date', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx, { timeZone: 'Asia/Kuala_Lumpur' }))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00:00',
        localEnd: '10:00:00',
        rule: { frequency: 'weekly', days_of_week: ['monday'], count: 20, skip_dates: ['2026-11-23'] },
        definition: {
          version: 1,
          source: 'native',
          anchor: '2026-11-16',
          dateOffsetDays: 0,
          endDayOffset: 0,
          title: 'Class',
          kind: 'class',
          tz: 'Asia/Kuala_Lumpur',
          provenance: { declaredBy: 'account', via: 'app', shareLinkId: null, guest: false }
        }
      })
      .returning()
  )
  const now = new Date('2026-11-15T16:30:00Z')
  await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { projectId: project.id, seriesId: series!.id, now }))
  const rows = await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))
  expect(rows.length).toBeGreaterThan(1)
  expect(rows.map((row) => row.seriesOccurrenceDate)).not.toContain('2026-11-23')
  const [checked] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(checked!.checkedOn).toBe('2026-11-16')
  await inOrg((tx) =>
    recordNativeWindowFailure({ tx, principal }, { projectId: project.id, seriesId: series!.id, now })
  )
  const [afterLateFailure] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(afterLateFailure!.lastError).toBeNull()
  await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { projectId: project.id, seriesId: series!.id, now }))
  expect(await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))).toHaveLength(rows.length)
  const tombstone = rows.find((row) => row.seriesOccurrenceDate === '2026-11-30')!
  await inOrg((tx) =>
    tx
      .update(window)
      .set({ cancelledAt: now, cancellationOrigin: 'manual', localOverride: true })
      .where(eq(window.id, tombstone.id))
  )
  const tomorrow = new Date('2026-11-17T00:00:00Z')
  await inOrg((tx) =>
    extendDueWindowSeries({ tx, principal }, { projectId: project.id, seriesId: series!.id, now: tomorrow })
  )
  const after = await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))
  expect(after.find((row) => row.id === tombstone.id)).toMatchObject({ cancelledAt: now, localOverride: true })
  expect(after.filter((row) => row.seriesOccurrenceDate === tombstone.seriesOccurrenceDate)).toHaveLength(1)
  expect(after.find((row) => row.id === rows[0]!.id)).toBeDefined()
})

test('an archived project cannot extend or mark a native series checked', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx, { archivedAt: new Date() }))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00:00',
        localEnd: '10:00:00',
        rule: {},
        definition: null
      })
      .returning()
  )
  expect(
    await inOrg((tx) =>
      extendDueWindowSeries(
        { tx, principal },
        {
          projectId: project.id,
          seriesId: series!.id,
          now: new Date('2026-11-16T00:00:00Z')
        }
      )
    )
  ).toBe(0)
  const [row] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(row!.checkedOn).toBeNull()
})

test('legacy series without declaration proof fails without advancing its frontier', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00:00',
        localEnd: '10:00:00',
        rule: {},
        definition: null
      })
      .returning()
  )
  await expect(
    inOrg((tx) =>
      extendDueWindowSeries(
        { tx, principal },
        {
          projectId: project.id,
          seriesId: series!.id,
          now: new Date('2026-11-16T00:00:00Z')
        }
      )
    )
  ).rejects.toThrow()
  await inOrg((tx) =>
    recordNativeWindowFailure(
      { tx, principal },
      { projectId: project.id, seriesId: series!.id, now: new Date('2026-11-16T00:00:00Z') }
    )
  )
  const [row] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(row!.lastError).toBe('extension-failed')
  expect(row!.checkedOn).toBeNull()
  expect(row!.materialisedUntil).toBeNull()
})

test('Commons cannot mark an empty extension successful without its budget policy', async () => {
  const orgId = (await makeOrganization({ slug: 'commons' })).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00:00',
        localEnd: '10:00:00',
        rule: { frequency: 'weekly', days_of_week: ['monday'], count: 1, skip_dates: [] },
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
      })
      .returning()
  )
  await expect(
    inOrg((tx) =>
      extendDueWindowSeries(
        { tx, principal },
        {
          projectId: project.id,
          seriesId: series!.id,
          now: new Date('2027-01-01T00:00:00Z')
        }
      )
    )
  ).rejects.toThrow()
  const [row] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(row!.checkedOn).toBeNull()
})

test('a series containing an unsupported guest member cannot extend unattended', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00',
        localEnd: '10:00',
        rule: { frequency: 'weekly', days_of_week: ['monday'], count: 20, skip_dates: [] },
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
      })
      .returning()
  )
  await inOrg((tx) =>
    tx.insert(window).values({
      orgId,
      projectId: project.id,
      seriesId: series!.id,
      seriesOccurrenceDate: '2026-11-16',
      startsAt: new Date('2026-11-16T09:00Z'),
      endsAt: new Date('2026-11-16T10:00Z'),
      title: 'Class',
      kind: 'class',
      tz: 'UTC',
      declaredBy: 'guest',
      via: 'guest',
      guest: true
    })
  )
  await expect(
    inOrg((tx) =>
      extendDueWindowSeries(
        { tx, principal },
        { projectId: project.id, seriesId: series!.id, now: new Date('2026-11-16T00:00Z') }
      )
    )
  ).rejects.toThrow()
})

test('offset recurrence retains original identity dates and its original count', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00',
        localEnd: '10:00',
        rule: { frequency: 'weekly', days_of_week: ['tuesday'], count: 3, skip_dates: ['2026-11-24'] },
        definition: {
          version: 1,
          source: 'native',
          anchor: '2026-11-16',
          dateOffsetDays: 1,
          endDayOffset: 0,
          title: 'Class',
          kind: 'class',
          tz: 'UTC',
          provenance: { declaredBy: 'account', via: 'app', shareLinkId: null, guest: false }
        }
      })
      .returning()
  )
  await inOrg((tx) =>
    extendDueWindowSeries(
      { tx, principal },
      { projectId: project.id, seriesId: series!.id, now: new Date('2026-11-16T00:00Z') }
    )
  )
  const rows = await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))
  expect(rows.map((row) => row.seriesOccurrenceDate).sort()).toEqual(['2026-11-16', '2026-11-30'])
  expect(rows.map((row) => row.startsAt.toISOString()).sort()).toEqual([
    '2026-11-17T09:00:00.000Z',
    '2026-12-01T09:00:00.000Z'
  ])
})

test('an invalid later local time rolls back the entire native extension', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '01:30',
        localEnd: '02:30',
        rule: { frequency: 'weekly', days_of_week: ['sunday'], count: 6, skip_dates: [] },
        definition: {
          version: 1,
          source: 'native',
          anchor: '2027-03-07',
          dateOffsetDays: 0,
          endDayOffset: 0,
          title: 'Class',
          kind: 'class',
          tz: 'Europe/London',
          provenance: { declaredBy: 'account', via: 'app', shareLinkId: null, guest: false }
        }
      })
      .returning()
  )
  await expect(
    inOrg((tx) =>
      extendDueWindowSeries(
        { tx, principal },
        { projectId: project.id, seriesId: series!.id, now: new Date('2027-03-01T00:00Z') }
      )
    )
  ).rejects.toThrow()
  expect(await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))).toEqual([])
  const [stored] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(stored!.checkedOn).toBeNull()
  expect(stored!.materialisedUntil).toBeNull()
})

test.each(['extension', 'failure'] as const)(
  'an older %s cannot supersede a newer successful local-date check',
  async (lateAttempt) => {
    const orgId = (await makeOrganization()).id
    const principal = systemPrincipal('windows-due')
    const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
    const project = await inOrg((tx) => makeProject(tx, { timeZone: 'UTC' }))
    const failed = lateAttempt === 'failure'
    const [series] = await inOrg((tx) =>
      tx
        .insert(windowSeries)
        .values({
          orgId,
          projectId: project.id,
          localStart: '09:00',
          localEnd: '10:00',
          rule: { frequency: 'weekly', days_of_week: ['monday'], count: 30, skip_dates: [] },
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
        })
        .returning()
    )
    const older = new Date('2026-11-16T00:00:00Z')
    const newer = new Date('2026-11-17T00:00:00Z')
    const input = { projectId: project.id, seriesId: series!.id }
    if (failed)
      await expect(
        inOrg((tx) =>
          mutateNativeWindowSeries(
            tx,
            { ...input, now: older },
            async () => {
              throw new Error('planning failed')
            },
            async () => {}
          )
        )
      ).rejects.toThrow('planning failed')
    await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { ...input, now: newer }))
    const [successful] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
    const members = await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))
    expect(successful).toMatchObject({ checkedOn: newer.toISOString().slice(0, 10), lastError: null, updatedAt: newer })
    if (lateAttempt === 'extension')
      await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { ...input, now: older }))
    else await inOrg((tx) => recordNativeWindowFailure({ tx, principal }, { ...input, now: older }))
    const [after] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
    expect(after).toMatchObject({
      checkedOn: successful!.checkedOn,
      materialisedUntil: successful!.materialisedUntil,
      lastError: null,
      updatedAt: newer
    })
    const afterMembers = await inOrg((tx) => tx.select().from(window).where(eq(window.seriesId, series!.id)))
    expect(afterMembers.map((row) => row.id).sort()).toEqual(members.map((row) => row.id).sort())
  }
)

test('a westward project timezone change waits for the local date to pass the last successful date', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx, { timeZone: 'Pacific/Kiritimati' }))
  const [series] = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values({
        orgId,
        projectId: project.id,
        localStart: '09:00',
        localEnd: '10:00',
        rule: { frequency: 'weekly', days_of_week: ['monday'], count: 30, skip_dates: [] },
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
      })
      .returning()
  )
  const first = new Date('2026-11-16T12:00:00Z')
  const later = new Date('2026-11-16T13:00:00Z')
  const input = { projectId: project.id, seriesId: series!.id }
  await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { ...input, now: first }))
  const [before] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(before!.checkedOn).toBe('2026-11-17')
  await inOrg((tx) => tx.update(projectTable).set({ timeZone: 'America/Adak' }).where(eq(projectTable.id, project.id)))
  await inOrg((tx) => extendDueWindowSeries({ tx, principal }, { ...input, now: later }))
  await inOrg((tx) => recordNativeWindowFailure({ tx, principal }, { ...input, now: later }))
  const [after] = await inOrg((tx) => tx.select().from(windowSeries).where(eq(windowSeries.id, series!.id)))
  expect(after).toMatchObject({
    checkedOn: before!.checkedOn,
    materialisedUntil: before!.materialisedUntil,
    lastError: null,
    updatedAt: first
  })
})
