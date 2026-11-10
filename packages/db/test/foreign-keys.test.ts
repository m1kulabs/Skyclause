// TRD tenancy: foreign keys between T tables are composite (`org_id`, `<x>_id`), so a child row can't point into
// another organisation. Read from the live catalogue, so a later migration's keys join the test without edits.
import { expect, test } from 'vitest'
import { withTenant } from '../src'
import { makeMember, makeOrganization, makeOwnershipTransfer, tenantFactories } from './factories'
import { asLogin, memberOf, refusal, tenantTables } from './harness'

interface Key {
  name: string
  child: string
  parent: string
  columns: string[]
  parentColumns: string[]
}

async function foreignKeys(): Promise<Key[]> {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query<Key>(`
      SELECT con.conname AS name, child.relname AS child, parent.relname AS parent,
        array_agg(a.attname::text ORDER BY k.ord) AS columns, array_agg(pa.attname::text ORDER BY k.ord) AS "parentColumns"
      FROM pg_constraint con
      JOIN pg_class child ON child.oid = con.conrelid
      JOIN pg_class parent ON parent.oid = con.confrelid
      CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(col, ref, ord)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.col
      JOIN pg_attribute pa ON pa.attrelid = con.confrelid AND pa.attnum = k.ref
      WHERE con.contype = 'f' AND child.relnamespace = 'public'::regnamespace AND con.conparentid = 0
      GROUP BY con.conname, child.relname, parent.relname
      ORDER BY 1`)
    return rows
  })
}

const between = async (keys: Key[]) => {
  const tenant = new Set(await tenantTables())
  return keys.filter((key) => tenant.has(key.child) && tenant.has(key.parent))
}

test('every foreign key from one T table to another is composite on (org_id, id)', async () => {
  const keys = await between(await foreignKeys())
  expect(keys.length).toBeGreaterThan(60)
  const plain = keys.filter(
    ({ columns, parentColumns }) => columns[0] !== 'org_id' || parentColumns.join() !== 'org_id,id'
  )
  expect(plain).toEqual([])
}, 15_000)

test('a child row pointing at another organisation’s parent fails on its composite foreign key', async () => {
  const keys = await between(await foreignKeys())
  const [a, b] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const make = (orgId: string, table: string) => {
    const factory = tenantFactories[table]
    if (!factory) throw new Error(`no factory for ${table}`)
    return withTenant({ orgId, principal: memberOf(orgId) }, factory) as Promise<{ id: string }>
  }
  const failures: Record<string, string> = {}
  for (const key of keys) {
    const child = await make(a, key.child)
    const parent = await make(b, key.parent)
    // As the superuser (no RLS), in a transaction rolled back after, with the append-only triggers off and the CHECK
    // constraints dropped (one-target rules), so only the foreign key can refuse the change.
    failures[key.name] = await asLogin('postgres', async (client) => {
      await client.query('BEGIN')
      try {
        await client.query(`ALTER TABLE "${key.child}" DISABLE TRIGGER USER`)
        const { rows: checks } = await client.query<{ name: string }>(
          "SELECT conname AS name FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'",
          [key.child]
        )
        for (const { name } of checks) await client.query(`ALTER TABLE "${key.child}" DROP CONSTRAINT "${name}"`)
        await client.query(`UPDATE "${key.child}" SET "${key.columns[1]}" = $1 WHERE id = $2`, [parent.id, child.id])
        return 'accepted'
      } catch (error) {
        const { code, constraint } = error as { code?: string; constraint?: string }
        return `${code} ${constraint}`
      } finally {
        await client.query('ROLLBACK')
      }
    })
  }
  expect(failures).toEqual(Object.fromEntries(keys.map(({ name }) => [name, `23503 ${name}`])))
}, 120_000)

test('an ownership transfer can name only members of its own organisation', async () => {
  const [a, b] = [(await makeOrganization()).id, (await makeOrganization()).id]
  const outsider = await makeMember({ organizationId: b })
  const transfer = (overrides: { fromMemberId?: string; toMemberId?: string }) =>
    withTenant({ orgId: a, principal: memberOf(a) }, (tx) => makeOwnershipTransfer(tx, overrides))
  expect(await refusal(transfer({ toMemberId: outsider.id }))).toMatch(/ownership_transfer_to_member_fk/)
  expect(await refusal(transfer({ fromMemberId: outsider.id }))).toMatch(/ownership_transfer_from_member_fk/)
  await expect(transfer({})).resolves.toMatchObject({ orgId: a })
})
