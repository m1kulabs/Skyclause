import { drizzle } from 'drizzle-orm/node-postgres'
import { connection } from './client'
import * as auth from './schema/auth'

/**
 * Drizzle on the `auth_app` login over the `auth` schema, for Better Auth's adapter (#94). It's the one client outside
 * the `with*` helpers: `auth_app` has no grant outside `auth`, so it can't reach a tenant table.
 */
export function authDatabase() {
  return drizzle(connection('AUTH').pool, { schema: auth })
}
