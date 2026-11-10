// Spec §7 test harness (f-api): principals, requests, the cross-organisation case and transport doubles. Doubles and
// in-memory stores live only here, under test/; email transport doubles live in delivery's test harness, re-exported
// here for existing API tests.
import { randomBytes, randomUUID } from 'node:crypto'
import {
  API_ROUTES,
  GRANTS,
  Problem,
  REGISTRY,
  V1_ROUTES,
  type Can,
  type GrantSubject,
  type ApiKeyManager,
  type ManagedApiKey,
  type Principal,
  type PushTransport,
  type Role,
  type SkyclauseRoute
} from '@skyclause/contracts'
import type { Tx } from '@skyclause/db'
import { withPublicReader, withSystem } from '@skyclause/db'
import { createMailbox } from '@skyclause/delivery/testing'
import { expect } from 'vitest'
import { createApi, type ApiApp, type Registry } from '../../src/app'
import type { ApiDeps, OAuthManagement } from '../../src/context'
import { HANDLERS } from '../../src/routes'
import type { IdempotencyRecord, IdempotencyStore, MembershipLookup, RateLimitStore } from '../../src/stores'

export { createMailbox }

export const TEST_APP_ORIGIN = 'https://app.skyclause.m1ku.tech'
export const TEST_NOW = new Date('2026-11-08T02:00:00Z')

// Organisations and memberships the principal factories register, read by the membership double.
const orgs = new Map<string, { id: string; slug: string }>()
const roles = new Map<string, Role>()

