import { loadEnv } from '@skyclause/config'
import { recordAudit } from '@skyclause/db'
import type { ApiConfig, ApiDeps } from './context'
import { registeredPermission, registeredPrincipal } from './middleware/auth'
import { idempotencyStore, membership, rateLimitStore } from './placeholders/f-api'
import { withTenant } from './placeholders/f-db'

let config: ApiConfig | undefined

/** Read on the first request, never at import, so a build or a test can load the package without the web env. */
function loadConfig(): ApiConfig {
  const env = loadEnv('web')
  return { appEnv: env.APP_ENV, appOrigin: env.APP_ORIGIN, ipHashKey: env.IP_HASH_KEY }
}

export const productionDeps: ApiDeps = {
  resolvePrincipal: registeredPrincipal,
  can: registeredPermission,
  membership,
  idempotency: idempotencyStore,
  rateLimits: rateLimitStore,
  withTenant,
  recordAudit,
  config: () => (config ??= loadConfig()),
  now: () => new Date()
}
