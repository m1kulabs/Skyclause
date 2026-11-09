// Vitest setupFiles: every test file runs with the test web env.
import { TEST_AUTH_ENV } from './env'

for (const [name, value] of Object.entries(TEST_AUTH_ENV)) process.env[name] = value
