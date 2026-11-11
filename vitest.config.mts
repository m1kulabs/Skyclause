import { defineConfig } from 'vitest/config'

// Tests never reach Resend: a shell that exports RESEND_API_KEY would hand it to every test process, which inherits
// this one's environment, and web and worker refuse the key without its sender addresses.
delete process.env.RESEND_API_KEY

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      { test: { name: 'repo', include: ['scripts/**/*.test.ts', 'scripts/**/*.test.mjs'] } }
    ]
  }
})
