// The browser's Better Auth client on the page's own origin (`/api/auth/*`, host-only cookies on APP_ORIGIN), with
// the client half of each base plugin. Sign-in pages (#97, #98) and session settings (#99) use it.
import { apiKeyClient } from '@better-auth/api-key/client'
import { passkeyClient } from '@better-auth/passkey/client'
import { createAuthClient } from 'better-auth/client'
import {
  anonymousClient,
  deviceAuthorizationClient,
  magicLinkClient,
  organizationClient
} from 'better-auth/client/plugins'
import { ac, roles } from './access'

export const authClient = createAuthClient({
  plugins: [
    organizationClient({ ac, roles }),
    anonymousClient(),
    apiKeyClient(),
    magicLinkClient(),
    passkeyClient(),
    deviceAuthorizationClient()
  ]
})
