import type { BetterAuthPlugin } from 'better-auth'
import type { AuthSettings } from '../instance'
import { aDeviceCode } from './a-device-code'
import { eMcpAuth } from './e-mcp-auth'

/** #79 §7: each plugin owner appends one settings-aware plugin factory here. */
export const PLUGINS = (settings: AuthSettings): BetterAuthPlugin[] => [aDeviceCode(), eMcpAuth(settings)]
