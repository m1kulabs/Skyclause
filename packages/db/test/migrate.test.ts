import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { migrate } from '../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder } from '../scripts/local'
import { asLogin, migrationsWith } from './harness'

/** The repository's migrations, in order, from drizzle-kit's journal. */
const tags = (
  JSON.parse(readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> }
).entries.map(({ tag }) => tag)

const created: string[] = []
afterEach(async () => {
  for (const name of created.splice(0)) await dropDatabase(name)
}, 60_000)

async function emptyDatabase() {
  const name = `${process.env.SKYCLAUSE_TEST_DATABASE}_m${created.length}`
  await createDatabase(name)
  created.push(name)
  return name
}

/** Everything a migration could change that these migrations make: relations, columns, policies, grants, triggers. */
async function catalogue(database: string) {
  return asLogin(
    'postgres',
    async (client) => {
      const { rows } = await client.query(`
        SELECT 'relation' AS kind, n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' ' || pg_get_userbyid(c.relowner)
          || ' ' || c.relrowsecurity::text || c.relforcerowsecurity::text || ' ' || coalesce(c.relacl::text, '') AS item
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'auth', 'drizzle')
        UNION ALL SELECT 'column', table_schema || '.' || table_name || '.' || column_name || ' ' || data_type || ' '
          || coalesce(column_default, '') FROM information_schema.columns WHERE table_schema IN ('public', 'auth')
        UNION ALL SELECT 'policy', tablename || '.' || policyname || ' ' || roles::text || ' ' || coalesce(qual, '')
          FROM pg_policies
        UNION ALL SELECT 'trigger', tgrelid::regclass || '.' || tgname FROM pg_trigger WHERE NOT tgisinternal
        UNION ALL SELECT 'migration', hash FROM drizzle.__drizzle_migrations
        ORDER BY 1, 2`)
      return rows
    },
    database
  )
}

test('an empty database migrates, and a second run changes nothing', async () => {
  const database = await emptyDatabase()
  const url = localUrl('migrator', database)

  expect(tags.slice(0, 3)).toEqual(['0000_f-db-roles', '0001_f-db-tables', '0002_f-db-security'])
  expect(await migrate(url, migrationsFolder)).toEqual(tags)
  const after = await catalogue(database)
  expect(await migrate(url, migrationsFolder)).toEqual([])
  expect(await catalogue(database)).toEqual(after)
}, 120_000)

test('owner owns every table, view, type, function and schema the migrations create', async () => {
  const owners = await asLogin('postgres', async (client) => {
    const { rows } = await client.query(`
      SELECT n.nspname || '.' || c.relname AS name, pg_get_userbyid(c.relowner) AS owner
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public', 'auth')
      UNION ALL SELECT 'type ' || typname, pg_get_userbyid(typowner) FROM pg_type
        WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'
      UNION ALL SELECT 'function ' || proname, pg_get_userbyid(proowner) FROM pg_proc
        WHERE pronamespace = 'public'::regnamespace
      UNION ALL SELECT 'schema auth', pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'auth'`)
    return rows as Array<{ name: string; owner: string }>
  })
  expect(owners.length).toBeGreaterThan(40)
  expect(owners.filter(({ owner }) => owner !== 'owner')).toEqual([])
}, 120_000)

test('a failing migration rolls back and leaves no record, so the next run applies it once fixed', async () => {
  const database = await emptyDatabase()
  const url = localUrl('migrator', database)
  const broken = migrationsWith('9000_test-broken', 'CREATE TABLE half_done (id int);\nSELECT 1 / 0;\n')
  await expect(migrate(url, broken)).rejects.toThrow(/division by zero/)

  const state = () =>
    asLogin(
      'postgres',
      async (client) => ({
        recorded: Number((await client.query('SELECT count(*) AS n FROM drizzle.__drizzle_migrations')).rows[0].n),
        table: (await client.query("SELECT to_regclass('half_done') AS t")).rows[0].t
      }),
      database
    )
  expect(await state()).toEqual({ recorded: tags.length, table: null })

  const fixed = migrationsWith('9000_test-fixed', 'CREATE TABLE half_done (id int);\n')
  expect(await migrate(url, fixed)).toEqual(['9000_test-fixed'])
  expect(await state()).toEqual({ recorded: tags.length + 1, table: 'half_done' })
}, 120_000)
