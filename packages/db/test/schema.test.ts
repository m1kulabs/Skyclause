// Meta-tests over the live, migrated catalogue, so tables later migrations add (#92) join them without edits here.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { asLogin } from './harness'

// Partitions are left out: queries through the parent use its policies, and no role but owner has a grant on a partition.
test('every table with org_id has RLS enabled and forced and a policy on current_org_id()', async () => {
  const tables = await asLogin('postgres', async (client) => {
    const { rows } = await client.query(`
      SELECT n.nspname || '.' || c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
        EXISTS (SELECT FROM pg_policy p WHERE p.polrelid = c.oid
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%current_org_id()%') AS policy
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped)
      ORDER BY 1`)
    return rows as Array<{ name: string; enabled: boolean; forced: boolean; policy: boolean }>
  })
  expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['public.project', 'public.project_pack']))
  expect(tables.filter(({ enabled, forced, policy }) => !(enabled && forced && policy))).toEqual([])
})

test('every id column defaults to uuidv7()', async () => {
  const columns = await asLogin('postgres', async (client) => {
    const { rows } = await client.query(`
      SELECT c.table_schema || '.' || c.table_name AS name, c.column_default AS "default"
      FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema IN ('public', 'auth') AND c.column_name = 'id' AND t.table_type = 'BASE TABLE'
      ORDER BY 1`)
    return rows as Array<{ name: string; default: string | null }>
  })
  expect(columns.length).toBeGreaterThanOrEqual(21)
  expect(columns.filter((column) => column.default !== 'uuidv7()')).toEqual([])
  const version = await asLogin('postgres', (client) => client.query('SELECT uuid_extract_version(uuidv7()) AS v'))
  expect(version.rows[0].v).toBe(7)
})

test('the image has pg_partman, which migrator can create as on Neon, and no pg_cron (D45)', async () => {
  await asLogin('migrator', async (client) => {
    await client.query('CREATE SCHEMA partman')
    await client.query('CREATE EXTENSION pg_partman SCHEMA partman')
    const { rows } = await client.query("SELECT extversion FROM pg_extension WHERE extname = 'pg_partman'")
    expect(rows).toHaveLength(1)
    const cron = await client.query("SELECT FROM pg_available_extensions WHERE name = 'pg_cron'")
    expect(cron.rowCount).toBe(0)
  })
})

test('the committed auth schema is the Better Auth CLI output for the ticket’s plugin set', () => {
  const script = fileURLToPath(new URL('../scripts/generate-auth.ts', import.meta.url))
  const result = spawnSync('bun', [script, '--check'], { encoding: 'utf8' })
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
}, 60_000)
