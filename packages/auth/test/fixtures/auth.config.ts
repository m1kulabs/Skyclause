// The runtime configuration, with every registered plugin, for the Better Auth CLI's schema generation
// (test/schema.test.ts). It reads the test web env and DATABASE_URL_AUTH from the spawning test.
import type { BetterAuthOptions } from 'better-auth'
import { authSettings, createAuth } from '../../src/instance'

// Annotated: the inferred type is too large for tsc to emit.
export const auth: { options: BetterAuthOptions } = createAuth(authSettings())
