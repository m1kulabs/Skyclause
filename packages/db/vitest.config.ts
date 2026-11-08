import { configDefaults, defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@skyclause/db',
    // The #79 §7 test database; other packages spread `databaseTest` from @skyclause/db/test/harness/config instead.
    globalSetup: ['test/harness/global-setup.ts'],
    setupFiles: ['test/harness/worker-setup.ts'],
    // test/isolation runs in its own two-worker Vitest from isolation.test.ts.
    exclude: [...configDefaults.exclude, 'test/isolation/**']
  }
})
