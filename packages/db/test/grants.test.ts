import { expect, test } from 'vitest'
import { authDatabase } from '../src/auth'
import { organization } from '../src/schema'
import { makeMember, makeOrganization } from './factories'
import { asLogin, refusal } from './harness'

const authTables = () =>
  asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string }>(
      "SELECT relname AS name FROM pg_class WHERE relnamespace = 'auth'::regnamespace AND relkind = 'r' ORDER BY 1"
    )
    return rows.map(({ name }) => name)
  })

test('auth_app reaches the auth schema and no public table', async () => {
  const org = await makeOrganization()
  await makeMember({ organizationId: org.id })
  expect(await authDatabase().select({ id: organization.id }).from(organization)).toContainEqual({ id: org.id })
  await asLogin('auth_app', async (client) => {
    for (const table of ['project', 'project_pack', 'feature_flag', 'public_project'])
      expect(await refusal(client.query(`SELECT FROM public.${table}`)), table).toMatch(
        /permission denied for schema public/
      )
  })
})

test('app reads organisations, members and users, and can write no auth table', async () => {
  const tables = await authTables()
  expect(tables).toHaveLength(18)
  await asLogin('app', async (client) => {
    for (const table of ['organization', 'member', 'user']) await client.query(`SELECT FROM auth."${table}"`)
    for (const table of tables)
      for (const statement of [
        `INSERT INTO auth."${table}" DEFAULT VALUES`,
        `UPDATE auth."${table}" SET id = id WHERE false`,
        `DELETE FROM auth."${table}" WHERE false`
      ])
        expect(await refusal(client.query(statement)), statement).toMatch(/permission denied for table/)
  })
})

test('auth_app gets an auth table a later migration adds, through owner’s default privileges', async () => {
  await asLogin('migrator', async (client) => {
    await client.query('SET ROLE "owner"')
    await client.query('CREATE TABLE auth.later_probe (id uuid PRIMARY KEY DEFAULT uuidv7())')
  })
  await asLogin('auth_app', async (client) => {
    await client.query('INSERT INTO auth.later_probe DEFAULT VALUES')
    expect((await client.query('DELETE FROM auth.later_probe')).rowCount).toBe(1)
  })
})
