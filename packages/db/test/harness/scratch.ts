// A migrated database for a test runner without Vitest's globalSetup: Playwright's web server and workers (#94) share
// one, named before the server starts. Same local container and `migrate()` as global-setup.ts; used only in tests.
import { migrate } from '../../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder, scratchName } from '../../scripts/local'

export { dropDatabase, scratchName }

/** #79 §6's DATABASE_URL_* for `database`, each on its own local login, as worker-setup.ts points them. */
export function databaseUrls(database: string) {
  return {
    DATABASE_URL_APP: localUrl('app', database),
    DATABASE_URL_AUTH: localUrl('auth_app', database),
    DATABASE_URL_SYSTEM: localUrl('system', database),
    DATABASE_URL_RETENTION: localUrl('retention', database),
    DATABASE_URL_MIGRATE: localUrl('migrator', database)
  }
}

/** Creates `database` on the local container and applies every migration to it. */
export async function createMigratedDatabase(database: string): Promise<void> {
  try {
    await createDatabase(database)
  } catch (error) {
    throw new Error(`the test database at ${localUrl('postgres').split('@')[1]} is unreachable; run bun run db:up`, {
      cause: error
    })
  }
  await migrate(localUrl('migrator', database), migrationsFolder)
}
