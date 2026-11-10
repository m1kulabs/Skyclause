import { loadEnv } from '@skyclause/config'
import type { EmailTransport } from '@skyclause/contracts'
import { recordAudit, track, withTenant } from '@skyclause/db'
import { emailTransportForAws } from '@skyclause/delivery'
import type { ApiConfig, ApiDeps } from './context'
import { registeredPermission, registeredPrincipal } from './middleware/auth'
import { postgresIdempotency, postgresMembership, postgresRateLimits } from './postgres-stores'
import { registeredApiKeyManager } from './api-key-manager'

let config: ApiConfig | undefined

/** Read on the first request, never at import, so a build or a test can load the package without the web env. */
function loadConfig(): ApiConfig {
  const env = loadEnv('web')
  return {
    appEnv: env.APP_ENV,
    appOrigin: env.APP_ORIGIN,
    ipHashKey: env.IP_HASH_KEY,
    marketingOrigin: env.MARKETING_ORIGIN,
    vapidPublicKey: env.VAPID_PUBLIC_KEY
  }
}

let ses: EmailTransport | undefined

/** SES as `web` (#113), built on the first send; until gate 4B its variables are unset and mail is off. */
function loadEmail(): EmailTransport {
  const env = loadEnv('web')
  const { SES_REGION, AWS_ROLE_ARN, SES_CONFIGURATION_SET, EMAIL_FROM_AUTH, EMAIL_FROM_NOTICES } = env
  if (!SES_REGION || !AWS_ROLE_ARN || !SES_CONFIGURATION_SET || !EMAIL_FROM_AUTH || !EMAIL_FROM_NOTICES) {
    throw new Error('email is off: the SES variables are unset until gate 4B')
  }
  return emailTransportForAws({
    region: SES_REGION,
    roleArn: AWS_ROLE_ARN,
    configurationSet: SES_CONFIGURATION_SET,
    fromAuth: EMAIL_FROM_AUTH,
    fromNotices: EMAIL_FROM_NOTICES
  })
}

export const productionDeps: ApiDeps = {
  resolvePrincipal: registeredPrincipal,
  can: registeredPermission,
  membership: postgresMembership,
  idempotency: postgresIdempotency,
  rateLimits: postgresRateLimits,
  withTenant,
  recordAudit,
  apiKeys: registeredApiKeyManager,
  track,
  email: { send: (message) => (ses ??= loadEmail()).send(message) },
  config: () => (config ??= loadConfig()),
  now: () => new Date()
}
