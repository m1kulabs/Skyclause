// TRD partitions: pg_partman monthly on poll.started_at and reading.observed_at, premake 3, a default partition, and
// maintenance the worker's batch runs (no pg_cron, D45).
import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { withSystem, withTenant } from '../src'
import { makeOrganization, makeReading } from './factories'
import { asLogin, memberOf } from './harness'

const partitions = (table: string) =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string; owner: string }>(
      `SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = $1::regclass ORDER BY 1`,
      [table]
    )
    return rows
  })

/** `<table>_pYYYYMMDD` for the first of the month `offset` months from now (UTC). */
function monthly(table: string, offset: number) {
  const now = new Date()
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return `${table}_p${first.toISOString().slice(0, 10).replaceAll('-', '')}`
}

test.each(['poll', 'reading'])(
  '%s has partitions for this month plus three, and a default, all owner’s',
  async (table) => {
    const found = await partitions(table)
    expect(found.map(({ name }) => name)).toEqual(
      expect.arrayContaining([0, 1, 2, 3].map((offset) => monthly(table, offset)).concat(`${table}_default`))
    )
    expect(found.filter(({ owner }) => owner !== 'owner')).toEqual([])
  }
)

test('a far-future reading lands in the default partition', async () => {
  const orgId = (await makeOrganization()).id
  const row = await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
    makeReading(tx, { observedAt: new Date('2036-01-01T00:00:00Z') })
  )
  const where = await asLogin('postgres', async (client) => {
    const { rows } = await client.query('SELECT tableoid::regclass::text AS partition FROM reading WHERE id = $1', [
      row.id
    ])
    return rows[0]?.partition
  })
  expect(where).toBe('reading_default')
})

test('partition_maintenance(), as system, makes a missing future partition again', async () => {
  const furthest = monthly('reading', 3)
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query(`DROP TABLE ${furthest}`)
  })
  expect((await partitions('reading')).map(({ name }) => name)).not.toContain(furthest)
  await withSystem('test-batch', (tx) => tx.execute(sql`SELECT partition_maintenance()`))
  expect(await partitions('reading')).toContainEqual({ name: furthest, owner: 'owner' })
})
