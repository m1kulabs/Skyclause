import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Principal } from '@skyclause/contracts'
import { describe, expect, test } from 'vitest'
import {
  cancelOrganizationDeletion,
  completeExportJob,
  createExportJob,
  deleteAccount,
  exportJob,
  failStaleExports,
  getExportJob,
  getOrganizationDeletion,
  projectGate,
  purgeOrganization,
  readAccountExport,
  recordExportFailure,
  scheduleOrganizationDeletion,
  startExportJob,
  systemPrincipal,
  withSystem,
  withTenant,
  type Tx
} from '../src'
import { authDatabase } from '../src/auth'
import {
  aiKey,
  apikey,
  auditEvent,
  account as authAccount,
  invitation,
  ledgerEntry,
  member,
  notification,
  notificationPreference,
  notice,
  organization,
  passkey,
  pushSubscription,
  rotaShift,
  session,
  user as authUser
} from '../src/schema'
import {
  makeAiKey,
  makeAuditEvent,
  makeLedgerEntry,
  makeMember,
  makeNotification,
  makeNotificationPreference,
  makeOrganization,
  makeProject,
  makePushSubscription,
  makeRotaShift,
  makeUser,
  makePoll,
  makeReading,
  makeSource,
  sharedFactories,
  tenantFactories
} from './factories'
import { asLogin, expectOneAudit } from './harness'

const principal = (accountId: string): Principal => ({
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
  authenticatedAt: new Date('2026-11-08T00:00:00Z')
})

const inOrg = <T>(orgId: string, fn: (tx: Tx) => Promise<T>) =>
  withTenant({ orgId, principal: systemPrincipal('test:data-rights') }, fn)