function uuidV7(at: number): string {
  const bytes = randomBytes(16)
  let timestamp = BigInt(at)
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(timestamp & 0xffn)
    timestamp >>= 8n
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function testOrg(slug: string): { id: string; slug: string } {
  let org = orgs.get(slug)
  if (!org) {
    org = { id: randomUUID(), slug }
    orgs.set(slug, org)
  }
  return org
}

export const testMembership: MembershipLookup = {
  async lookup(ref, accountId) {
    const org = [...orgs.values()].find((org) => org.slug === ref || org.id === ref)
    return org ? { ...org, role: (accountId && roles.get(`${accountId} ${org.id}`)) || null } : null
  }
}

/** A session that is a member of `org` with `role`; `requireOrg` fills `orgId` and `role` from the header. */
export function asSession(o: {
  org: string
  role: Role
  guest?: boolean
  authenticatedAt?: Date
  staff?: boolean
  via?: 'cookie' | 'bearer'
  accountId?: string
}): Extract<Principal, { kind: 'session' }> {
  const accountId = o.accountId ?? randomUUID()
  roles.set(`${accountId} ${testOrg(o.org).id}`, o.guest ? 'guest' : o.role)
  const via = o.via ?? 'cookie'
  return {
    kind: 'session',
    via,
    client: via === 'cookie' ? 'app' : 'cli',
    clientName: null,
    accountId,
    sessionId: randomUUID(),
    isGuest: o.guest ?? false,
    staff: o.staff ?? false,
    orgId: null,
    role: null,
    authenticatedAt: o.authenticatedAt ?? TEST_NOW
  }
}

/** `role` is the key's account's current role (#94). */
export function asApiKey(o: { org: string; role: Role; scopes: Array<'read' | 'draft' | 'admin'> }): Principal {
  return {
    kind: 'api_key',
    client: 'api',
    clientName: null,
    keyId: randomUUID(),
    accountId: randomUUID(),
    orgId: testOrg(o.org).id,
    role: o.role,
    scopes: o.scopes
  }
}

/** `role` is the account's current role, null for a link-bound grant. */
export function asOAuth(o: {
  org: string
  role: Role | null
  resource?: 'api' | 'mcp'
  projectIds?: string[] | 'all'
  scopes?: Array<'read' | 'draft'>
  shareLinkId?: string | null
}): Principal {
  const resource = o.resource ?? 'mcp'
  return {
    kind: 'oauth',
    client: resource === 'mcp' ? 'mcp' : 'api',
    clientName: null,
    grantId: randomUUID(),
    clientId: randomUUID(),
    accountId: randomUUID(),
    orgId: testOrg(o.org).id,
    role: o.role,
    resource,
    projectIds: o.projectIds ?? 'all',
    scopes: o.scopes ?? ['read'],
    shareLinkId: o.shareLinkId ?? null
  }
}

export function asGuestToken(o: { org: string; scopes?: Array<'read' | 'draft'> }): Principal {
  return {
    kind: 'guest_token',
    client: 'playground',
    clientName: null,
    tokenId: randomUUID(),
    accountId: randomUUID(),
    orgId: testOrg(o.org).id,
    scopes: o.scopes ?? ['read']
  }
}

export function asShareLink(o: { org: string; projectId?: string; access?: 'view' | 'reviewer' }): Principal {
  return {
    kind: 'share_link',
    client: 'app',
    clientName: null,
    linkId: randomUUID(),
    orgId: testOrg(o.org).id,
    projectId: o.projectId ?? randomUUID(),
    access: o.access ?? 'view'
  }
}

export function asDevice(o: { org: string; sourceId?: string }): Principal {
  return {
    kind: 'device',
    client: 'api',
    clientName: null,
    keyId: randomUUID(),
    orgId: testOrg(o.org).id,
    sourceId: o.sourceId ?? randomUUID()
  }
}

export function asSystem(job: string): Principal {
  return { kind: 'system', client: 'worker', clientName: null, job }
}

/** A stand-in for #94's `can` over the PRD matrix: the role's cell, capped by it for keys and grants. */
export const testCan: Can = (principal, statement) => {
  const subject: GrantSubject | null =
    principal.kind === 'session'
      ? principal.isGuest
        ? 'guest'
        : principal.role
      : principal.kind === 'api_key'
        ? 'api_key'
        : principal.kind === 'oauth'
          ? 'mcp_token'
          : principal.kind === 'guest_token'
            ? 'guest'
            : principal.kind === 'share_link' && principal.access === 'reviewer'
              ? 'share_link_reviewer'
              : null
  if (!subject || !GRANTS[statement][subject].allowed) return false
  const role = principal.kind === 'api_key' || principal.kind === 'oauth' ? principal.role : null
  return role === null || GRANTS[statement][role].allowed
}

export type MemoryIdempotencyStore = IdempotencyStore & { records: Map<string, IdempotencyRecord> }

export function memoryIdempotencyStore(): MemoryIdempotencyStore {
  const records = new Map<string, IdempotencyRecord>()
  const id = (k: { scope: string; route: string; key: string }) => `${k.scope}\n${k.route}\n${k.key}`
  return {
    records,
    async reserve(record, now) {
      const held = records.get(id(record))
      if (held && held.expiresAt > now) return held
      records.set(id(record), record)
      return null
    },
    async complete(claim, response, expiresAt) {
      const held = records.get(id(claim))
      if (held?.requestHash === claim.requestHash && !held.response) {
        records.set(id(claim), { ...held, response, expiresAt })
      }
    },
    async release(claim) {
      const held = records.get(id(claim))
      if (held?.requestHash === claim.requestHash && !held.response) records.delete(id(claim))
    }
  }
}

export function memoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: Date }>()
  return {
    async hit({ bucket, windowS, now }) {
      let window = windows.get(bucket)
      if (!window || window.resetAt <= now) window = { count: 0, resetAt: new Date(now.getTime() + windowS * 1000) }
      window.count += 1
      windows.set(bucket, window)
      return { ...window }
    }
  }
}

export interface AuditRow {
  orgId: string
  actor: Principal
  action: string
  target: { type: string; id: string }
  after?: unknown
}

