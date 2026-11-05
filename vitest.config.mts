import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', { test: { name: 'repo', include: ['scripts/**/*.test.ts'] } }]
  }
})
