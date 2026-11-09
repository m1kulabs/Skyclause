import { databaseTest } from '@skyclause/db/test/harness/config'
import { defineProject } from 'vitest/config'

// The #79 §7 test database for the Postgres stores, the withTenant seam and the domain services (c-subscribers' first);
// run `bun run db:up` first.
export default defineProject({ test: { name: '@skyclause/api', ...databaseTest } })
