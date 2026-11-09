import { defineConfig } from 'vitest/config'

// Run only by isolation.test.ts: two files in two workers at once, on the db package's harness.
export default defineConfig({
  test: {
    include: ['test/isolation/*.fixture.ts'],
    globalSetup: ['test/harness/global-setup.ts'],
    setupFiles: ['test/harness/worker-setup.ts'],
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true
  }
})
