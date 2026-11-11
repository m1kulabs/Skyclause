// #79 §3's append-only set over the real tables (append-only.test.ts proves the trigger itself on probe tables).
import type { Principal } from '@skyclause/contracts'
import { sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { withRetention, withTenant, type Tx } from '../src'
import { makeDomainEvent, makeOrganization, sharedFactories, tenantFactories } from './factories'
import { asLogin, memberOf, refusal } from './harness'

/** TRD's eleven and the ten #79 §3 adds, plus e-byok-api's test attempts; the PR body lists the same set. */
const APPEND_ONLY = [
  'ai_key_test',
  'ai_usage',
  'analytics_event',
  'approval',
  'audit_event',
  'bundle_alert',
  'component_check',
  'consent_record',
  'crossing',
  'crowd_reply',
  'forecast',
  'evaluator_source_transition',
  'grade',
  'incident_update',
  'indicator_snapshot',
  'ledger_entry',
  'plan_feedback',
  'poll',
  'probation_label',
  'probation_resolution',
  'reading',
  'shift_reminder',
  'webhook_delivery'
]

let orgId: string
const system: Principal = { kind: 'system', job: 'test-append-only', client: 'worker', clientName: null }
const asApp = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const asSystem = <T>(fn: (tx: Tx) => Promise<T>) => withTenant({ orgId, principal: system }, fn)

beforeAll(async () => {
  orgId = (await makeOrganization()).id
})

test('the tables carrying the append-only trigger are #79 §3’s set, and domain_event for DELETE', async () => {
  const tables = await asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string }>(`
      SELECT tgrelid::regclass::text AS name FROM pg_trigger
      WHERE tgname = 'append_only' AND tgparentid = 0 AND NOT tgisinternal ORDER BY 1`)
    return rows.map(({ name }) => name)
  })
  expect(tables).toEqual([...APPEND_ONLY, 'domain_event'].sort())
}, 15_000)

test.each(APPEND_ONLY)('%s: UPDATE and DELETE fail as app and system and succeed as retention', async (table) => {
  const make = tenantFactories[table] ? asApp(tenantFactories[table]) : asSystem(sharedFactories[table]!)
  const { id } = (await make) as { id: string }
  const update = sql`UPDATE ${sql.identifier(table)} SET id = id WHERE id = ${id}`
  const remove = sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${id}`
  for (const as of [asApp, asSystem]) {
    expect(await refusal(as((tx) => tx.execute(update)))).toMatch(/permission denied for table/)
    expect(await refusal(as((tx) => tx.execute(remove)))).toMatch(/permission denied for table/)
  }
  const changed = await withRetention('test-sweep', async (tx) => ({
    updated: (await tx.execute(update)).rowCount,
    deleted: (await tx.execute(remove)).rowCount
  }))
  expect(changed).toEqual({ updated: 1, deleted: 1 })
})

test('domain_event: only published_at changes, and only retention deletes', async () => {
  const event = await asApp((tx) => makeDomainEvent(tx))
  const where = sql`WHERE id = ${event.id}`
  for (const as of [asApp, asSystem]) {
    expect(await refusal(as((tx) => tx.execute(sql`UPDATE domain_event SET type = 'call.sent' ${where}`)))).toMatch(
      /permission denied for table domain_event/
    )
    expect(await refusal(as((tx) => tx.execute(sql`DELETE FROM domain_event ${where}`)))).toMatch(
      /permission denied for table domain_event/
    )
    const marked = await as((tx) => tx.execute(sql`UPDATE domain_event SET published_at = now() ${where}`))
    expect(marked.rowCount).toBe(1)
  }
  // The trigger holds even a role with every grant.
  expect(
    await asLogin('postgres', (client) =>
      refusal(client.query(`UPDATE domain_event SET seq = 99 WHERE id = $1`, [event.id]))
    )
  ).toMatch(/may change only published_at/)
  const deleted = await withRetention('test-sweep', (tx) => tx.execute(sql`DELETE FROM domain_event ${where}`))
  expect(deleted.rowCount).toBe(1)
})
