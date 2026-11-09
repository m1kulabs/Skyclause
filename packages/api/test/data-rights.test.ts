import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Problem, type Principal } from '@skyclause/contracts'
import { analyticsEvent, auditEvent, createExportJob, exportJob, withSystem, withTenant } from '@skyclause/db'
import { makeMember, makeOrganization, makeUser } from '@skyclause/db/test/factories/index'
import { afterEach, expect, test, vi } from 'vitest'
import { apiRequest, asSession, createTestApi, createMailbox, crossOrgCase, testDeps, testOrg } from './harness'

const principalFor = (accountId: string): Principal => ({
  kind: 'session',
  client: 'app',
  clientName: null,
  via: 'cookie',
  accountId,
  sessionId: randomUUID(),
  isGuest: false,
  staff: false,
  orgId: null,
  role: null,
  authenticatedAt: new Date('2026-11-08T02:00:00Z')
})

function setup() {
  const scheduled: string[] = []
  const removedPrefixes: string[] = []
  const deps = Object.assign(testDeps({ withTenant }), {
    dataRights: {
      async enqueueExport(id: string) {
        scheduled.push(id)
      },
      async signDownload(path: string, expiresAt: Date) {
        return `https://storage.example.test/${encodeURIComponent(path)}?expires=${expiresAt.toISOString()}`
      },
      async deleteAccountExports(accountId: string) {
        removedPrefixes.push(`accounts/${accountId}/exports/`)
        return 0
      }
    }
  })
  return { ...createTestApi({ deps }), deps, scheduled, removedPrefixes, mailbox: createMailbox() }
}

afterEach(() => vi.restoreAllMocks())

test('an Owner queues one organisation export, tracks it, and audits it once', async () => {
  const org = testOrg(`rights-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: org.id, slug: org.slug })
  const owner = asSession({ org: org.slug, role: 'owner' })
  const app = setup()

  const response = await apiRequest(app.api, {
    as: owner,
    org: org.slug,
    method: 'POST',
    path: `/api/orgs/${org.slug}/exports`,
    idempotencyKey: randomUUID(),
    body: { formats: ['json', 'csv'] }
  })
  expect(response.status, await response.clone().text()).toBe(202)
  const body = (await response.json()) as { id: string; status: string; formats: string[] }
  expect(body).toMatchObject({ scope: 'organisation', status: 'queued', formats: ['json', 'csv'] })
  expect(app.scheduled).toEqual([body.id])

  const tracked = await withSystem('test:data-rights', (tx) =>
    tx.select({ props: analyticsEvent.props }).from(analyticsEvent).where(eq(analyticsEvent.name, 'export_requested'))
  )
  expect(tracked).toContainEqual({ props: { scope: 'organisation' } })
  expect(app.deps.audits.filter((row) => row.action === 'export.requested' && row.orgId === org.id)).toHaveLength(1)

  const pending = await apiRequest(app.api, {
    as: owner,
    org: org.slug,
    method: 'POST',
    path: `/api/orgs/${org.slug}/exports`,
    idempotencyKey: randomUUID(),
    body: { formats: ['json'] }
  })
  expect(pending.status).toBe(409)
  expect(Problem.safeParse(await pending.json()).success).toBe(true)
  expect(app.scheduled).toHaveLength(1)

  await crossOrgCase('listOrganisationExports', {
    app: app.api,
    as: owner,
    params: { org: `other-${randomUUID().slice(0, 8)}` }
  }).run()
})

test('only an Owner can schedule organisation deletion', async () => {
  const org = testOrg(`rights-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: org.id, slug: org.slug })
  const admin = asSession({ org: org.slug, role: 'admin' })
  const app = setup()

  const response = await apiRequest(app.api, {
    as: admin,
    org: org.slug,
    method: 'POST',
    path: `/api/orgs/${org.slug}/deletion`,
    body: { slug: org.slug }
  })
  expect(response.status).toBe(403)
})

test('an Owner schedules and cancels the grace period with one audit entry per transition', async () => {
  const org = testOrg(`rights-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: org.id, slug: org.slug })
  const owner = asSession({ org: org.slug, role: 'owner' })
  const app = setup()
  const scheduled = await apiRequest(app.api, {
    as: owner,
    org: org.slug,
    method: 'POST',
    path: `/api/orgs/${org.slug}/deletion`,
    body: { slug: org.slug }
  })
  expect(scheduled.status).toBe(202)
  expect(await scheduled.json()).toMatchObject({
    deletion_requested_at: '2026-11-08T02:00:00Z',
    purge_after: '2026-12-08T02:00:00Z'
  })

  const current = await apiRequest(app.api, {
    as: owner,
    org: org.slug,
    method: 'GET',
    path: `/api/orgs/${org.slug}/deletion`
  })
  expect(current.status).toBe(200)
  const cancelled = await apiRequest(app.api, {
    as: owner,
    org: org.slug,
    method: 'DELETE',
    path: `/api/orgs/${org.slug}/deletion`
  })
  expect(cancelled.status).toBe(200)
  expect(await cancelled.json()).toEqual({ deletion_requested_at: null, purge_after: null })
  const audits = await withTenant({ orgId: org.id, principal: owner }, (tx) => tx.select().from(auditEvent))
  expect(audits.filter((row) => row.action === 'organisation.deletion_requested')).toHaveLength(1)
  expect(audits.filter((row) => row.action === 'organisation.deletion_cancelled')).toHaveLength(1)
})

test('every organisation data-rights route hides an organisation the session cannot access', async () => {
  const target = testOrg(`target-${randomUUID().slice(0, 8)}`)
  const other = testOrg(`other-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: target.id, slug: target.slug })
  await makeOrganization({ id: other.id, slug: other.slug })
  const outsider = asSession({ org: other.slug, role: 'owner' })
  const app = setup()
  const requests = [
    { method: 'GET', path: `/api/orgs/${target.slug}/exports` },
    { method: 'POST', path: `/api/orgs/${target.slug}/exports`, body: { formats: ['json'] } },
    { method: 'GET', path: `/api/orgs/${target.slug}/deletion` },
    { method: 'POST', path: `/api/orgs/${target.slug}/deletion`, body: { slug: target.slug } },
    { method: 'DELETE', path: `/api/orgs/${target.slug}/deletion` }
  ] as const
  for (const request of requests) {
    const response = await apiRequest(app.api, { as: outsider, ...request })
    expect(response.status, `${request.method} ${request.path}`).toBe(404)
  }
})

