// The Vitest options for code that runs Better Auth: #79 §7's test database plus the test web env. Another package
// opts in with `defineProject({ test: { ...authTest } })` from `@skyclause/auth/test/harness/config`.
import { fileURLToPath } from 'node:url'
import { databaseTest } from '@skyclause/db/test/harness/config'

export const authTest = {
  globalSetup: databaseTest.globalSetup,
  setupFiles: [...databaseTest.setupFiles, fileURLToPath(new URL('./setup.ts', import.meta.url))]
}
