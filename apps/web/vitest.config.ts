import { defineConfig } from 'vitest/config'

// Playwright owns `e2e/*.spec.ts`; Vitest runs only the unit tests.
export default defineConfig({ test: { name: '@skyclause/web', include: ['test/**/*.test.{ts,tsx}'] } })
