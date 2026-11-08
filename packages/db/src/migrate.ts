import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import pg from 'pg'

/**
 * Applies the pending migrations in `folder` (drizzle-kit's journal and SQL) on the `migrator` login, one transaction
 * each, recording them in `drizzle.__drizzle_migrations` as drizzle-kit does. The first migration creates the roles, so
 * it runs as the login; every later one runs as `owner`, which then owns every object. A migration that needs the
 * login's own rights wraps the statement in `RESET ROLE; …; SET LOCAL ROLE "owner";`. An advisory lock makes a second
 * run at the same time wait, then apply nothing. Returns the applied tags.
 */
export async function migrate(url: string, folder: string): Promise<string[]> {
  const migrations = readMigrationFiles({ migrationsFolder: folder })
  const { entries } = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8')) as {
    entries: Array<{ tag: string }>
  }
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('skyclause.migrate'))")
    await client.query('CREATE SCHEMA IF NOT EXISTS drizzle')
    await client.query(
      'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)'
    )
    const { rows } = await client.query<{ created_at: string }>(
      'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1'
    )
    const last = rows[0] ? Number(rows[0].created_at) : -Infinity
    const applied: string[] = []
    for (const [i, migration] of migrations.entries()) {
      if (migration.folderMillis <= last) continue
      await client.query('BEGIN')
      try {
        if (i > 0) await client.query('SET LOCAL ROLE "owner"')
        for (const statement of migration.sql) if (statement.trim()) await client.query(statement)
        await client.query('RESET ROLE')
        await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)', [
          migration.hash,
          migration.folderMillis
        ])
        await client.query('COMMIT')
      } catch (error) {
        // A failed ROLLBACK means the connection is gone, which ends the transaction anyway; report the first error.
        await client.query('ROLLBACK').catch(() => {})
        throw error
      }
      applied.push(entries[i]!.tag)
    }
    return applied
  } finally {
    await client.end()
  }
}
