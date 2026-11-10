import { apiKey } from '@better-auth/api-key'

// #106: first-party routes create and manage these; the Better Auth HTTP endpoints remain disabled.
export const apiKeyPlugin: ReturnType<typeof apiKey> = apiKey({
  references: 'organization',
  defaultPrefix: 'skc_',
  enableMetadata: true,
  requireName: true,
  rateLimit: { enabled: false }
})
