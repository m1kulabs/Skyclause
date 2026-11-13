// #194's approval-flow suite on its ephemeral stack (TRD testing; `bun run test:e2e:flow`): the base config's web server
// and scratch database, plus the worker harness (apps/worker/test/flow/server.ts) on the same environment, which the
// base config assigned to process.env. The base config leaves e2e/flow to this one.
import './ports'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import base from '../../playwright.config'

const web = path.join(import.meta.dirname, '../..')
const { webServer } = base
if (!webServer || Array.isArray(webServer)) throw new Error('the flow suite starts its own stack; unset E2E_BASE_URL')

export default defineConfig({
  ...base,
  testDir: import.meta.dirname,
  testIgnore: undefined,
  outputDir: path.join(web, 'test-results'),
  // One at a time: a worker batch acts on every project in the database, other specs' included.
  workers: 1,
  projects: [{ name: 'flow', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    // Never another worktree's server: its database isn't this run's.
    { ...webServer, cwd: web, reuseExistingServer: false },
    {
      command: 'bun ../worker/test/flow/server.ts',
      cwd: web,
      url: `http://127.0.0.1:${process.env.E2E_WORKER_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
})
