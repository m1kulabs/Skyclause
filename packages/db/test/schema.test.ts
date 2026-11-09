// Meta-tests over the live, migrated catalogue, so tables later migrations add (#92) join them without edits here.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/pg-core'
import { expect, test } from 'vitest'
import {
  BundleState,
  CallState,
  InputState,
  Mode,
  NOTIFICATION_KINDS,
  Pack,
  RunTrigger,
  SourceKind,
  SourceRole
} from '@skyclause/contracts'
import { migrationsFolder } from '../scripts/local'
import {
  bundleState,
  callState,
  inputState,
  mode,
  notificationKind,
  pack,
  runTrigger,
  sourceKind,
  sourceRole
} from '../src/schema'
import { poll, reading } from '../src/schema/partitioned'
import { sharedFactories, tenantFactories } from './factories'
import { asLogin, refusal } from './harness'

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

test('the migrations create pg_partman as migrator, as on Neon, and the image has no pg_cron (D45)', async () => {
  await asLogin('postgres', async (client) => {
    const { rows } = await client.query(
      "SELECT pg_get_userbyid(extowner) AS owner, extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname = 'pg_partman'"
    )
    expect(rows).toEqual([{ owner: 'migrator', schema: 'partman' }])
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

test('drizzle-kit generate against the committed schema yields no migration', () => {
  const pkg = fileURLToPath(new URL('..', import.meta.url))
  const out = mkdtempSync(join(tmpdir(), 'skyclause-generate-'))
  try {
    cpSync(migrationsFolder, out, { recursive: true })
    // drizzle-kit reads --out relative to its working directory.
    const args = ['--dialect', 'postgresql', '--schema', './src/schema/index.ts', '--out', relative(pkg, out)]
    const result = spawnSync('bunx', ['drizzle-kit', 'generate', ...args], { cwd: pkg, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('No schema changes')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}, 60_000)

test.each([
  ['poll', poll],
  ['reading', reading]
])(
  'the Drizzle definition of %s, which migration 0004 makes by hand, matches its live columns',
  async (name, table) => {
    const declared = getTableConfig(table).columns.map((column) => ({
      name: column.name,
      type: column.getSQLType(),
      notNull: column.notNull,
      hasDefault: column.hasDefault
    }))
    const live = await asLogin('postgres', async (client) => {
      const { rows } = await client.query(
        `SELECT column_name AS name, data_type AS type, is_nullable = 'NO' AS "notNull",
        column_default IS NOT NULL AS "hasDefault"
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [name]
      )
      return rows
    })
    expect(declared).toEqual(live)
  }
)

test('every table in public has a factory', async () => {
  const tables = await asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string }>(`
      SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
        AND NOT relispartition ORDER BY 1`)
    return rows.map(({ name }) => name)
  })
  expect(Object.keys({ ...tenantFactories, ...sharedFactories }).sort()).toEqual(tables)
})

// #79 §3: G is read-only to app and public_reader; S is system and retention only.
const G = ['component_check', 'feature_flag', 'guest_block', 'incident', 'incident_update', 'verification']
const S = [
  'analytics_event',
  'audit_finding',
  'event_counter',
  'export_job',
  'guest_budget',
  'handled_event',
  'idempotency_key',
  'rate_limit'
]

test('app and public_reader read G tables and write none; neither reaches an S table', async () => {
  const privileges = await asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ role: string; table: string; privilege: string }>(
      `SELECT r AS role, t AS table, p AS privilege FROM unnest($1::text[]) AS t,
        unnest(ARRAY['app', 'public_reader']) AS r, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS p
      WHERE has_table_privilege(r, t, p) ORDER BY 1, 2, 3`,
      [[...G, ...S]]
    )
    return rows.map(({ role, table, privilege }) => `${role} ${privilege} ${table}`)
  })
  expect(privileges).toEqual(
    G.flatMap((table) => [`app SELECT ${table}`])
      .concat(G.map((t) => `public_reader SELECT ${t}`))
      .sort()
  )
})

test('the schema’s enums hold the same values as the f-contracts sets they store', () => {
  expect({
    pack: pack.enumValues,
    sourceKind: sourceKind.enumValues,
    sourceRole: sourceRole.enumValues,
    inputState: inputState.enumValues,
    mode: mode.enumValues,
    runTrigger: runTrigger.enumValues,
    callState: callState.enumValues,
    bundleState: bundleState.enumValues,
    notificationKind: notificationKind.enumValues
  }).toEqual({
    pack: Pack.options,
    sourceKind: SourceKind.options,
    sourceRole: SourceRole.options,
    inputState: InputState.options,
    mode: Mode.options,
    runTrigger: RunTrigger.options,
    callState: CallState.options,
    bundleState: BundleState.options,
    notificationKind: [...NOTIFICATION_KINDS]
  })
})

test('auth.organization accepts only #79 §3’s plans', async () => {
  expect(
    await asLogin('auth_app', (client) =>
      refusal(
        client.query(
          "INSERT INTO auth.organization (name, slug, created_at, plan) VALUES ('x', 'plan-probe', now(), 'enterprise')"
        )
      )
    )
  ).toMatch(/organization_plan_check/)
})
