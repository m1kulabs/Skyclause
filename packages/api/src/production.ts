import { loadEnv } from '@skyclause/config'
import { recordAudit, track, withPublicReader, withSystem, withTenant } from '@skyclause/db'
import { requireEmailTransport } from '@skyclause/delivery'
import type { ApiConfig, ApiDeps } from './context'
import { registeredPermission, registeredPrincipal } from './middleware/auth'
import { registeredOAuthManagement } from './middleware/oauth'
import { postgresIdempotency, postgresMembership, postgresRateLimits } from './postgres-stores'
import { createDataRightsTransports } from './services/data-rights/transports'
import { registeredApiKeyManager } from './api-key-manager'

import { configureProductionEvaluator } from './services/evaluator/production'

configureProductionEvaluator()

let config: ApiConfig | undefined

/** Read on the first request, never at import, so a build or a test can load the package without the web env. */
function loadConfig(): ApiConfig {
  const env = loadEnv('web')
  return {
    appEnv: env.APP_ENV,
    appOrigin: env.APP_ORIGIN,
    mcpOrigin: env.MCP_ORIGIN,
    ipHashKey: env.IP_HASH_KEY,
    marketingOrigin: env.MARKETING_ORIGIN,
    vapidPublicKey: env.VAPID_PUBLIC_KEY
  }
}

export const productionDeps: ApiDeps = {
  resolvePrincipal: registeredPrincipal,
  can: registeredPermission,
  membership: postgresMembership,
  idempotency: postgresIdempotency,
  rateLimits: postgresRateLimits,
  withTenant,
  withSystem,
  withPublicReader,
  recordAudit,
  oauth: registeredOAuthManagement,
  apiKeys: registeredApiKeyManager,
  track,
  email: { send: (message) => requireEmailTransport('web').send(message) },
  dataRights: createDataRightsTransports(),
  config: () => (config ??= loadConfig()),
  now: () => new Date()
}
