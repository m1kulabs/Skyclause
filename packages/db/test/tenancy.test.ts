import type { Principal } from '@skyclause/contracts'
import { sql } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { project, projectPack, publicProject, publicProjectPack } from '../src/schema'
import { withPublicReader, withRetention, withSystem, withTenant, type Tx } from '../src'
import { makeOrganization, makeProject, makeProjectPack, tenantFactories } from './factories'
import { asLogin, memberOf, refusal, tenantTables } from './harness'

const count = async (tx: Tx<Principal | null>, table: string, where = sql`true`) =>
  Number(
    (await tx.execute<{ n: string }>(sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE ${where}`)).rows[0]!.n
  )

async function twoOrganisations() {
  return [(await makeOrganization()).id, (await makeOrganization()).id] as const
}

test('as organisation A, withTenant reads none of B’s rows in any T table, and its own', async () => {
  const tables = await tenantTables()
  // A T table without a factory fails here, so #92's tables join this test.
  expect(Object.keys(tenantFactories).sort()).toEqual(tables)
  const [a, b] = await twoOrganisations()
  for (const make of Object.values(tenantFactories)) {
    await withTenant({ orgId: a, principal: memberOf(a) }, make)
    await withTenant({ orgId: b, principal: memberOf(b) }, make)
  }
  for (const table of tables) {
    const seen = await withTenant({ orgId: a, principal: memberOf(a) }, async (tx) => ({
      own: (await count(tx, table)) > 0,
      others: await count(tx, table, sql`org_id <> ${a}`)
    }))
    expect({ table, ...seen }).toEqual({ table, own: true, others: 0 })
  }
})

test('a transaction without app.org_id reads 0 rows, never all, even on a connection that set it before', async () => {
  const [a] = await twoOrganisations()
  await withTenant({ orgId: a, principal: memberOf(a) }, makeProjectPack)
  const tables = await tenantTables()
  await asLogin('app', async (client) => {
    const counts = async () => {
      const result: Record<string, number> = {}
      for (const table of tables)
        result[table] = Number((await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n)
      return result
    }
    const none = Object.fromEntries(tables.map((table) => [table, 0]))
    expect(await counts()).toEqual(none)
    // After a SET LOCAL ends, the setting reads '' on this connection rather than being undefined.
    await client.query('BEGIN')
    await client.query("SELECT set_config('app.org_id', $1, true)", [a])
    await client.query('COMMIT')
    expect((await client.query("SELECT current_setting('app.org_id', true) AS v")).rows[0].v).toBe('')
    expect(await counts()).toEqual(none)
  })
})

test('FORCE holds the owner and migrator to the policies too', async () => {
  const [a] = await twoOrganisations()
  await withTenant({ orgId: a, principal: memberOf(a) }, makeProject)
  const total = await asLogin('postgres', async (client) =>
    Number((await client.query('SELECT count(*) AS n FROM project')).rows[0].n)
  )
  expect(total).toBeGreaterThan(0)
  await asLogin('migrator', async (client) => {
    expect(Number((await client.query('SELECT count(*) AS n FROM project')).rows[0].n)).toBe(0)
    await client.query('SET ROLE "owner"')
    expect(Number((await client.query('SELECT count(*) AS n FROM project WHERE NOT public')).rows[0].n)).toBe(0)
  })
})

test('withSystem lists projects across organisations and reads no T-only rows until it calls withTenant', async () => {
  const [a, b] = await twoOrganisations()
  const packA = await withTenant({ orgId: a, principal: memberOf(a) }, makeProjectPack)
  const packB = await withTenant({ orgId: b, principal: memberOf(b) }, makeProjectPack)
  // A T table with no system_read policy: a table only tenant_table() secures, as #92's will be.
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query('CREATE TABLE tenant_probe (id uuid PRIMARY KEY DEFAULT uuidv7(), org_id uuid NOT NULL)')
    await client.query("SELECT tenant_table('tenant_probe')")
  })
  for (const orgId of [a, b])
    await withTenant({ orgId, principal: memberOf(orgId) }, (tx) =>
      tx.execute(sql`INSERT INTO tenant_probe (org_id) VALUES (${orgId})`)
    )

  const seen = await withSystem('test-batch', async (tx) => {
    const projects = await tx.select({ id: project.id, orgId: project.orgId }).from(project)
    const packs = await tx.select({ id: projectPack.id }).from(projectPack)
    const probes = await count(tx, 'tenant_probe')
    const perOrg: Record<string, number> = {}
    for (const orgId of [a, b])
      perOrg[orgId] = await withTenant({ orgId, principal: tx.principal }, async (inner) => {
        // Scoped again: the system login sees only this organisation's projects inside withTenant.
        expect(await count(inner, 'project', sql`org_id <> ${orgId}`)).toBe(0)
        return count(inner, 'tenant_probe')
      })
    return { projects, packs, probes, perOrg }
  })
  expect(seen.projects).toEqual(
    expect.arrayContaining([
      { id: packA.projectId, orgId: a },
      { id: packB.projectId, orgId: b }
    ])
  )
  expect(seen.packs.map(({ id }) => id)).toEqual(expect.arrayContaining([packA.id, packB.id]))
  expect(seen.probes).toBe(0)
  expect(seen.perOrg).toEqual({ [a]: 1, [b]: 1 })
})

test('withSystem reads projects read-only', async () => {
  const [a] = await twoOrganisations()
  const made = await withTenant({ orgId: a, principal: memberOf(a) }, makeProject)
  expect(
    await refusal(
      withSystem('test-batch', (tx) => tx.insert(project).values({ orgId: a, slug: 'x', name: 'x', timeZone: 'UTC' }))
    )
  ).toMatch(/violates row-level security policy/)
  const updated = await withSystem('test-batch', (tx) =>
    tx
      .update(project)
      .set({ name: 'renamed' })
      .where(sql`id = ${made.id}`)
      .returning()
  )
  expect(updated).toEqual([])
})

test('withPublicReader sees public projects through the public views and no base table', async () => {
  const [a, b] = await twoOrganisations()
  const shown = await withTenant({ orgId: a, principal: memberOf(a) }, async (tx) => {
    const visible = await makeProject(tx, { public: true })
    await makeProjectPack(tx, { projectId: visible.id })
    await makeProjectPack(tx)
    return visible
  })
  await withTenant({ orgId: b, principal: memberOf(b) }, makeProjectPack)

  const seen = await withPublicReader(async (tx) => ({
    projects: await tx.select({ id: publicProject.id, orgId: publicProject.orgId }).from(publicProject),
    packs: await tx.select({ projectId: publicProjectPack.projectId }).from(publicProjectPack)
  }))
  const ours = (row: { orgId: string }) => row.orgId === a || row.orgId === b
  expect(seen.projects.filter(ours)).toEqual([{ id: shown.id, orgId: a }])
  expect(seen.packs.filter(({ projectId }) => projectId === shown.id)).toHaveLength(1)

  for (const table of await tenantTables()) {
    expect(await refusal(withPublicReader((tx) => count(tx, table))), table).toMatch(/permission denied for table/)
  }
})

test('withRetention sees every organisation’s rows', async () => {
  const [a, b] = await twoOrganisations()
  await withTenant({ orgId: a, principal: memberOf(a) }, makeProject)
  await withTenant({ orgId: b, principal: memberOf(b) }, makeProject)
  const seen = await withRetention('test-sweep', (tx) => count(tx, 'project', sql`org_id IN (${a}, ${b})`))
  expect(seen).toBe(2)
})
