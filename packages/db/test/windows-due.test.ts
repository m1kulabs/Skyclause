import {
  claimDueIcsFeeds,
  listDueNativeWindowSeries,
  listWindowDueProjects,
  organization,
  listEvaluatorProjects,
  withSystem,
  systemPrincipal,
  windowSeries,
  withTenant,
  type Tx
} from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { eq } from 'drizzle-orm'
import { makeIcsFeed, makeOrganization, makeProject } from './factories/index'
import { expect, test } from 'vitest'

test('native discovery selects due active series oldest first and bounds work', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx, { timeZone: 'Asia/Kuala_Lumpur' }))
  const rows = await inOrg((tx) =>
    tx
      .insert(windowSeries)
      .values([
        {
          orgId,
          projectId: project.id,
          localStart: '09:00',
          localEnd: '10:00',
          rule: {},
          updatedAt: new Date('2026-01-01')
        },
        {
          orgId,
          projectId: project.id,
          localStart: '09:00',
          localEnd: '10:00',
          rule: {},
          updatedAt: new Date('2026-02-01')
        },
        { orgId, projectId: project.id, localStart: '09:00', localEnd: '10:00', rule: {}, checkedOn: '2026-11-16' },
        { orgId, projectId: project.id, localStart: '09:00', localEnd: '10:00', rule: {}, cancelledAt: new Date() }
      ])
      .returning()
  )
  expect(
    await inOrg((tx) =>
      listDueNativeWindowSeries(tx, { projectId: project.id, now: new Date('2026-11-15T16:00:00Z'), limit: 1 })
    )
  ).toEqual([rows[0]!.id])
})

test('an archived project cannot claim due calendar work', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx, { archivedAt: new Date() }))
  await inOrg((tx) =>
    makeIcsFeed(tx, {
      projectId: project.id,
      url: 'https://example.com/calendar',
      nextRefreshAt: new Date('2026-11-01')
    })
  )
  expect(
    await inOrg((tx) =>
      claimDueIcsFeeds(tx, { projectId: project.id, now: new Date('2026-11-16'), includeFiles: true })
    )
  ).toEqual([])
})

test('bounded project pages wrap and eventually visit every project', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  await withTenant({ orgId, principal }, async (tx) => {
    for (let i = 0; i < 5; i++) await makeProject(tx)
  })
  await withSystem('windows-due-test', async (tx) => {
    const all = await listEvaluatorProjects(tx)
    const seen = new Set<string>()
    for (let slot = 0; slot < Math.ceil(all.length / 4) + 1; slot++) {
      const page = await listWindowDueProjects(tx, { now: new Date(slot * 900_000), limit: 4 })
      expect(page.length).toBeLessThanOrEqual(4)
      for (const target of page) seen.add(target.projectId)
    }
    expect(seen).toEqual(new Set(all.map((row) => row.projectId)))
  })
})

test('eight-project stride admits every stable project under a saturated eight-feed budget', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  await withTenant({ orgId, principal }, async (tx) => {
    for (let i = 0; i < 33; i++) await makeProject(tx)
  })
  await withSystem('windows-due-fairness', async (tx) => {
    const all = await listEvaluatorProjects(tx)
    const admitted = new Set<string>()
    for (let slot = 0; slot < Math.ceil(all.length / 8) + 1; slot++) {
      const page = await listWindowDueProjects(tx, { now: new Date(slot * 900_000), limit: 32, stride: 8 })
      for (const target of page.slice(0, 8)) admitted.add(target.projectId)
    }
    expect(admitted).toEqual(new Set(all.map((row) => row.projectId)))
  })
})

test('a suspended organisation cannot claim due calendar work', async () => {
  const orgId = (await makeOrganization()).id
  const principal = systemPrincipal('windows-due')
  const inOrg = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal }, fn)
  const project = await inOrg((tx) => makeProject(tx))
  await inOrg((tx) =>
    makeIcsFeed(tx, {
      projectId: project.id,
      url: 'https://example.com/calendar',
      nextRefreshAt: new Date('2026-11-01')
    })
  )
  await authDatabase().update(organization).set({ deletionRequestedAt: new Date() }).where(eq(organization.id, orgId))
  expect(
    await inOrg((tx) =>
      claimDueIcsFeeds(tx, { projectId: project.id, now: new Date('2026-11-16'), includeFiles: true })
    )
  ).toEqual([])
})
