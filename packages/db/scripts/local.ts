// The local container's connection strings (compose.yaml, docker/init.sql), for `db:migrate`, `db:seed-check` and the
// test harness. SKYCLAUSE_DB_HOST and SKYCLAUSE_DB_PORT move it, as the act gate does; production sets DATABASE_URL_*.
import { fileURLToPath } from 'node:url'

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

/** Each local login's password is its name; `postgres` is the container's superuser. */
export type LocalLogin = 'postgres' | 'migrator' | 'app' | 'auth_app' | 'system' | 'retention'

export function localUrl(login: LocalLogin, database = 'skyclause') {
  const host = process.env.SKYCLAUSE_DB_HOST ?? 'localhost'
  const port = process.env.SKYCLAUSE_DB_PORT ?? '5432'
  return `postgres://${login}:${login}@${host}:${port}/${database}`
}
