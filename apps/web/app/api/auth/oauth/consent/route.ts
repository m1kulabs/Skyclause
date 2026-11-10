import { createOAuthConsentHandler } from '@skyclause/api'
import { completeOAuthConsent, resolvePrincipal } from '@skyclause/auth'
import { loadEnv } from '@skyclause/config'

export const POST = createOAuthConsentHandler({
  resolvePrincipal,
  completeConsent: completeOAuthConsent,
  appOrigin: () => {
    const origin = loadEnv('web').APP_ORIGIN
    if (!origin) throw new Error('APP_ORIGIN is required for OAuth consent.')
    return origin
  }
})
