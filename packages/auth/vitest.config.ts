import { defineProject } from 'vitest/config'
import { authTest } from '@skyclause/auth/test/harness/config'

// #79 §7's test database and the test web env (`bun run db:up` first).
export default defineProject({ test: { name: '@skyclause/auth', ...authTest } })