test('an account can queue and list its own export once', async () => {
  const account = await makeUser({ email: `account-export-${randomUUID()}@example.test` })
  const app = setup()
  const actor = principalFor(account.id)
  const created = await apiRequest(app.api, {
    as: actor,
    method: 'POST',
    path: '/api/me/exports',
    idempotencyKey: randomUUID(),
    body: { format: 'json' }
  })
  expect(created.status).toBe(202)
  const job = (await created.json()) as { id: string; scope: string; format: string; formats: string[]; status: string }
  expect(job).toMatchObject({ scope: 'account', format: 'json', formats: ['json'], status: 'queued' })
  expect(app.scheduled).toEqual([job.id])

  const listed = await apiRequest(app.api, { as: actor, method: 'GET', path: '/api/me/exports' })
  expect(listed.status).toBe(200)
  expect(await listed.json()).toMatchObject({ data: [{ id: job.id, scope: 'account' }], next_cursor: null })

  const pending = await apiRequest(app.api, {
    as: actor,
    method: 'POST',
    path: '/api/me/exports',
    idempotencyKey: randomUUID(),
    body: { format: 'csv' }
  })
  expect(pending.status).toBe(409)
  expect(app.scheduled).toHaveLength(1)
})

test('account deletion requires the typed email and removes that account’s export prefix', async () => {
  const org = testOrg(`rights-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: org.id, slug: org.slug })
  const account = await makeUser({ name: 'Delete me', email: `delete-${randomUUID()}@example.test` })
  await makeMember({ organizationId: org.id, userId: account.id, role: 'admin' })
  const actor = principalFor(account.id)
  const app = setup()

  const wrong = await apiRequest(app.api, {
    as: actor,
    method: 'POST',
    path: '/api/me/deletion',
    body: { email: 'wrong@example.test' }
  })
  expect(wrong.status).toBe(400)

  const deleted = await apiRequest(app.api, {
    as: actor,
    method: 'POST',
    path: '/api/me/deletion',
    body: { email: account.email }
  })
  expect(deleted.status).toBe(202)
  expect(app.removedPrefixes).toEqual([`accounts/${account.id}/exports/`])
})

test('download redirects for the requester or an organisation admin and hides cross-organisation and expired exports', async () => {
  const org = testOrg(`download-${randomUUID().slice(0, 8)}`)
  await makeOrganization({ id: org.id, slug: org.slug })
  const account = await makeUser()
  const owner = asSession({ org: org.slug, role: 'owner' })
  const ownerAccountId = owner.kind === 'session' ? owner.accountId : ''
  const app = setup()
  const now = new Date('2026-11-08T02:00:00Z')
  const job = await createExportJob({
    scope: 'organisation',
    orgId: org.id,
    accountId: ownerAccountId,
    formats: ['json', 'csv'],
    now
  })
  await withSystem('test:data-rights', async (tx) => {
    await tx
      .update(exportJob)
      .set({
        status: 'ready',
        objectPath: `orgs/${org.id}/exports/${job.id}.zip`,
        expiresAt: new Date(now.getTime() + 7 * 86_400_000)
      })
      .where(eq(exportJob.id, job.id))
  })

  const ready = await apiRequest(app.api, { as: owner, method: 'GET', path: `/api/exports/${job.id}/download` })
  expect(ready.status).toBe(302)
  expect(ready.headers.get('location')).toContain(`orgs%2F${org.id}%2Fexports%2F${job.id}.zip`)

  const admin = asSession({ org: org.slug, role: 'admin' })
  const adminDownload = await apiRequest(app.api, { as: admin, method: 'GET', path: `/api/exports/${job.id}/download` })
  expect(adminDownload.status).toBe(302)

  const outsider = principalFor(account.id)
  const hidden = await apiRequest(app.api, { as: outsider, method: 'GET', path: `/api/exports/${job.id}/download` })
  expect(hidden.status).toBe(404)

  const otherOrg = await makeOrganization()
  const otherOwner = asSession({ org: otherOrg.slug, role: 'owner' })
  const otherOrgHidden = await apiRequest(app.api, {
    as: otherOwner,
    method: 'GET',
    path: `/api/exports/${job.id}/download`
  })
  expect(otherOrgHidden.status).toBe(404)

  await withSystem('test:data-rights', async (tx) => {
    await tx
      .update(exportJob)
      .set({ expiresAt: new Date(now.getTime() - 1) })
      .where(eq(exportJob.id, job.id))
  })
  const expired = await apiRequest(app.api, { as: owner, method: 'GET', path: `/api/exports/${job.id}/download` })
  expect(expired.status).toBe(410)
  expect(Problem.safeParse(await expired.json()).success).toBe(true)
})
