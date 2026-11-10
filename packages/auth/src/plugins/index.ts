import type { EmailTransport } from '@skyclause/contracts'
import type { BetterAuthPlugin } from 'better-auth'
import type { AuthSettings } from '../instance'
import { aAccountSettings } from './a-account-settings'
import { apiKeyPlugin } from './a-api-keys'
import { aAuthSignInApi } from './a-auth-signin-api'
import { aDeviceCode } from './a-device-code'
import { aStepUp } from './a-step-up'
import { eMcpAuth } from './e-mcp-auth'

/** Test doubles `createAuth` passes through to an owner's plugin. */
export interface PluginOverrides {
  sendStepUpEmail?: EmailTransport['send']
}

/** #79 §7: each plugin owner appends one settings-aware plugin factory here. */
export const PLUGINS = (settings: AuthSettings, overrides: PluginOverrides = {}): BetterAuthPlugin[] => [
  aDeviceCode(),
  apiKeyPlugin,
  eMcpAuth(settings),
  aAuthSignInApi(),
  aStepUp({ appOrigin: settings.appOrigin, ipHashKey: settings.ipHashKey, sendEmail: overrides.sendStepUpEmail }),
  aAccountSettings
]
