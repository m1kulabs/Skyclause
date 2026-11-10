import type {
  Can,
  EmailTransport,
  Principal,
  RecordAudit,
  ResolvePrincipal,
  SkyclauseRoute,
  ShiftConditions
} from '@skyclause/contracts'
import type { withPublicReader, withSystem } from '@skyclause/db'
import type { Scope } from '@skyclause/contracts'
import type { IdempotencyStore, MembershipLookup, RateLimitStore } from './stores'
import type { WithTenant } from './tenancy'

export type WithSystem = typeof withSystem
export type WithPublicReader = typeof withPublicReader

/** The settings the API reads per request (spec §6, f-api's rows plus APP_ENV). */
export interface ApiConfig {
  appEnv: 'dev' | 'production' | 'test'
  appOrigin: string | undefined
  ipHashKey: string | undefined
  /** Where permalinks `/c/{callId}` live under HOST_MODE=multi; unset on a single host (#152). */
  marketingOrigin?: string
  /** `VAPID_PUBLIC_KEY` (c-approver-alerts); unset until the `vapid-keys` job has run. */
  vapidPublicKey?: string
}

export interface OAuthClientRecord {
  id: string
  client_id: string
  client_name: string
  redirect_uris: string[]
  scopes: Array<Extract<Scope, 'read' | 'draft'>>
  created_at: string
}

export interface CreatedOAuthClientRecord extends OAuthClientRecord {
  client_secret: string
  redirect_uri: string
  authorization_url: string
  token_url: string
}

export interface OAuthGrantRecord {
  id: string
  client_id: string
  org_id: string
  resource: 'api' | 'mcp'
  project_ids: string[] | 'all'
  scopes: Array<Extract<Scope, 'read' | 'draft'>>
  share_link_id: string | null
  revoked_at: string | null
  account_id: string
  client_name: string
  created_at: string
}

export interface OAuthManagement {
  listClients(
    orgId: string,
    query: { limit: number; cursor?: string }
  ): Promise<{ data: OAuthClientRecord[]; next_cursor: string | null }>
  createClient(input: {
    orgId: string
    principal: Principal
    headers: Headers
    clientName: string
    redirectUris: string[]
    scopes: Array<Extract<Scope, 'read' | 'draft'>>
  }): Promise<CreatedOAuthClientRecord>
  deleteClient(input: { orgId: string; id: string; now: Date; principal: Principal }): Promise<boolean>
  listGrants(
    orgId: string,
    query: { limit: number; cursor?: string }
  ): Promise<{ data: OAuthGrantRecord[]; next_cursor: string | null }>
  revokeGrant(input: { orgId: string; id: string; now: Date; principal: Principal }): Promise<boolean>
}

/** Everything the API reaches outside itself; production wires `@skyclause/db` and the registered auth seams. */
export interface ApiDeps {
  resolvePrincipal: ResolvePrincipal
  can: Can
  membership: MembershipLookup
  idempotency: IdempotencyStore
  rateLimits: RateLimitStore
  withTenant: WithTenant
  /** #111's `/e` writes analytics rows as `system` with no organisation, and resolves public projects as `public_reader`. */
  withSystem: WithSystem
  withPublicReader: WithPublicReader
  recordAudit: RecordAudit
  oauth: OAuthManagement
  /** Spec §1 `EmailTransport` for the emails a route sends itself (c-subscribers' confirmations). */
  email: EmailTransport
  /** Cloud Tasks and GCS seams for a-data-rights; tests inject deterministic doubles. */
  dataRights?: {
    enqueueExport(exportId: string): Promise<void>
    signDownload(objectPath: string, expiresAt: Date): Promise<string>
    deleteAccountExports(accountId: string): Promise<number>
  }
  /** #134 supplies the live condition reader; before it is wired, conditional shifts are `unknown`. */
  shiftConditions?: ShiftConditions
  config: () => ApiConfig
  now: () => Date
}

export type Surface = 'v1' | 'api'

export interface ApiEnv {
  // D5: an in-process `v1.fetch(req, { principal })` passes its principal here; a network request has none.
  Bindings: { principal?: Principal }
  Variables: {
    deps: ApiDeps
    surface: Surface
    operation: SkyclauseRoute
    principal: Principal | null
    /** The organisation `requireOrg` settled on, or null before it runs. */
    orgId: string | null
  }
}