export interface TestDeps extends ApiDeps {
  audits: AuditRow[]
  tracked: Array<{ name: string; props: unknown }>
  idempotency: MemoryIdempotencyStore
  clock: { advance(ms: number): void }
}

const oauthDouble: OAuthManagement = {
  async listClients() {
    return { data: [], next_cursor: null }
  },
  async createClient(input) {
    return {
      id: randomUUID(),
      client_id: 'test-oauth-client',
      client_name: input.clientName,
      redirect_uris: input.redirectUris,
      scopes: input.scopes,
      created_at: TEST_NOW.toISOString(),
      client_secret: 'test-only-secret',
      redirect_uri: 'https://vertexaisearch.cloud.google.com/oauth-redirect',
      authorization_url: `${TEST_APP_ORIGIN}/api/auth/oauth2/authorize`,
      token_url: `${TEST_APP_ORIGIN}/api/auth/oauth2/token`
    }
  },
  async deleteClient() {
    return true
  },
  async listGrants() {
    return { data: [], next_cursor: null }
  },
  async revokeGrant() {
    return true
  }
}

/** In-memory stores, the membership and `can` doubles, a `withTenant` double and a clock starting at TEST_NOW. */
export function testDeps(overrides: Omit<Partial<ApiDeps>, 'idempotency'> = {}): TestDeps {
  let now = TEST_NOW.getTime()
  const audits: AuditRow[] = []
  const tracked: TestDeps['tracked'] = []
  const keys = new Map<string, ManagedApiKey & { key: string }>()
  const idempotency = memoryIdempotencyStore()
  type FakeTx = { orgId: string; principal: Principal }
  const apiKeys: ApiKeyManager = {
    async create(input) {
      const createdAt = new Date(now)
      const record: ManagedApiKey = {
        id: uuidV7(now),
        organizationId: input.organizationId,
        creatorId: input.creatorId,
        name: input.name,
        prefix: 'skc_',
        scopes: [...input.scopes],
        createdAt,
        expiresAt: new Date(now + input.expiresInDays * 86_400_000),
        lastUsedAt: null,
        enabled: true
      }
      const key = `skc_${randomUUID().replaceAll('-', '')}`
      keys.set(record.id, { ...record, key })
      return { record, key }
    },
    async list(query) {
      return [...keys.values()]
        .filter(
          (record) =>
            record.enabled &&
            (!query.organizationId || record.organizationId === query.organizationId) &&
            (!query.creatorId || record.creatorId === query.creatorId)
        )
        .map(({ key: _key, ...record }) => ({ ...record }))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
    },
    async find(query) {
      const record = keys.get(query.id)
      if (!record || (query.organizationId && record.organizationId !== query.organizationId)) return null
      const { key: _key, ...metadata } = record
      return { ...metadata }
    },
    async revoke(query) {
      const record = keys.get(query.id)
      if (!record || (query.organizationId && record.organizationId !== query.organizationId) || !record.enabled)
        return false
      keys.set(query.id, { ...record, enabled: false })
      return true
    }
  }
  return {
    resolvePrincipal: async () => null,
    can: testCan,
    membership: testMembership,
    idempotency,
    rateLimits: memoryRateLimitStore(),
    withTenant: async (ctx, fn) => fn({ orgId: ctx.orgId, principal: ctx.principal } as unknown as Tx),
    // #111's `/e` seams; the real ones, so a handler test writes rows on the #79 §7 test database.
    withSystem,
    withPublicReader,
    apiKeys,
    recordAudit: async (tx, e) => {
      const { orgId, principal } = tx as unknown as FakeTx
      audits.push({ orgId, actor: principal, action: e.action, target: e.target, after: e.after })
    },
    oauth: oauthDouble,
    track: async (_tx, name, props) => {
      tracked.push({ name, props })
    },
    email: createMailbox(),
    config: () => ({ appEnv: 'test', appOrigin: TEST_APP_ORIGIN, ipHashKey: 'test-only-ip-hash-key-for-the-harness' }),
    now: () => new Date(now),
    ...overrides,
    audits,
    tracked,
    clock: {
      advance(ms) {
        now += ms
      }
    }
  }
}

