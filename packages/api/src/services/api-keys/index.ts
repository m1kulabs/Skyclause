import {
  SCOPE_STATEMENTS,
  type ApiKeyManager,
  type ApiKeyScope,
  type Can,
  type ManagedApiKey,
  type Page,
  type Principal,
  type Scope
} from '@skyclause/contracts'
import type { ApiDeps } from '../../context'
import { decodeCursor, page } from '../../pagination'
import { ApiError } from '../../problems'
import { instant } from '../../serialize'

const LISTABLE_SCOPES = new Set<Scope>(['read', 'draft', 'admin'])
const notFound = () => new ApiError(404, 'not-found', 'No such API key exists for this organisation or account.')
const forbidden = () =>
  new ApiError(403, 'insufficient-scope', 'Only the key creator, an Owner or an Admin can revoke it.')

function isManaged(record: ManagedApiKey | null): record is ManagedApiKey & { expiresAt: Date } {
  return !!(
    record &&
    record.enabled &&
    record.creatorId &&
    record.name &&
    record.expiresAt &&
    record.scopes.length > 0 &&
    record.scopes.every((scope) => LISTABLE_SCOPES.has(scope))
  )
}

function wire(record: ManagedApiKey & { expiresAt: Date }) {
  return {
    id: record.id,
    name: record.name,
    prefix: record.prefix,
    scopes: record.scopes as ApiKeyScope[],
    created_at: instant(record.createdAt),
    expires_at: instant(record.expiresAt),
    last_used_at: record.lastUsedAt ? instant(record.lastUsedAt) : null,
    created_by: record.creatorId
  }
}

function auditShape(record: ManagedApiKey) {
  return {
    api_key_id: record.id,
    prefix: record.prefix,
    scopes: record.scopes,
    expires_at: record.expiresAt ? instant(record.expiresAt) : null,
    created_by: record.creatorId
  }
}

function canHoldScope(can: Can, principal: Principal, scope: ApiKeyScope): boolean {
  return SCOPE_STATEMENTS[scope].some((statement) => can(principal, statement))
}

function scopeError(): ApiError {
  return new ApiError(422, 'validation-failed', 'One or more scopes exceed the creator’s role cap.', {
    errors: [{ in: 'body', pointer: '/scopes', detail: 'Remove scopes your role cannot hold.' }]
  })
}

export async function createApiKey(
  deps: ApiDeps,
  principal: Principal,
  organizationId: string,
  input: { name: string; scopes: ApiKeyScope[]; expiresInDays: number }
) {
  if (principal.kind !== 'session') throw forbidden()
  if (
    (principal.role === 'viewer' && input.scopes.some((scope) => scope !== 'read')) ||
    input.scopes.some((scope) => !canHoldScope(deps.can, principal, scope))
  ) {
    throw scopeError()
  }

  const { record, key } = await deps.apiKeys.create({
    organizationId,
    creatorId: principal.accountId,
    name: input.name,
    scopes: input.scopes,
    expiresInDays: input.expiresInDays
  })
  if (!isManaged(record)) {
    await deps.apiKeys.revoke({ id: record.id, organizationId })
    throw new Error('The API-key manager returned a key outside the managed-key contract')
  }

  try {
    await deps.withTenant({ orgId: organizationId, principal }, async (tx) => {
      await deps.recordAudit(tx, {
        action: 'api_key.created',
        target: { type: 'api_key', id: record.id },
        after: auditShape(record)
      })
      await deps.track(tx, 'api_key_created', { scopes: input.scopes, expiry_days: input.expiresInDays })
    })
  } catch (error) {
    await deps.apiKeys.revoke({ id: record.id, organizationId })
    throw error
  }

  return { ...wire(record), key }
}

function cursorAfter(cursor: string | undefined) {
  if (!cursor) return null
  const position = decodeCursor(cursor)
  const createdAt = typeof position.created_at === 'string' ? new Date(position.created_at) : null
  const id = typeof position.id === 'string' ? position.id : null
  if (!createdAt || !Number.isFinite(createdAt.getTime()) || !id || !/^[\da-f-]{36}$/i.test(id)) {
    throw new ApiError(422, 'validation-failed', 'The cursor is not one this API issued.', {
      errors: [{ in: 'query', pointer: '/cursor', detail: 'Invalid cursor' }]
    })
  }
  return { createdAt, id }
}

export async function listApiKeys(
  apiKeys: ApiKeyManager,
  query: { organizationId?: string; creatorId?: string; limit: number; cursor?: string }
): Promise<Page<ReturnType<typeof wire>>> {
  const after = cursorAfter(query.cursor)
  const rows = await apiKeys.list({
    ...(query.organizationId ? { organizationId: query.organizationId } : {}),
    ...(query.creatorId ? { creatorId: query.creatorId } : {})
  })
  const filtered = rows.filter(isManaged).filter((record) => {
    if (!after) return true
    const at = record.createdAt.getTime()
    return at < after.createdAt.getTime() || (at === after.createdAt.getTime() && record.id < after.id)
  })
  const result = page(filtered.slice(0, query.limit + 1), query.limit, (record) => ({
    created_at: instant(record.createdAt),
    id: record.id
  }))
  return { ...result, data: result.data.map(wire) }
}

async function revokeAudit(deps: ApiDeps, principal: Principal, record: ManagedApiKey) {
  await deps.withTenant({ orgId: record.organizationId, principal }, (tx) =>
    deps.recordAudit(tx, {
      action: 'api_key.revoked',
      target: { type: 'api_key', id: record.id },
      before: auditShape(record),
      after: { ...auditShape(record), revoked: true }
    })
  )
}

export async function revokeApiKey(
  deps: ApiDeps,
  principal: Principal,
  query: { id: string; organizationId?: string }
): Promise<void> {
  if (principal.kind !== 'session') throw forbidden()
  const record = await deps.apiKeys.find(query)
  if (!isManaged(record)) throw notFound()

  let actor = principal
  if (record.creatorId !== principal.accountId) {
    if (principal.orgId === record.organizationId && principal.role) {
      actor = principal
    } else {
      const membership = await deps.membership.lookup(record.organizationId, principal.accountId)
      if (!membership?.role) throw notFound()
      actor = { ...principal, orgId: membership.id, role: membership.role }
    }
    if (!deps.can(actor, 'members.manage')) throw forbidden()
  } else if (actor.orgId !== record.organizationId || actor.role === null) {
    const membership = await deps.membership.lookup(record.organizationId, principal.accountId)
    if (membership?.role) actor = { ...principal, orgId: membership.id, role: membership.role }
  }

  if (!(await deps.apiKeys.revoke(query))) throw notFound()
  await revokeAudit(deps, actor, record)
}

export function canListAllApiKeys(can: Can, principal: Principal): boolean {
  return can(principal, 'members.manage')
}
