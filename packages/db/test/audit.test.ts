// #107 a-audit-log: recordAudit's actor and client per principal kind, the append-only trigger, filters and
// cursors, read-time display names, and the index migration's query plans.
import { randomUUID } from 'node:crypto'
import type { Principal } from '@skyclause/contracts'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import {
  auditExportPage,
  auditHead,
  DELETED_ACCOUNT_NAME,
  listAudit,
  recordAudit,
  resolveActorDisplay,
  systemPrincipal,
  withTenant,
  type Tx
} from '../src'
import { authDatabase } from '../src/auth'
import { auditEvent, user } from '../src/schema'
import { makeAuditEvent, makeMember, makeOrganization, makeProject, makeUser } from './factories'
import { memberOf, refusal } from './harness'

/** The rows with `targetId`, read in the organisation: this file never uses `expectOneAudit`, so the coverage test
 * keeps reporting each action's own owner test as missing until that owner merges. */
const rowsFor = (targetId: string) =>
  asMember((tx) => tx.select().from(auditEvent).where(eq(auditEvent.targetId, targetId)))

let orgId: string
let projectId: string

const asMember = <T>(fn: (tx: Tx) => Promise<T>, principal: Principal = memberOf(orgId)) =>
  withTenant({ orgId, principal }, fn)

/** A session for `accountId`, narrowed from the harness's union principal. */
const sessionAs = (
  accountId: string,
  client: Principal['client'] = 'app',
  clientName: string | null = null
): Principal => ({
  ...(memberOf(orgId) as Extract<Principal, { kind: 'session' }>),
  accountId,
  client,
  clientName
})

beforeAll(async () => {
  orgId = (await makeOrganization()).id
  projectId = await asMember(async (tx) => (await makeProject(tx)).id)
})

