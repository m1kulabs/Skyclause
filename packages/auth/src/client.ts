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

const plugins = [
  organizationClient({ ac, roles }),
  anonymousClient(),
  apiKeyClient(),
  magicLinkClient(),
  passkeyClient(),
  deviceAuthorizationClient()
] satisfies [
  ReturnType<typeof organizationClient>,
  ReturnType<typeof anonymousClient>,
  ReturnType<typeof apiKeyClient>,
  ReturnType<typeof magicLinkClient>,
  ReturnType<typeof passkeyClient>,
  ReturnType<typeof deviceAuthorizationClient>
]
const options = { plugins }

export const authClient = createAuthClient(options)
