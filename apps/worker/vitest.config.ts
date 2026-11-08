import { databaseTest } from '@skyclause/db/test/harness/config'
import { defineProject } from 'vitest/config'

// The #79 §7 test database, for the handlers that read and write Postgres (`bun run db:up` first).
export default defineProject({ test: { name: '@skyclause/worker', ...databaseTest } })
