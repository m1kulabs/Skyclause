// The web env Playwright's web server and its workers share (#94): Better Auth's test-only secret, the server's own
// origin as APP_ORIGIN (Better Auth's base URL and cookie host) and a scratch database, so signInAs mints sessions the
// server resolves. Playwright starts the web server before globalSetup, so the runner names the database here, as it
// loads the config; workers inherit the name, and global-setup.ts creates, migrates and finally drops it.
import { databaseUrls, scratchName } from '@skyclause/db/test/harness/scratch'

/** The scratch database's name, unset when E2E_BASE_URL points the suite at a deployed server. */
export const e2eDatabase = (): string | undefined => process.env.E2E_DATABASE

export function e2eEnv(origin: string) {
  process.env.E2E_DATABASE ??= scratchName('skyclause_e2e')
  return {
    APP_ENV: 'test',
    // Test-only keys: both are required to start (#93, #94).
    IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
    BETTER_AUTH_SECRET: 'test-only-better-auth-secret-for-playwright-runs',
    HOST_MODE: 'single',
    APP_ORIGIN: origin,
    E2E_DATABASE: process.env.E2E_DATABASE,
    ...databaseUrls(process.env.E2E_DATABASE)
  }
}