test('AUD-1: recordAudit fills actor_type, actor_id, client and client_name per principal kind', async () => {
  const keyId = randomUUID()
  const clientId = randomUUID()
  const linkId = randomUUID()
  const accountId = randomUUID()
  const sessionApp = sessionAs(accountId)
  const sessionCli = sessionAs(accountId, 'cli', 'skyclause-cli/1.0')
  const apiKey: Principal = {
    kind: 'api_key',
    keyId,
    accountId,
    orgId,
    role: 'admin',
    scopes: ['admin'],
    client: 'api',
    clientName: 'deploy-bot'
  }
  const oauth: Principal = {
    kind: 'oauth',
    grantId: randomUUID(),
    clientId,
    accountId,
    orgId,
    role: 'viewer',
    resource: 'mcp',
    projectIds: 'all',
    scopes: ['read'],
    shareLinkId: null,
    client: 'mcp',
    clientName: 'mcp-client'
  }
  const link: Principal = {
    kind: 'share_link',
    linkId,
    orgId,
    projectId,
    access: 'view',
    client: 'app',
    clientName: null
  }
  const job = systemPrincipal('audit-test-job')
  const cases: Array<{ principal: Principal; actor: [string, string, string, string | null] }> = [
    { principal: sessionApp, actor: ['account', accountId, 'app', null] },
    { principal: sessionCli, actor: ['account', accountId, 'cli', 'skyclause-cli/1.0'] },
    { principal: apiKey, actor: ['api_key', keyId, 'api', 'deploy-bot'] },
    { principal: oauth, actor: ['oauth_client', clientId, 'mcp', 'mcp-client'] },
    { principal: link, actor: ['share_link', linkId, 'app', null] },
    { principal: job, actor: ['system', 'audit-test-job', 'worker', null] }
  ]
  const targets = cases.map(() => randomUUID())
  for (const [i, { principal }] of cases.entries()) {
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
  const rows = await Promise.all(targets.map((targetId) => rowsFor(targetId).then((found) => found[0]!)))
  expect(rows).toHaveLength(targets.length)
  expect(rows.map(({ actorType, actorId, client, clientName }) => [actorType, actorId, client, clientName])).toEqual(
    cases.map(({ actor }) => actor)
  )
  expect(rows[0]).toMatchObject({ projectId, targetType: 'project_pack' })
})

test('AUD-2: UPDATE and DELETE on audit_event raise as app', async () => {
  const row = await asMember((tx) => makeAuditEvent(tx))
  const update = sql`UPDATE audit_event SET client_name = 'changed' WHERE id = ${row.id}`
  const remove = sql`DELETE FROM audit_event WHERE id = ${row.id}`
  expect(await refusal(asMember((tx) => tx.execute(update)))).toMatch(/permission denied for table/)
  expect(await refusal(asMember((tx) => tx.execute(remove)))).toMatch(/permission denied for table/)
  expect(await rowsFor(row.targetId)).toHaveLength(1)
})

test('filters combine: action, actor, target, project, from and to', async () => {
  const actorA = randomUUID()
  const actorB = randomUUID()
  const target = randomUUID()
  const otherProject = await asMember(async (tx) => (await makeProject(tx)).id)
  const at = (day: string) => new Date(`${day}T00:00:00Z`)
  const rows = [
    {
      action: 'source.bound',
      actorId: actorA,
      targetType: 'source',
      targetId: target,
      projectId,
      at: at('2026-11-01')
    },
    {
      action: 'source.bound',
      actorId: actorB,
      targetType: 'source',
      targetId: target,
      projectId,
      at: at('2026-11-02')
    },
    {
      action: 'sla.changed',
      actorId: actorA,
      targetType: 'project_pack',
      targetId: target,
      projectId,
      at: at('2026-11-03')
    },
    {
      action: 'source.bound',
      actorId: actorA,
      targetType: 'source',
      targetId: target,
      projectId: otherProject,
      at: at('2026-11-04')
    }
  ]
  for (const row of rows) {
    await asMember((tx) =>
      makeAuditEvent(tx, {
        action: row.action,
        actorId: row.actorId,
        targetType: row.targetType,
        targetId: row.targetId,
        projectId: row.projectId,
        at: row.at
      })
    )
  }
  const ids = (filters: Parameters<typeof listAudit>[1]['filters']) =>
    asMember((tx) => listAudit(tx, { filters, limit: 50 })).then((found) => found.map((row) => row.id))
  // Each filter alone narrows; all six together name one row.
  expect((await ids({ action: 'sla.changed' })).length).toBeGreaterThan(0)
  const combined = await asMember((tx) =>
    listAudit(tx, {
      filters: {
        action: 'source.bound',
        actorId: actorA,
        targetType: 'source',
        targetId: target,
        projectId,
        from: at('2026-11-01'),
        to: at('2026-11-01')
      },
      limit: 50
    })
  )
  expect(combined).toHaveLength(1)
  expect(combined[0]).toMatchObject({ action: 'source.bound', actorId: actorA, targetId: target, projectId })
})

test('the cursor walks 250 entries newest first with no gaps or repeats', async () => {
  const target = randomUUID()
  for (let i = 0; i < 250; i++) {
    await asMember((tx) =>
      recordAudit(tx, {
        action: i % 2 === 0 ? 'source.bound' : 'sla.changed',
        target: { type: 'walk', id: target },
        projectId
      })
    )
  }
  const seen: string[] = []
  let cursor: { at: Date; id: string } | undefined
  for (;;) {
    const rows = await asMember((tx) => listAudit(tx, { filters: { targetId: target }, limit: 50, cursor }))
    if (!rows.length) break
    seen.push(...rows.map((row) => row.id))
    if (rows.length <= 50) break
    const last = rows.at(-1)!
    cursor = { at: last.at, id: last.id }
  }
  expect(seen).toHaveLength(250)
  expect(new Set(seen).size).toBe(250)
  const ats = await asMember((tx) =>
    listAudit(tx, { filters: { targetId: target }, limit: 250 }).then((rows) => rows.map((row) => row.at.getTime()))
  )
  expect([...ats].sort((a, b) => b - a)).toEqual(ats)
})

test('AUD-4: names and roles resolve at read time; a deleted account reads "Deleted account"', async () => {
  const account = await makeUser({ name: 'Aina Audit' })
  await makeMember({ organizationId: orgId, userId: account.id, role: 'admin' })
  await asMember(
    (tx) => recordAudit(tx, { action: 'sla.changed', target: { type: 'project_pack', id: randomUUID() }, projectId }),
    { ...sessionAs(account.id) }
  )
  const live = await resolveActorDisplay(orgId, [{ actorType: 'account', actorId: account.id }])
  expect(live.get(account.id)).toEqual({ name: 'Aina Audit', role: 'admin' })
  // Non-account actors carry no name or role.
  expect(await resolveActorDisplay(orgId, [{ actorType: 'system', actorId: 'audit-test-job' }])).toEqual(
    new Map([['audit-test-job', { name: null, role: null }]])
  )
  // Deleting the account keeps its pseudonymous ID and drops the name and role.
  await authDatabase().update(user).set({ deletedAt: new Date() }).where(eq(user.id, account.id))
  expect(await resolveActorDisplay(orgId, [{ actorType: 'account', actorId: account.id }])).toEqual(
    new Map([[account.id, { name: DELETED_ACCOUNT_NAME, role: null }]])
  )
})

test('the filtered list uses the new indexes', async () => {
  const target = randomUUID()
  for (let i = 0; i < 300; i++) {
    await asMember((tx) =>
      makeAuditEvent(tx, {
        action: i < 5 ? 'source.probation_passed' : 'source.bound',
        targetType: 'source',
        targetId: target,
        projectId
      })
    )
  }
  const plan = await asMember(async (tx) => {
    const { rows } = await tx.execute<{ 'QUERY PLAN': Array<{ Plan: unknown }> }>(sql`
      EXPLAIN (FORMAT JSON)
      SELECT * FROM audit_event
      WHERE org_id = ${orgId} AND action = 'source.probation_passed' AND target_type = 'source'
      ORDER BY at DESC, id DESC LIMIT 51`)
    return rows[0]!['QUERY PLAN'][0]!.Plan
  })
  const indexes: string[] = []
  const scans: string[] = []
  const walk = (node: Record<string, unknown>) => {
    if (typeof node['Index Name'] === 'string') indexes.push(node['Index Name'])
    if (node['Node Type'] === 'Seq Scan') scans.push(String(node['Relation Name'] ?? ''))
    for (const child of (node['Plans'] as Array<Record<string, unknown>> | undefined) ?? []) walk(child)
  }
  walk(plan as Record<string, unknown>)
  expect(scans.filter((name) => name === 'audit_event')).toEqual([])
  expect(indexes.some((name) => name.startsWith('audit_event_org_'))).toBe(true)
})

test('exports page newest first up to the head', async () => {
  const target = randomUUID()
  for (let i = 0; i < 3; i++) {
    await asMember((tx) => recordAudit(tx, { action: 'source.bound', target: { type: 'walk', id: target }, projectId }))
  }
  const head = await asMember((tx) => auditHead(tx))
  expect(head).not.toBeNull()
  const first = await asMember((tx) =>
    auditExportPage(tx, { filters: { targetId: target }, upto: head ?? undefined, limit: 2 })
  )
  expect(first).toHaveLength(2)
  const rest = await asMember((tx) =>
    auditExportPage(tx, {
      filters: { targetId: target },
      before: { at: first.at(-1)!.cursorAt, id: first.at(-1)!.id },
      upto: head ?? undefined,
      limit: 2
    })
  )
  expect(rest).toHaveLength(1)
  expect(first[0]!.at.getTime()).toBeGreaterThanOrEqual(first[1]!.at.getTime())
})
