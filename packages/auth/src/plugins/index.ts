import type { BetterAuthPlugin } from 'better-auth'
import { aDeviceCode } from './a-device-code'

/**
 * #79 §7: each plugin owner writes `plugins/<key>.ts` and appends one line here. A plugin replaces the base plugin
 * with the same `id` (to configure magic link, passkeys, device code, OAuth consent or anonymous sign-in), else it is
 * added; either way the `auth` schema must not change (test/schema.test.ts). A base plugin's HTTP endpoints answer 404
 * until its owner's plugin replaces it (test/endpoints.test.ts); `auth.api` calls them on the server meanwhile. The
 * api-key plugin's own `/api-key/create` and `/api-key/update` take `metadata` from the client, which names the key's
 * account, so #106 and #128 write keys from the server and keep those two paths off.
 */
export const PLUGINS: BetterAuthPlugin[] = [aDeviceCode()]
