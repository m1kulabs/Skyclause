import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { migrate } from '../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder } from '../scripts/local'
import { asLogin, migrationsWith, refusal } from './harness'

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

// #608: a login's temporary table or view replaces a table that a SECURITY DEFINER function reads without a schema, such
// as next_event_seq() reading `project`, and runs the login's code as `owner`; pg_partman 5.1.0 also puts pg_temp in its
// functions' search path. A database's TEMPORARY privilege is granted to PUBLIC, and CREATE DATABASE ... TEMPLATE drops
// it, so this needs a database `migrate()` built itself, not the harness's clone.
test('only owner can create temporary objects, and partition_maintenance() still runs as system', async () => {
  const database = await emptyDatabase()
  await migrate(localUrl('migrator', database), migrationsFolder)

  const logins = ['system', 'app', 'auth_app', 'retention'] as const
  const allowed = await asLogin(
    'postgres',
    async (client) => {
      const { rows } = await client.query<{ rolname: string; allowed: boolean }>(
        "SELECT rolname, has_database_privilege(rolname, current_database(), 'TEMPORARY') AS allowed FROM pg_roles WHERE rolname = ANY($1)",
        [[...logins, 'public_reader', 'owner']]
      )
      return Object.fromEntries(rows.map(({ rolname, allowed }) => [rolname, allowed]))
    },
    database
  )
  expect(allowed).toEqual({
    system: false,
    app: false,
    auth_app: false,
    retention: false,
    public_reader: false,
    owner: true
  })

  // A temporary table, and a temporary view named like a table that next_event_seq() reads without a schema.
  const statements = ['CREATE TEMP TABLE probe (id int)', 'CREATE TEMP VIEW project AS SELECT 1 AS id']
  for (const login of logins)
    await asLogin(
      login,
      async (client) => {
        for (const statement of statements)
          expect(await refusal(client.query(statement)), `${login}: ${statement}`).toMatch(
            /permission denied to create temporary tables/
          )
      },
      database
    )
  await asLogin(
    'migrator',
    async (client) => {
      await client.query('SET ROLE "owner"')
      for (const statement of statements) await client.query(statement)
    },
    database
  )

  const partitions = () =>
    asLogin(
      'postgres',
      async (client) => {
        const { rows } = await client.query<{ name: string; owner: string }>(
          `SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner FROM pg_inherits i
            JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = 'reading'::regclass ORDER BY 1`
        )
        return rows
      },
      database
    )
  const before = await partitions()
  const furthest = before.filter(({ name }) => name !== 'reading_default').at(-1)!.name
  await asLogin(
    'migrator',
    async (client) => {
      await client.query('SET ROLE "owner"')
      await client.query(`DROP TABLE ${furthest}`)
    },
    database
  )
  expect((await partitions()).map(({ name }) => name)).not.toContain(furthest)
  await asLogin('system', (client) => client.query('SELECT partition_maintenance()'), database)
  expect(await partitions()).toEqual(expect.arrayContaining(before))
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

test('poll receipt migration preserves legacy append-only rows with unknown availability and no default', async () => {
  const database = await emptyDatabase()
  const url = localUrl('migrator', database)
  const folder = mkdtempSync(join(tmpdir(), 'skyclause-poll-receipt-'))
  try {
    cpSync(migrationsFolder, folder, { recursive: true })
    const journalPath = join(folder, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const receiptIndex = journal.entries.findIndex((entry) => entry.tag.endsWith('_b-evaluator-poll-receipt'))
    expect(receiptIndex).toBeGreaterThan(0)
    journal.entries = journal.entries.slice(0, receiptIndex)
    writeFileSync(journalPath, JSON.stringify(journal))
    await migrate(url, folder)
    const before = await asLogin(
      'postgres',
      async (client) => {
        const {
          rows: [source]
        } =
          await client.query(`INSERT INTO source (kind, external_id, name, url, cadence_s, freshness, stale_after_s, licence_label)
        VALUES ('jps_rain', 'receipt-migration', 'Receipt migration', 'https://source.example.test/', 300, 'observed', 1800, 'Test licence') RETURNING id`)
        const {
          rows: [poll]
        } = await client.query(
          `INSERT INTO poll (source_id, request_id, started_at, latency_ms, outcome)
        VALUES ($1, uuidv7(), '2026-11-10T01:00:00Z', 1, 'error') RETURNING *`,
          [source.id]
        )
        return poll
      },
      database
    )
    expect(await migrate(url, migrationsFolder)).toEqual(tags.slice(receiptIndex))
    const after = await asLogin(
      'postgres',
      async (client) => {
        const {
          rows: [row]
        } = await client.query('SELECT * FROM poll WHERE id = $1', [before.id])
        return row
      },
      database
    )
    expect(after).toEqual({ ...before, received_at: null })
    const column = await asLogin(
      'postgres',
      (client) =>
        client.query(
          "SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'poll' AND column_name = 'received_at'"
        ),
      database
    )
    expect(column.rows).toEqual([{ column_default: null, is_nullable: 'YES' }])
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}, 120_000)

test.each([false, true])(
  'snapshot migration preserves legacy evidence; duplicate=%s stops with diagnosis',
  async (duplicate) => {
    const database = await emptyDatabase()
    const url = localUrl('migrator', database)
    const folder = mkdtempSync(join(tmpdir(), 'skyclause-snapshot-archive-'))
    try {
      cpSync(migrationsFolder, folder, { recursive: true })
      const journalPath = join(folder, 'meta/_journal.json')
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
      const index = journal.entries.findIndex((entry) => entry.tag.endsWith('_b-evaluator-snapshots'))
      expect(index).toBeGreaterThan(0)
      journal.entries = journal.entries.slice(0, index)
      writeFileSync(journalPath, JSON.stringify(journal))
      await migrate(url, folder)
      const before = await asLogin(
        'postgres',
        async (client) => {
          const org = await client.query(
            "INSERT INTO auth.organization (name, slug, created_at) VALUES ('Snapshot migration', 'snapshot-migration', now()) RETURNING id"
          )
          const p = await client.query(
            "INSERT INTO project (org_id, slug, name, time_zone) VALUES ($1, 'snapshot-migration', 'Snapshot migration', 'Asia/Kuala_Lumpur') RETURNING id",
            [org.rows[0].id]
          )
          for (let count = 0; count < (duplicate ? 2 : 1); count++)
            await client.query(
              "INSERT INTO indicator_snapshot (org_id, project_id, pack, t_eval, inputs, site, series, nights, hash) VALUES ($1, $2, 'sky', '2026-11-10T04:00:00Z', '[]', '{}', '{}', '[]', 'legacy')",
              [org.rows[0].id, p.rows[0].id]
            )
          return (await client.query('SELECT * FROM indicator_snapshot ORDER BY id')).rows
        },
        database
      )
      if (duplicate) {
        await expect(migrate(url, migrationsFolder)).rejects.toThrow(
          /evaluator snapshot duplicate key.*immutable rows require diagnosis/
        )
        const after = await asLogin(
          'postgres',
          (client) => client.query('SELECT * FROM indicator_snapshot ORDER BY id'),
          database
        )
        expect(after.rows).toEqual(before)
      } else {
        expect(await migrate(url, migrationsFolder)).toEqual(tags.slice(index))
        const after = await asLogin(
          'postgres',
          (client) => client.query('SELECT * FROM indicator_snapshot ORDER BY id'),
          database
        )
        expect(after.rows).toEqual(
          before.map((row) => ({
            ...row,
            snapshot_body: null,
            registry_definitions: null,
            frozen_windows: null,
            archive_hash: null
          }))
        )
        const columns = await asLogin(
          'postgres',
          (client) =>
            client.query(
              "SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name = 'indicator_snapshot' AND column_name IN ('snapshot_body', 'registry_definitions', 'frozen_windows', 'archive_hash') ORDER BY column_name"
            ),
          database
        )
        expect(columns.rows).toHaveLength(4)
        expect(columns.rows.every((row) => row.column_default === null && row.is_nullable === 'YES')).toBe(true)
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  },
  120_000
)
