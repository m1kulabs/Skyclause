import type { BetterAuthPlugin } from 'better-auth'
import type { AuthSettings } from '../instance'
import { apiKeyPlugin } from './a-api-keys'
import { aAuthSignInApi } from './a-auth-signin-api'
import { aDeviceCode } from './a-device-code'
import { eMcpAuth } from './e-mcp-auth'

/** #79 §7: each plugin owner appends one settings-aware plugin factory here. */
export const PLUGINS = (settings: AuthSettings): BetterAuthPlugin[] => [
  aDeviceCode(),
  apiKeyPlugin,
  eMcpAuth(settings),
  aAuthSignInApi()
]