export function createTestApi(o: Partial<Registry> & { deps?: TestDeps } = {}) {
  const deps = o.deps ?? testDeps()
  const apps = createApi(deps, {
    v1: o.v1 ?? (V1_ROUTES as readonly SkyclauseRoute[]),
    api: o.api ?? (API_ROUTES as readonly SkyclauseRoute[]),
    handlers: o.handlers ?? (HANDLERS as Registry['handlers'])
  })
  return { ...apps, deps }
}

export interface ApiRequest {
  /** Passed in process, as MCP does (D5); omitted, the request goes through `resolvePrincipal`. */
  as?: Principal
  method: string
  path: string
  body?: unknown
  query?: Record<string, string>
  /** Sent as `Skyclause-Organization`. */
  org?: string
  idempotencyKey?: string
  headers?: Record<string, string>
}

/** One request against an app. A cookie session's write carries `Origin: APP_ORIGIN` unless `headers` says otherwise. */
export function apiRequest(app: ApiApp, o: ApiRequest): Promise<Response> {
  const headers = new Headers(o.headers)
  if (o.org) headers.set('Skyclause-Organization', o.org)
  if (o.idempotencyKey) headers.set('Idempotency-Key', o.idempotencyKey)
  if (o.body !== undefined) headers.set('Content-Type', 'application/json')
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(o.method)
  if (o.as?.kind === 'session' && o.as.via === 'cookie' && write && !headers.has('Origin')) {
    headers.set('Origin', TEST_APP_ORIGIN)
  }
  const query = o.query ? `?${new URLSearchParams(o.query)}` : ''
  const request = new Request(`https://api.skyclause.m1ku.tech${o.path}${query}`, {
    method: o.method,
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  })
  return Promise.resolve(app.fetch(request, o.as ? { principal: o.as } : undefined))
}

/**
 * Spec §7 "Every operation tests … a cross-organisation 404": `as` belongs to one organisation, `params` name another
 * organisation's rows, and the operation must answer 404 with a problem.
 */
export function crossOrgCase(
  operationId: string,
  o: Omit<ApiRequest, 'method' | 'path'> & {
    app: ApiApp
    as: Principal
    params: Record<string, string>
    routes?: readonly SkyclauseRoute[]
  }
): { name: string; run: () => Promise<void> } {
  const route = (o.routes ?? (REGISTRY as readonly SkyclauseRoute[])).find((r) => r.operationId === operationId)
  if (!route) throw new Error(`No operation ${operationId}`)
  const path = route.path.replace(/\{([^}]+)\}/g, (_: string, name: string) => {
    const value = o.params[name]
    if (value === undefined) throw new Error(`crossOrgCase(${operationId}) needs params.${name}`)
    return encodeURIComponent(value)
  })
  return {
    name: `${operationId} answers 404 for another organisation's rows`,
    run: async () => {
      const response = await apiRequest(o.app, {
        ...o,
        method: route.method.toUpperCase(),
        path,
        idempotencyKey: o.idempotencyKey ?? (route['x-skyclause'].idempotent ? randomUUID() : undefined)
      })
      expect(response.status, operationId).toBe(404)
      expect(Problem.safeParse(await response.json()).success, operationId).toBe(true)
    }
  }
}

type Push = { subscription: Parameters<PushTransport['send']>[0]; payload: Parameters<PushTransport['send']>[1] }

/** A `PushTransport` answering `status` (201 by default; 404 or 410 to exercise a gone subscription). */
export function createPushDouble(status = 201): PushTransport & { sent: Push[] } {
  const sent: Push[] = []
  return {
    sent,
    async send(subscription, payload) {
      sent.push({ subscription, payload })
      return { status }
    }
  }
}
