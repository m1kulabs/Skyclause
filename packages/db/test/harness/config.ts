// The Vitest options that give a package the #79 §7 test database. Another package opts in with
// `defineProject({ test: { ...databaseTest } })` from `@skyclause/db/test/harness/config`, after `bun run db:up`.
import { fileURLToPath } from 'node:url'

export const databaseTest = {
  globalSetup: [fileURLToPath(new URL('./global-setup.ts', import.meta.url))],
  setupFiles: [fileURLToPath(new URL('./worker-setup.ts', import.meta.url))]
}
