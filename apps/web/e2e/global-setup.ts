// Playwright globalSetup: creates and migrates the database playwright.config.ts named (e2e/harness/env.ts), after
// `bun run db:up`, and drops it once the run ends. A run against E2E_BASE_URL has none.
import { createMigratedDatabase, dropDatabase } from '@skyclause/db/test/harness/scratch'
import { e2eDatabase } from './harness/env'

export default async function globalSetup() {
  const database = e2eDatabase()
  if (!database) return
  await createMigratedDatabase(database)
  return () => dropDatabase(database)
}
