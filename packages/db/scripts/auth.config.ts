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
  // #79 §3's columns on Better Auth tables (#92); #94's runtime config declares the same additionalFields.
  user: {
    additionalFields: {
      preferences: { type: 'json', required: false },
      magicLinkEnabled: { type: 'boolean', required: true, defaultValue: true },
      deletedAt: { type: 'date', required: false },
      lastActiveAt: { type: 'date', required: false }
    }
  },
  session: { additionalFields: { reauthenticatedAt: { type: 'date', required: false } } },
  plugins: [
    organization({
      schema: {
        organization: {
          additionalFields: {
            plan: { type: ['community', 'team', 'campus', 'commons'], required: true, defaultValue: 'community' },
            deletionRequestedAt: { type: 'date', required: false },
            purgeAfter: { type: 'date', required: false },
            onboardingSkipped: { type: 'json', required: true, defaultValue: [] },
            aiFallbackEnabled: { type: 'boolean', required: true, defaultValue: false },
            allowMemberAiKeys: { type: 'boolean', required: true, defaultValue: false }
          }
        },
        member: { additionalFields: { readsMalay: { type: 'boolean', required: true, defaultValue: false } } },
        invitation: { additionalFields: { tokenHash: { type: 'string', required: false } } }
      }
    }),
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
