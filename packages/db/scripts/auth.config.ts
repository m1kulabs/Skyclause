// Generation only: `generate-auth.ts` points the Better Auth CLI at this config to write `src/schema/auth.ts`. It never
// serves requests; #94 builds the real instance with exactly this plugin set (#91's ticket decision).
import { apiKey } from '@better-auth/api-key'
import { cimd } from '@better-auth/cimd'
import { mcp } from '@better-auth/mcp'
import { passkey } from '@better-auth/passkey'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { anonymous, bearer, deviceAuthorization, jwt, organization } from 'better-auth/plugins'

// Annotated: the inferred type is too large for tsc to emit.
export const auth: { options: BetterAuthOptions } = betterAuth({
  // The MCP plugin reads origins at init; these are the production hosts (#79 §4).
  baseURL: 'https://app.skyclause.m1ku.tech',
  advanced: { database: { generateId: 'uuid' } },
  plugins: [
    organization(),
    anonymous(),
    apiKey({ references: 'organization' }),
    passkey(),
    deviceAuthorization(),
    bearer(),
    // @better-auth/mcp 1.7.17 requires jwt: it signs the ID and access tokens that resource servers check against /jwks.
    jwt({ disableSettingJwtHeader: true }),
    mcp({ loginPage: '/sign-in', consentPage: '/consent', resource: 'https://mcp.skyclause.m1ku.tech/mcp' }),
    cimd({
      fetchClientMetadataResource: () => Promise.reject(new Error('generation-only config')),
      metadataProfile: 'mcp-2026-07-28'
    })
  ]
})
