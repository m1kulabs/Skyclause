import type {
  Can,
  EmailTransport,
  Principal,
  RecordAudit,
  ResolvePrincipal,
  SkyclauseRoute
} from '@skyclause/contracts'
import type { withPublicReader, withSystem } from '@skyclause/db'
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
  /** Spec §1 `EmailTransport` for the emails a route sends itself (c-subscribers' confirmations). */
  email: EmailTransport
  /** Cloud Tasks and GCS seams for a-data-rights; tests inject deterministic doubles. */
  dataRights?: {
    enqueueExport(exportId: string): Promise<void>
    signDownload(objectPath: string, expiresAt: Date): Promise<string>
    deleteAccountExports(accountId: string): Promise<number>
  }
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