describe('a-data-rights database operations', () => {
  test('scheduling suspends every project; cancelling restores it and writes one audit row per action', async () => {
    const org = await makeOrganization()
    const actor = principal(randomUUID())
    const projectId = await inOrg(org.id, async (tx) => (await makeProject(tx)).id)
    const now = new Date('2026-11-08T02:00:00Z')

    const requested = await scheduleOrganizationDeletion({ orgId: org.id, slug: org.slug, actor, now })
    expect(requested).toEqual({
      deletionRequestedAt: now,
      purgeAfter: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    })
    expect(await inOrg(org.id, (tx) => projectGate(tx, projectId))).toBe('suspended')
    await expectOneAudit('organisation.deletion_requested', { orgId: org.id })

    await expect(getOrganizationDeletion(org.id)).resolves.toEqual(requested)
    await expect(cancelOrganizationDeletion({ orgId: org.id, actor, now })).resolves.toEqual({
      deletionRequestedAt: null,
      purgeAfter: null
    })
    expect(await inOrg(org.id, (tx) => projectGate(tx, projectId))).toBe('open')
    await expectOneAudit('organisation.deletion_cancelled', { orgId: org.id })
  })

  test('an account that is its organisation’s only Owner is refused with the organisation listed', async () => {
    const org = await makeOrganization()
    const account = await makeUser({ name: 'Owner name', email: 'sole-owner@example.test' })
    await makeMember({ organizationId: org.id, userId: account.id, role: 'owner' })

    await expect(
      deleteAccount({ accountId: account.id, email: account.email, actor: principal(account.id), now: new Date() })
    ).rejects.toMatchObject({ code: 'sole-owner', organisations: [{ id: org.id, slug: org.slug }] })
    const [unchanged] = await authDatabase().select().from(organization).where(eq(organization.id, org.id))
    expect(unchanged).toBeDefined()
    const [stillActive] = await authDatabase().select().from(member).where(eq(member.userId, account.id))
    expect(stillActive).toBeDefined()
  })

  test('concurrent account deletions preserve an organisation’s last Owner', async () => {
    const org = await makeOrganization()
    const owners = await Promise.all([makeUser(), makeUser()])
    for (const owner of owners) await makeMember({ organizationId: org.id, userId: owner.id, role: 'owner' })

    const results = await asLogin('postgres', async (client) => {
      await client.query('BEGIN')
      await client.query('SELECT id FROM auth.organization WHERE id = $1 FOR UPDATE', [org.id])
      const deleting = Promise.allSettled(
        owners.map((owner) =>
          deleteAccount({ accountId: owner.id, email: owner.email, actor: principal(owner.id), now: new Date() })
        )
      )
      try {
        // Both deletions reach the same organisation before either may commit.
        await expect
          .poll(async () => {
            await client.query('SELECT pg_stat_clear_snapshot()')
            const { rows } = await client.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM pg_stat_activity
             WHERE datname = current_database() AND usename = 'retention' AND wait_event_type = 'Lock'`
            )
            return rows[0]!.n
          })
          .toBe(2)
      } finally {
        await client.query('COMMIT')
        await deleting
      }
      return deleting
    })

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((result) => result.status === 'rejected')
    expect(refused).toMatchObject({ status: 'rejected', reason: { code: 'sole-owner' } })
    expect(await authDatabase().select().from(member).where(eq(member.organizationId, org.id))).toHaveLength(1)
  })

  test('deletion pseudonymises the user, removes account rows, and preserves ledger and audit actor IDs', async () => {
    const org = await makeOrganization()
    const account = await makeUser({ name: 'Account name', email: 'account@example.test' })
    await makeMember({ organizationId: org.id, userId: account.id, role: 'admin' })
    const projectId = await inOrg(org.id, async (tx) => {
      const project = await makeProject(tx)
      await makeLedgerEntry(tx, { projectId: project.id, body: { actor_id: account.id } })
      await makeAuditEvent(tx, { projectId: project.id, actorId: account.id })
      await makeAiKey(tx, { ownerType: 'account', accountId: account.id })
      await makeNotification(tx, { accountId: account.id })
      await makeNotificationPreference(tx, { accountId: account.id })
      await makePushSubscription(tx, { accountId: account.id })
      await makeRotaShift(tx, { accountId: account.id })
      return project.id
    })
    await authDatabase()
      .insert(session)
      .values({
        id: randomUUID(),
        token: randomUUID(),
        userId: account.id,
        expiresAt: new Date('2026-12-01T00:00:00Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      })
    await authDatabase().insert(authAccount).values({
      accountId: 'provider-account',
      providerId: 'google',
      userId: account.id,
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      idToken: 'id-secret',
      password: 'password-secret',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    await authDatabase().insert(passkey).values({
      name: 'Laptop passkey',
      publicKey: 'public-key',
      userId: account.id,
      credentialID: randomUUID(),
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: new Date()
    })
    await authDatabase().insert(apikey).values({
      referenceId: account.id,
      key: 'api-secret',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const accountExport = await readAccountExport(account.id)
    expect(accountExport).toMatchObject({
      profile: { id: account.id, name: 'Account name', email: account.email },
      signInMethods: [{ providerId: 'google' }],
      passkeys: [{ name: 'Laptop passkey' }]
    })
    const accountArchive = JSON.stringify(accountExport)
    for (const secret of [
      'access-secret',
      'refresh-secret',
      'id-secret',
      'password-secret',
      'api-secret',
      'public-key',
      'sealed',
      'wrapped'
    ]) {
      expect(accountArchive).not.toContain(secret)
    }

    const accountJob = await createExportJob({
      scope: 'account',
      orgId: null,
      accountId: account.id,
      formats: ['json'],
      now: new Date()
    })
    await completeExportJob(accountJob.id, `accounts/${account.id}/exports/${accountJob.id}.zip`, new Date())
    const organisationJob = await createExportJob({
      scope: 'organisation',
      orgId: org.id,
      accountId: account.id,
      formats: ['json'],
      now: new Date()
    })

    const now = new Date('2026-11-08T03:00:00Z')
    await expect(
      deleteAccount({ accountId: account.id, email: account.email, actor: principal(account.id), now })
    ).resolves.toEqual({
      deletedAt: now,
      accountExportsRemoved: 1,
      organisations: [{ id: org.id, slug: org.slug, name: org.name, role: 'admin' }]
    })

    const [deleted] = await authDatabase().select().from(authUser).where(eq(authUser.id, account.id))
    expect(deleted).toMatchObject({
      id: account.id,
      name: '',
      image: null,
      email: `${account.id}@deleted.invalid`,
      deletedAt: now
    })
    expect(await authDatabase().select().from(session).where(eq(session.userId, account.id))).toEqual([])
    expect(await authDatabase().select().from(authAccount).where(eq(authAccount.userId, account.id))).toEqual([])
    expect(await authDatabase().select().from(passkey).where(eq(passkey.userId, account.id))).toEqual([])
    expect(await authDatabase().select().from(apikey).where(eq(apikey.referenceId, account.id))).toEqual([])
    expect(await authDatabase().select().from(member).where(eq(member.userId, account.id))).toEqual([])
    await withSystem('test:data-rights', async (tx) => {
      expect(await tx.select().from(exportJob).where(eq(exportJob.id, accountJob.id))).toEqual([])
      expect(await tx.select().from(notice).where(eq(notice.accountId, account.id))).toEqual([])
      expect(
        await tx.select({ accountId: exportJob.accountId }).from(exportJob).where(eq(exportJob.id, organisationJob.id))
      ).toEqual([{ accountId: null }])
    })
    await inOrg(org.id, async (tx) => {
      const [ledger] = await tx.select().from(ledgerEntry).where(eq(ledgerEntry.projectId, projectId))
      expect((ledger?.body as { actor_id?: string }).actor_id).toBe(account.id)
      const audits = await tx.select().from(auditEvent).where(eq(auditEvent.actorId, account.id))
      expect(audits).toHaveLength(2)
      expect(audits.filter(({ action }) => action === 'account.deleted')).toHaveLength(1)
      expect(
        await tx.select().from(notificationPreference).where(eq(notificationPreference.accountId, account.id))
      ).toEqual([])
      expect(await tx.select().from(aiKey).where(eq(aiKey.accountId, account.id))).toEqual([])
      expect(await tx.select().from(notification).where(eq(notification.accountId, account.id))).toEqual([])
      expect(await tx.select().from(pushSubscription).where(eq(pushSubscription.accountId, account.id))).toEqual([])
      expect(await tx.select().from(rotaShift).where(eq(rotaShift.accountId, account.id))).toEqual([])
    })
    await expectOneAudit('account.deleted', { orgId: org.id, targetId: account.id })
  })

  test('export jobs are unique while queued or running, then may be retried after failure', async () => {
    const org = await makeOrganization()
    const requester = randomUUID()
    const now = new Date('2026-11-08T02:00:00Z')
    const job = await createExportJob({
      scope: 'organisation',
      orgId: org.id,
      accountId: requester,
      formats: ['json', 'csv'],
      now
    })
    expect(job).toMatchObject({
      scope: 'organisation',
      orgId: org.id,
      accountId: requester,
      formats: ['json', 'csv'],
      status: 'queued'
    })
    await expect(
      createExportJob({ scope: 'organisation', orgId: org.id, accountId: requester, formats: ['json'], now })
    ).rejects.toMatchObject({ code: 'export-pending' })

    await withSystem('test:data-rights', async (tx) => {
      await tx.update(exportJob).set({ status: 'failed', error: 'temporary failure' }).where(eq(exportJob.id, job.id))
    })
    await expect(
      createExportJob({ scope: 'organisation', orgId: org.id, accountId: requester, formats: ['json'], now })
    ).resolves.toMatchObject({ status: 'queued', error: null })
  })

  test('the 24-hour timeout keeps the task error, fails the job, and allows a new request', async () => {
    const org = await makeOrganization()
    const requester = randomUUID()
    const createdAt = new Date()
    const job = await createExportJob({
      scope: 'organisation',
      orgId: org.id,
      accountId: requester,
      formats: ['json'],
      now: createdAt
    })
    await expect(startExportJob(job.id, createdAt)).resolves.toMatchObject({ status: 'running' })
    await recordExportFailure(job.id, 'Storage write failed.', new Date(createdAt.getTime() + 60 * 60 * 1000))

    const deadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
    await expect(failStaleExports(deadline)).resolves.toBeGreaterThanOrEqual(1)
    await expect(getExportJob(job.id)).resolves.toMatchObject({ status: 'failed', error: 'Storage write failed.' })
    await expect(
      createExportJob({
        scope: 'organisation',
        orgId: org.id,
        accountId: requester,
        formats: ['json'],
        now: deadline
      })
    ).resolves.toMatchObject({ status: 'queued', error: null })
  })

  test('the purge removes every factory row carrying the organisation ID, plus owned-source observations', async () => {
    const org = await makeOrganization()
    const actor = principal(randomUUID())
    const owner = await makeUser({ email: `purge-${randomUUID()}@example.test` })
    await makeMember({ organizationId: org.id, userId: owner.id, role: 'viewer' })
    await authDatabase()
      .insert(invitation)
      .values({
        organizationId: org.id,
        email: `invite-${randomUUID()}@example.test`,
        role: 'viewer',
        status: 'pending',
        expiresAt: new Date('2026-12-01T00:00:00Z'),
        createdAt: new Date(),
        inviterId: owner.id
      })

    const sourceId = await withTenant({ orgId: org.id, principal: systemPrincipal('test:data-rights') }, async (tx) => {
      for (const make of Object.values(tenantFactories)) await make(tx)
      for (const make of Object.values(sharedFactories)) await make(tx)
      const project = await makeProject(tx)
      const source = await makeSource(tx)
      const poll = await makePoll(tx, { sourceId: source.id })
      await makeReading(tx, { sourceId: source.id, pollId: poll.id })
      await makeAuditEvent(tx, { projectId: project.id, actorId: owner.id })
      await makeLedgerEntry(tx, { projectId: project.id, body: { actor_id: owner.id } })
      return source.id
    })
    const candidateTables = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<{ schemaName: string; tableName: string; columnName: string }>(`
        SELECT c.table_schema AS "schemaName", c.table_name AS "tableName", c.column_name AS "columnName"
        FROM information_schema.columns c
        JOIN pg_namespace ns ON ns.nspname = c.table_schema
        JOIN pg_class rel ON rel.relnamespace = ns.oid AND rel.relname = c.table_name
        WHERE c.table_schema IN ('public', 'auth')
          AND c.column_name IN ('org_id', 'owner_org_id', 'organization_id', 'organizationId')
          AND rel.relkind IN ('r', 'p') AND NOT rel.relispartition
        ORDER BY c.table_schema, c.table_name`)
      const tables = new Map<string, string[]>()
      for (const row of rows) {
        const key = `${row.schemaName}.${row.tableName}`
        tables.set(key, [...(tables.get(key) ?? []), row.columnName])
      }
      return [...tables]
    })
    const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`
    const countIds = async () =>
      asLogin('postgres', async (client) => {
        const found: string[] = []
        for (const [qualified, columns] of candidateTables) {
          const [schema, table] = qualified.split('.')
          const where = columns.map((column) => `${quoted(column)} = $1`).join(' OR ')
          const { rows } = await client.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM ${quoted(schema!)}.${quoted(table!)} WHERE ${where}`,
            [org.id]
          )
          if (rows[0]!.n !== '0') found.push(qualified)
        }
        return found
      })
    expect(await countIds()).toEqual(candidateTables.map(([qualified]) => qualified))
    await scheduleOrganizationDeletion({ orgId: org.id, slug: org.slug, actor, now: new Date('2026-10-01T00:00:00Z') })
    const [scheduled] = await authDatabase()
      .select({ purgeAfter: organization.purgeAfter })
      .from(organization)
      .where(eq(organization.id, org.id))
    expect(scheduled?.purgeAfter).toEqual(new Date('2026-10-31T00:00:00Z'))
    await expect(purgeOrganization(org.id, new Date('2026-11-08T00:00:00Z'))).resolves.toMatchObject({
      organisation: org.id
    })
    expect(await countIds()).toEqual([])
    const ownedChildren = await asLogin('postgres', async (client) => {
      const { rows } = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM source_state WHERE source_id = $1 UNION ALL SELECT count(*)::text FROM poll WHERE source_id = $1 UNION ALL SELECT count(*)::text FROM reading WHERE source_id = $1',
        [sourceId]
      )
      return rows
    })
    expect(ownedChildren.every(({ count }) => count === '0')).toBe(true)
    expect(await authDatabase().select().from(organization).where(eq(organization.id, org.id))).toEqual([])
  })
})
