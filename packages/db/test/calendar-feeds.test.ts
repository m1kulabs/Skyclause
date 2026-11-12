import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { getIcsFeedRecord, insertIcsFeedRecord, listProjectIcsFeedRecords, withTenant } from '../src'
import { icsFeed } from '../src/schema'
import { makeOrganization, makeProject } from './factories'
import { memberOf, refusal } from './harness'

const now = new Date('2026-11-14T00:00:00Z')
async function context() {
  const { id: orgId } = await makeOrganization()
  const principal = memberOf(orgId)
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal }, fn)
  const project = await run(makeProject)
  return { orgId, principal, project, run }
}

test('pending feed ports inject tenant scope and retain only the supplied pending resource', async () => {
  const c = await context()
  const values = {
    projectId: c.project.id,
    url: 'https://calendar.example.test/schedule',
    kind: 'class' as const,
    provenance: {
      version: 1,
      actor_type: 'account',
      actor_id: c.principal.kind === 'session' ? c.principal.accountId : ''
    },
    nextRefreshAt: now,
    createdAt: now,
    updatedAt: now,
    orgId: randomUUID()
  }
  const row = await c.run((tx) => insertIcsFeedRecord(tx, values))
  expect(row).toMatchObject({
    orgId: c.orgId,
    projectId: c.project.id,
    kind: 'class',
    url: values.url,
    document: null,
    refreshedAt: null,
    lastAttemptAt: null,
    nextRefreshAt: now
  })
  expect(await c.run((tx) => getIcsFeedRecord(tx, row.id))).toEqual(row)
  expect(await c.run((tx) => getIcsFeedRecord(tx, randomUUID()))).toBeNull()
})

test('foreign feeds are hidden, foreign project inserts fail, and removed resources stay readable but leave active lists', async () => {
  const a = await context()
  const b = await context()
  const row = await a.run((tx) => insertIcsFeedRecord(tx, { projectId: a.project.id, filename: 'schedule.ics' }))
  expect(await b.run((tx) => getIcsFeedRecord(tx, row.id))).toBeNull()
  expect(
    await refusal(b.run((tx) => insertIcsFeedRecord(tx, { projectId: a.project.id, filename: 'schedule.ics' })))
  ).toMatch(/foreign key/)
  await a.run((tx) => tx.update(icsFeed).set({ deletedAt: now }).where(eq(icsFeed.id, row.id)))
  expect((await a.run((tx) => getIcsFeedRecord(tx, row.id)))!.deletedAt).toEqual(now)
  expect(await a.run((tx) => listProjectIcsFeedRecords(tx, { projectId: a.project.id, limit: 10 }))).toEqual([])
})
