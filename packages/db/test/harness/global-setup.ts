// Vitest globalSetup: migrates one template database per test project with the deploy's own `migrate()`.
import type { TestProject } from 'vitest/node'
import { migrate } from '../../src/migrate'
import { createDatabase, dropDatabase, localUrl, migrationsFolder, scratchName, withLocal } from '../../scripts/local'

declare module 'vitest' {
  export interface ProvidedContext {
    dbTemplate: string
  }
}

export default async function setup(project: TestProject) {
  const template = scratchName('skyclause_t')
  try {
    await createDatabase(template)
  } catch (error) {
    throw new Error(`the test database at ${localUrl('postgres').split('@')[1]} is unreachable; run bun run db:up`, {
      cause: error
    })
  }
  await migrate(localUrl('migrator', template), migrationsFolder).catch((error: unknown) => {
    // 0004 grants neon_superuser's data roles, which an older data directory's init.sql never gave migrator.
    if (!String(error).includes('permission denied to grant role')) throw error
    throw new Error(
      'migrator may not grant the data roles: if the container predates the pg_partman 5.1.0 image, recreate it: ' +
        'docker compose -f packages/db/compose.yaml down -v && bun run db:up',
      { cause: error }
    )
  })
  project.provide('dbTemplate', template)
  return async () => {
    const { rows } = await withLocal('postgres', 'postgres', (admin) =>
      admin.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datname LIKE $1', [`${template}%`])
    )
    for (const { datname } of rows) await dropDatabase(datname)
  }
}
