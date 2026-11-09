// The web env Better Auth reads (#79 §6), with test-only values. The production hosts make the cookies `__Secure-`
// and the OAuth audiences real; no request leaves the process.
export const TEST_AUTH_ENV = {
  APP_ENV: 'test',
  BETTER_AUTH_SECRET: 'test-only-better-auth-secret-for-vitest-runs',
  IP_HASH_KEY: 'test-only-ip-hash-key-for-vitest-runs-only',
  APP_ORIGIN: 'https://app.skyclause.m1ku.tech',
  API_ORIGIN: 'https://api.skyclause.m1ku.tech',
  MCP_ORIGIN: 'https://mcp.skyclause.m1ku.tech'
} as const
