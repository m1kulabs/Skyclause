import { databaseTest } from '@skyclause/db/test/harness/config'
import { defineConfig } from 'vitest/config'

// Playwright owns `e2e/*.spec.ts`; Vitest runs only the unit tests. #79 §7's template database is migrated once; a
// test file that resolves real credentials imports `@skyclause/auth/test/harness/database` for its own copy
// (`bun run db:up` first), since the jsdom tests can't run the database setup.
export default defineConfig({
  test: { name: '@skyclause/web', include: ['test/**/*.test.{ts,tsx}'], globalSetup: databaseTest.globalSetup }
})
