import { databaseTest } from '@skyclause/db/test/harness/config'
import { defineProject } from 'vitest/config'

// The #79 §7 test database for the Postgres stores and the withTenant seam; run `bun run db:up` first.
export default defineProject({ test: { name: '@skyclause/api', ...databaseTest } })
