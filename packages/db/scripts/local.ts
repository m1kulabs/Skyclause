// The local container (compose.yaml, docker/init.sql), for `db:migrate`, `db:seed-check` and the test harness.
// SKYCLAUSE_DB_HOST and SKYCLAUSE_DB_PORT move it, as the act gate does; production sets DATABASE_URL_*.
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

/** Each local login's password is its name; `postgres` is the container's superuser, which RLS never limits. */
export type LocalLogin = 'postgres' | 'migrator' | 'app' | 'auth_app' | 'system' | 'retention'

export function localUrl(login: LocalLogin, database = 'skyclause') {
  const host = process.env.SKYCLAUSE_DB_HOST ?? 'localhost'
  const port = process.env.SKYCLAUSE_DB_PORT ?? '5432'
  return `postgres://${login}:${login}@${host}:${port}/${database}`
}

/** Runs `fn` on one raw client for a local login and database, then closes it. */
export async function withLocal<T>(login: LocalLogin, database: string, fn: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: localUrl(login, database) })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

/** A name for a scratch database that no other run on this server picks. */
export const scratchName = (prefix: string) => `${prefix}_${process.pid}_${Date.now().toString(36)}`

/** A database owned by `migrator`, as production's is, optionally cloned from `template`. */
export function createDatabase(name: string, template?: string) {
  const from = template ? `TEMPLATE "${template}" ` : ''
  return withLocal('postgres', 'postgres', (admin) => admin.query(`CREATE DATABASE "${name}" ${from}OWNER migrator`))
}

export function dropDatabase(name: string) {
  return withLocal('postgres', 'postgres', (admin) => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`))
}
