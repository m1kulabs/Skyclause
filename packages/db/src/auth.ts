import { createHash } from 'node:crypto'
import { and, lt, sql } from 'drizzle-orm'
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

function rateLimitId(key: string) {
  const bytes = createHash('sha256').update(`step-up-rate-limit:${key}`).digest()
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** An atomic fixed-window counter for #100's hashed step-up buckets. */
export async function hitStepUpLimit(key: string, o: { limit: number; windowS: number; now: Date }) {
  const db = authDatabase()
  const id = rateLimitId(key)
  const identifier = `step-up-rate-limit:${key}`
  const expiresAt = new Date(o.now.getTime() + o.windowS * 1000)
  await db
    .delete(auth.verification)
    .where(
      and(sql`${auth.verification.identifier} LIKE 'step-up-rate-limit:%'`, lt(auth.verification.expiresAt, o.now))
    )
  const [row] = await db
    .insert(auth.verification)
    .values({ id, identifier, value: '1', expiresAt, createdAt: o.now, updatedAt: o.now })
    .onConflictDoUpdate({
      target: auth.verification.id,
      set: {
        value: sql`CASE WHEN ${auth.verification.expiresAt} <= ${o.now} THEN '1' ELSE (${auth.verification.value}::integer + 1)::text END`,
        expiresAt: sql`CASE WHEN ${auth.verification.expiresAt} <= ${o.now} THEN ${expiresAt} ELSE ${auth.verification.expiresAt} END`,
        updatedAt: o.now
      }
    })
    .returning({ value: auth.verification.value, expiresAt: auth.verification.expiresAt })
  if (!row) throw new Error('Step-up rate limit counter was not returned')
  return { allowed: Number(row.value) <= o.limit, resetAt: row.expiresAt }
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
