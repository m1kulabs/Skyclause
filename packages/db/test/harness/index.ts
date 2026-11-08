// The #79 §7 test database: a template migrated once per Vitest project (global-setup.ts), cloned fresh for each test
// file into the worker's own database (worker-setup.ts); config.ts wires both. These are the helpers tests use.
import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Principal } from '@skyclause/contracts'
import type pg from 'pg'
import { migrationsFolder, withLocal, type LocalLogin } from '../../scripts/local'

/** The database this test file runs against (set by worker-setup.ts). */
export function testDatabase() {
  const name = process.env.SKYCLAUSE_TEST_DATABASE
  if (!name) throw new Error('no test database: add databaseTest to this package’s Vitest config')
  return name
}

/**
 * Runs `fn` on a raw client for a local login in this file's database, outside the `with*` helpers: `postgres` (the
 * superuser, which bypasses RLS) for setup and assertions, or another login to probe its grants and policies.
 */
export function asLogin<T>(login: LocalLogin, fn: (client: pg.Client) => Promise<T>, database = testDatabase()) {
  return withLocal(login, database, fn)
}

/** A copy of the repo's migrations with one more appended through the journal, as `drizzle-kit generate` would. */
export function migrationsWith(tag: string, sql: string) {
  const folder = mkdtempSync(join(tmpdir(), 'skyclause-migrations-'))
  cpSync(migrationsFolder, folder, { recursive: true })
  const journalPath = join(folder, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<Record<string, unknown>> }
  journal.entries.push({ idx: journal.entries.length, version: '7', when: Date.now(), tag, breakpoints: true })
  writeFileSync(journalPath, JSON.stringify(journal))
  writeFileSync(join(folder, `${tag}.sql`), sql)
  return folder
}

/** A signed-in member of `orgId`; f-api's `asSession` (#93) is the full version. */
export function memberOf(orgId: string, role: 'owner' | 'viewer' = 'owner'): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: randomUUID(),
    sessionId: randomUUID(),
    isGuest: false,
    staff: false,
    orgId,
    role,
    authenticatedAt: new Date()
  }
}

/** Tables in `public` and `auth` with a NOT NULL `org_id` (T tables), from the live catalogue. */
export async function tenantTables() {
  return asLogin('postgres', async (client) => {
    const { rows } = await client.query<{ name: string }>(`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND a.attnotnull AND NOT a.attisdropped
      WHERE n.nspname IN ('public', 'auth') AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`)
    return rows.map(({ name }) => name)
  })
}

/** The database's own message for a statement that must fail; Drizzle wraps it as the error's `cause`. */
export async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    const { cause } = error as { cause?: unknown }
    return String(cause instanceof Error ? cause.message : error instanceof Error ? error.message : error)
  }
  throw new Error('expected the database to refuse it')
}

export { expectEvent, expectOneAudit } from './expect'
