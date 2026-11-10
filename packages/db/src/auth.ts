import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { DEFAULT_PREFERENCES, Preferences, type Preferences as PreferenceValues } from '@skyclause/contracts'
import { connection } from './client'
import * as auth from './schema/auth'

/**
 * Drizzle on the `auth_app` login over the `auth` schema, for Better Auth's adapter (#94). It's the one client outside
 * the `with*` helpers: `auth_app` has no grant outside `auth`, so it can't reach a tenant table.
 */
export function authDatabase() {
  return drizzle(connection('AUTH').pool, { schema: auth })
}

/** Serializes the complete last-method check and mutation across API and Better Auth requests, on every instance. */
export function withAccountSecurityLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return connection('AUTH', 'account-security').db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`account-security:${userId}`}, 0))`)
    return fn()
  })
}

/** The current sign-in methods for one account, shared by the API and Better Auth's last-method guard. */
export async function countSignInMethods(userId: string) {
  const db = authDatabase()
  const [[accountRow], [googleRow], [passkeyRow]] = await Promise.all([
    db
      .select({ magicLinkEnabled: auth.user.magicLinkEnabled })
      .from(auth.user)
      .where(eq(auth.user.id, userId))
      .limit(1),
    db
      .select({ count: count() })
      .from(auth.account)
      .where(and(eq(auth.account.userId, userId), eq(auth.account.providerId, 'google'))),
    db.select({ count: count() }).from(auth.passkey).where(eq(auth.passkey.userId, userId))
  ])
  if (!accountRow) return null
  return {
    magicLinkEnabled: accountRow.magicLinkEnabled,
    google: googleRow?.count ?? 0,
    passkeys: passkeyRow?.count ?? 0
  }
}

function preferencesFrom(value: unknown): PreferenceValues {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_PREFERENCES
  const partial = Preferences.partial().safeParse(value)
  return partial.success ? Preferences.parse({ ...DEFAULT_PREFERENCES, ...partial.data }) : DEFAULT_PREFERENCES
}

/** Reads a member's stored settings and applies documented defaults to newly added fields. */
export async function readAccountPreferences(userId: string): Promise<PreferenceValues | null> {
  const [row] = await authDatabase()
    .select({ preferences: auth.user.preferences })
    .from(auth.user)
    .where(and(eq(auth.user.id, userId), isNull(auth.user.deletedAt)))
    .limit(1)
  return row ? preferencesFrom(row.preferences) : null
}

/** Persists a partial account settings update and returns the complete preference shape. */
export async function writeAccountPreferences(
  userId: string,
  update: Partial<PreferenceValues>
): Promise<PreferenceValues | null> {
  const current = await readAccountPreferences(userId)
  if (!current) return null
  const preferences = Preferences.parse({ ...current, ...update })
  const [row] = await authDatabase()
    .update(auth.user)
    .set({ preferences })
    .where(and(eq(auth.user.id, userId), isNull(auth.user.deletedAt)))
    .returning({ id: auth.user.id })
  return row ? preferences : null
}

/** Changes the email magic-link method; the API and Better Auth plugin enforce the method guard. */
export async function writeMagicLinkEnabled(userId: string, enabled: boolean): Promise<boolean> {
  const [row] = await authDatabase()
    .update(auth.user)
    .set({ magicLinkEnabled: enabled })
    .where(and(eq(auth.user.id, userId), isNull(auth.user.deletedAt)))
    .returning({ id: auth.user.id })
  return !!row
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
