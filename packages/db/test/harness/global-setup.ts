// Vitest globalSetup: migrates one template database per test project with the deploy's own `migrate()`.
import type { TestProject } from 'vitest/node'
import { migrate } from '../../src/migrate'
import { localUrl, migrationsFolder } from '../../scripts/local'
import { asLogin, createDatabase, dropDatabase } from '.'

declare module 'vitest' {
  export interface ProvidedContext {
    dbTemplate: string
  }
}

export default async function setup(project: TestProject) {
  const template = `skyclause_t_${process.pid}_${Date.now().toString(36)}`
  try {
    await createDatabase(template)
  } catch (error) {
    throw new Error(`the test database at ${localUrl('postgres').split('@')[1]} is unreachable; run bun run db:up`, {
      cause: error
    })
  }
  await migrate(localUrl('migrator', template), migrationsFolder)
  project.provide('dbTemplate', template)
  return async () => {
    const { rows } = await asLogin(
      'postgres',
      (admin) =>
        admin.query<{ datname: string }>('SELECT datname FROM pg_database WHERE datname LIKE $1', [`${template}%`]),
      'postgres'
    )
    for (const { datname } of rows) await dropDatabase(datname)
  }
}
