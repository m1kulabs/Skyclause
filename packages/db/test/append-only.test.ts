import { sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import { withRetention, withSystem, withTenant } from '../src'
import { makeOrganization } from './factories'
import { asLogin, memberOf, refusal } from './harness'

let orgId: string

// Test tables shaped like TRD's append-only ones: a plain T table and a monthly-partitioned one, as #92 makes them.
beforeAll(async () => {
  orgId = (await makeOrganization()).id
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query(`
      CREATE TABLE ledger_probe (id uuid PRIMARY KEY DEFAULT uuidv7(), org_id uuid NOT NULL, body text NOT NULL);
      SELECT tenant_table('ledger_probe');
      SELECT attach_append_only('ledger_probe');
      CREATE TABLE reading_probe (org_id uuid NOT NULL, observed_at timestamptz NOT NULL, body text NOT NULL)
        PARTITION BY RANGE (observed_at);
      CREATE TABLE reading_probe_2026_11 PARTITION OF reading_probe
        FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
      SELECT tenant_table('reading_probe');
      SELECT attach_append_only('reading_probe');`)
  })
  await withTenant({ orgId, principal: memberOf(orgId) }, async (tx) => {
    await tx.execute(sql`INSERT INTO ledger_probe (org_id, body) VALUES (${orgId}, 'first'), (${orgId}, 'second')`)
    await tx.execute(
      sql`INSERT INTO reading_probe VALUES (${orgId}, '2026-11-08T03:00:00Z', 'a'), (${orgId}, '2026-11-08T03:05:00Z', 'b')`
    )
  })
})

const asApp = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ orgId, principal: memberOf(orgId) }, fn)
const asSystem = <T>(fn: Parameters<typeof withTenant<T>>[1]) =>
  withSystem('test-sweep', (tx) => withTenant({ orgId, principal: tx.principal }, fn))

test.each([
  ['app', asApp],
  ['system', asSystem]
])('UPDATE and DELETE fail as %s', async (_name, as) => {
  for (const table of ['ledger_probe', 'reading_probe']) {
    expect(await refusal(as((tx) => tx.execute(sql`UPDATE ${sql.identifier(table)} SET body = 'changed'`)))).toMatch(
      /permission denied for table/
    )
    expect(await refusal(as((tx) => tx.execute(sql`DELETE FROM ${sql.identifier(table)}`)))).toMatch(
      /permission denied for table/
    )
  }
})

test('the trigger refuses even the owner, on the table and straight on a partition', async () => {
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query("SELECT set_config('app.org_id', $1, false)", [orgId])
    for (const statement of [
      "UPDATE ledger_probe SET body = 'changed'",
      'DELETE FROM ledger_probe',
      'DELETE FROM reading_probe_2026_11',
      'TRUNCATE ledger_probe'
    ])
      expect(await refusal(client.query(statement)), statement).toMatch(/is refused: the table is append-only/)
  })
})

test('UPDATE and DELETE succeed as retention', async () => {
  const changed = await withRetention('test-sweep', async (tx) => ({
    updated: (await tx.execute(sql`UPDATE ledger_probe SET body = 'pseudonymised' WHERE body = 'first'`)).rowCount,
    deleted: (await tx.execute(sql`DELETE FROM ledger_probe WHERE body = 'second'`)).rowCount,
    swept: (await tx.execute(sql`DELETE FROM reading_probe WHERE observed_at < '2026-11-08T03:03:00Z'`)).rowCount
  }))
  expect(changed).toEqual({ updated: 1, deleted: 1, swept: 1 })
  const left = await asApp(async (tx) => ({
    ledger: (await tx.execute(sql`SELECT body FROM ledger_probe`)).rows,
    readings: (await tx.execute(sql`SELECT body FROM reading_probe`)).rows
  }))
  expect(left).toEqual({ ledger: [{ body: 'pseudonymised' }], readings: [{ body: 'b' }] })
})
