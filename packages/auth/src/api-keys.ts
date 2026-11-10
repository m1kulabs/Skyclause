import type { ApiKeyManager, ManagedApiKey, Scope } from '@skyclause/contracts'
import { apikey } from '@skyclause/db'
import { authDatabase } from '@skyclause/db/auth'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getAuth } from './instance'

const scopes = ['read', 'draft', 'admin', 'ingest'] as const satisfies readonly Scope[]

function objectOf(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function scopesOf(value: string | null): Scope[] {
  const found = objectOf(value).scopes
  return Array.isArray(found) ? scopes.filter((scope) => found.includes(scope)) : []
}

function recordOf(row: typeof apikey.$inferSelect): ManagedApiKey {
  const accountId = objectOf(row.metadata).account_id
  return {
    id: row.id,
    organizationId: row.referenceId,
    creatorId: typeof accountId === 'string' ? accountId : '',
    name: row.name ?? '',
    prefix: row.prefix ?? 'skc_',
    scopes: scopesOf(row.permissions),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastRequest,
    enabled: row.enabled === true
  }
}

/** The Better Auth-backed implementation registered by the web composition root. */
export const apiKeyManager: ApiKeyManager = {
  async create(input) {
    const created = await getAuth().auth.api.createApiKey({
      body: {
        organizationId: input.organizationId,
        userId: input.creatorId,
        name: input.name,
        expiresIn: input.expiresInDays * 86_400,
        permissions: { scopes: input.scopes },
        metadata: { account_id: input.creatorId },
        rateLimitEnabled: false
      }
    })
    const [row] = await authDatabase().select().from(apikey).where(eq(apikey.id, created.id)).limit(1)
    if (!row) throw new Error('Better Auth created an API key but it could not be read back')
    return { record: recordOf(row), key: created.key }
  },

  async list(query) {
    const conditions = [eq(apikey.configId, 'default'), eq(apikey.enabled, true)]
    if (query.organizationId) conditions.push(eq(apikey.referenceId, query.organizationId))
    if (query.creatorId) {
      conditions.push(sql`(${apikey.metadata})::jsonb ->> 'account_id' = ${query.creatorId}`)
    }
    const rows = await authDatabase()
      .select()
      .from(apikey)
      .where(and(...conditions))
      .orderBy(desc(apikey.createdAt), desc(apikey.id))
    return rows.map(recordOf)
  },

  async find(query) {
    const conditions = [eq(apikey.configId, 'default'), eq(apikey.id, query.id)]
    if (query.organizationId) conditions.push(eq(apikey.referenceId, query.organizationId))
    const [row] = await authDatabase()
      .select()
      .from(apikey)
      .where(and(...conditions))
      .limit(1)
    return row ? recordOf(row) : null
  },

  async revoke(query) {
    const conditions = [eq(apikey.configId, 'default'), eq(apikey.id, query.id), eq(apikey.enabled, true)]
    if (query.organizationId) conditions.push(eq(apikey.referenceId, query.organizationId))
    const rows = await authDatabase()
      .update(apikey)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(...conditions))
      .returning({ id: apikey.id })
    return rows.length === 1
  }
}
