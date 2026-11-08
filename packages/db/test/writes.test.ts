// #79 §1 shared writes: recordAudit, track and projectGate.
import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { authDatabase } from '../src/auth'
import { organization, projectGate, recordAudit, track, withSystem, withTenant, type Tx } from '../src'
import { makeOrganization, makePlanFeedback, makeProject } from './factories'
import { asLogin, expectOneAudit, memberOf, refusal } from './harness'

let orgId: string
const asMember = <T>(fn: (tx: Tx) => Promise<T>, principal: Principal = memberOf(orgId)) =>
  withTenant({ orgId, principal }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

test('recordAudit writes one row with the transaction’s principal as actor and client', async () => {
  const session = memberOf(orgId)
  const key: Principal = {
    kind: 'api_key',
    keyId: randomUUID(),
    accountId: randomUUID(),
    orgId,
    role: 'admin',
    scopes: ['admin'],
    client: 'api',
    clientName: 'deploy-bot'
  }
  const job: Principal = { kind: 'system', job: 'commons:provision', client: 'worker', clientName: null }
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  const targets = [randomUUID(), randomUUID(), randomUUID()]
  for (const [i, principal] of [session, key, job].entries()) {
    await asMember(
      (tx) =>
        recordAudit(tx, {
          action: 'sla.changed',
          target: { type: 'project_pack', id: targets[i]! },
          projectId,
          before: { sla_s: 900 },
          after: { sla_s: 600 }
        }),
      principal
    )
  }
  const rows = await Promise.all(targets.map((targetId) => expectOneAudit('sla.changed', { orgId, targetId })))
  expect(
    rows.map(({ actor_type, actor_id, client, client_name }) => ({ actor_type, actor_id, client, client_name }))
  ).toEqual([
    { actor_type: 'account', actor_id: (session as { accountId: string }).accountId, client: 'app', client_name: null },
    { actor_type: 'api_key', actor_id: (key as { keyId: string }).keyId, client: 'api', client_name: 'deploy-bot' },
    { actor_type: 'system', actor_id: 'commons:provision', client: 'worker', client_name: null }
  ])
  expect(rows[0]).toMatchObject({
    project_id: projectId,
    target_type: 'project_pack',
    before: { sla_s: 900 },
    after: { sla_s: 600 }
  })
})

test('recordAudit refuses a before or after holding an email address, in a value or a key', async () => {
  for (const change of [
    { after: { invited: 'someone@example.test' } },
    { before: { list: [{ 'a@b.example': true }] } }
  ]) {
    await expect(
      asMember((tx) =>
        recordAudit(tx, { action: 'invite.created', target: { type: 'invitation', id: randomUUID() }, ...change })
      )
    ).rejects.toThrow(/email address/)
  }
})

test('expectOneAudit fails on no row and on two', async () => {
  const targetId = randomUUID()
  await expect(expectOneAudit('share_link.revoked', { orgId, targetId })).rejects.toThrow(/found 0/)
  for (const _ of [1, 2]) {
    await asMember((tx) =>
      recordAudit(tx, { action: 'share_link.revoked', target: { type: 'share_link', id: targetId } })
    )
  }
  await expect(expectOneAudit('share_link.revoked', { orgId, targetId })).rejects.toThrow(/found 2/)
})

test('recordAudit needs an organisation', async () => {
  await expect(
    withSystem('test-audit', (tx) => recordAudit(tx, { action: 'staff.action', target: { type: 'x', id: 'y' } }))
  ).rejects.toThrow(/withTenant/)
})

test('track writes the event in the organisation, and app can’t read analytics_event', async () => {
  const projectId = await asMember(async (tx) => (await makeProject(tx)).id)
  await asMember((tx) => track(tx, 'replay_run', { pack: 'sky', days: 30 }, { projectId }))
  const rows = await asLogin('postgres', async (client) => {
    const { rows } = await client.query(
      'SELECT org_id, project_id, name, props FROM analytics_event WHERE project_id = $1',
      [projectId]
    )
    return rows
  })
  expect(rows).toEqual([{ org_id: orgId, project_id: projectId, name: 'replay_run', props: { pack: 'sky', days: 30 } }])
  expect(await refusal(asMember((tx) => tx.execute(sql`SELECT * FROM analytics_event`)))).toMatch(/permission denied/)
})

test('track rejects a property outside the PRD catalogue, a wrong value and a missing one', async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['email', { pack: 'sky', days: 30, email: 'someone@example.test' }],
    ['pack', { pack: 'rain', days: 30 }],
    ['days', { pack: 'sky' }]
  ]
  for (const [field, props] of cases) {
    await expect(
      asMember((tx) => track(tx, 'replay_run', props as never)),
      field
    ).rejects.toThrow(new RegExp(field))
  }
})

test('track outside an organisation stores no org_id, and refuses another organisation’s project', async () => {
  await withSystem('test-analytics', (tx) => track(tx, 'guest_started', { bot_check: 'passed' }))
  const other = (await makeOrganization()).id
  const projectId = await withTenant(
    { orgId: other, principal: memberOf(other) },
    async (tx) => (await makeProject(tx)).id
  )
  expect(await refusal(asMember((tx) => track(tx, 'project_created', { packs: ['sky'] }, { projectId })))).toMatch(
    /not in this transaction/
  )
  const nulls = await asLogin('postgres', async (client) =>
    Number(
      (await client.query("SELECT count(*) AS n FROM analytics_event WHERE name = 'guest_started' AND org_id IS NULL"))
        .rows[0].n
    )
  )
  expect(nulls).toBe(1)
})

test('plan_feedback rows are inserted with count 1 only', async () => {
  expect(await refusal(asMember((tx) => makePlanFeedback(tx, { count: 2 })))).toMatch(/plan_feedback_count_one/)
})

test('projectGate: open, archived when archived_at is set, suspended once the organisation asks for deletion', async () => {
  const own = (await makeOrganization()).id
  const asOwn = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId: own, principal: memberOf(own) }, fn)
  const gate = (projectId: string) => asOwn((tx) => projectGate(tx, projectId))
  const [open, archived] = await asOwn(async (tx) => [
    (await makeProject(tx)).id,
    (await makeProject(tx, { archivedAt: new Date() })).id
  ])
  expect([await gate(open!), await gate(archived!)]).toEqual(['open', 'archived'])
  await authDatabase().update(organization).set({ deletionRequestedAt: new Date() }).where(eq(organization.id, own))
  // Suspension is the organisation's, so it wins over a project's archive.
  expect([await gate(open!), await gate(archived!)]).toEqual(['suspended', 'suspended'])
})

test('projectGate throws for a project the transaction can’t see', async () => {
  const other = (await makeOrganization()).id
  const projectId = await withTenant(
    { orgId: other, principal: memberOf(other) },
    async (tx) => (await makeProject(tx)).id
  )
  await expect(asMember((tx) => projectGate(tx, projectId))).rejects.toThrow(/not found/)
})
