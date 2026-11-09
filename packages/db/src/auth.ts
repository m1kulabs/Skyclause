import { sql } from 'drizzle-orm'
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

/** A credential kept in a T table: `skg_` guest tokens and `sc_share` links by `tokenHash`, OAuth grants by ID. */
export type CredentialKind = 'guest_token' | 'share_link' | 'oauth_grant'

/**
 * The live row behind a credential, as its organisation and ID only (#94), or null when it is unknown, expired or
 * revoked. Read the row itself through `withTenant` in that organisation.
 */
export async function credentialOwner(
  kind: CredentialKind,
  key: string
): Promise<{ orgId: string; id: string } | null> {
  const { rows } = await authDatabase().execute<{ org_id: string; id: string }>(
    sql`SELECT org_id, id FROM auth.credential_owner(${kind}, ${key})`
  )
  return rows[0] ? { orgId: rows[0].org_id, id: rows[0].id } : null
}
