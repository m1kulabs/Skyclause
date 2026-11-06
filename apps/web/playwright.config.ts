import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { e2eEnv } from './e2e/harness/env'

// Separate worktrees can run acceptance checks concurrently without reusing another build.
const port = Number(process.env.E2E_PORT ?? 3100)
// deploy.yml points the @smoke tests at the deployed web service; otherwise the suite builds and starts its own.
const deployed = process.env.E2E_BASE_URL
const pseudo = process.env.I18N_PSEUDO === '1'
// #94: the web server and the workers' signInAs share Better Auth's test secret, APP_ORIGIN and a scratch database
// (e2e/harness/env.ts), never a real one.
const shared = deployed ? undefined : e2eEnv(`http://localhost:${port}`)
if (shared) Object.assign(process.env, shared)

// Pull requests run Chromium only (#116, GitHub Free minutes); `QUALITY_BROWSERS=all` adds Firefox and WebKit
// at desktop and iPhone sizes, on `main` and nightly.
const allBrowsers = process.env.QUALITY_BROWSERS === 'all'
// Firefox and WebKit run the crawl and the checks' self-tests, JS-off the crawl; the rest run once, in Chromium.
const crawl = /quality\/(crawl|checks)\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  // Absolute: e2e/settings and e2e/palette spread this config from their own directories.
  globalSetup: path.join(import.meta.dirname, 'e2e/global-setup.ts'),
  // Allow constrained development machines to run the same matrix without competing browser workers.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  forbidOnly: !!process.env.CI,
  timeout: process.env.E2E_TIMEOUT ? Number(process.env.E2E_TIMEOUT) : 30_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: deployed ?? `http://localhost:${port}` },
  testIgnore: pseudo ? undefined : [/(?:quality|camera)\/pseudo\.spec\.ts$/, /bundles\/mobile\.spec\.ts$/],
  projects: pseudo
    ? [
        {
          name: 'pseudo',
          testMatch:
            /(?:quality\/pseudo|connect\/connect|camera\/pseudo|brand\/badge|bundles\/bundle|alerts\/pseudo|windows\/(?:windows|form))\.spec\.ts$/,
          use: { ...devices['Desktop Chrome'] }
        }
      ]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        // NFR-13: public pages readable without JavaScript.
        {
          name: 'chromium-no-js',
          testMatch: /quality\/crawl\.spec\.ts$/,
          use: { ...devices['Desktop Chrome'], javaScriptEnabled: false }
        },
        {
          name: 'bundle-mobile',
          testMatch: /bundles\/mobile\.spec\.ts$/,
          testIgnore: [],
          dependencies: ['chromium', 'chromium-no-js'],
          use: { ...devices['Desktop Chrome'] }
        },
        ...(allBrowsers
          ? [
              { name: 'firefox', testMatch: crawl, use: { ...devices['Desktop Firefox'] } },
              { name: 'webkit', testMatch: crawl, use: { ...devices['Desktop Safari'] } },
              { name: 'iphone', testMatch: crawl, use: { ...devices['iPhone 15'] } }
            ]
          : [])
      ],
  webServer: deployed
    ? undefined
    : {
        command: 'bun run build && bun run start',
        // PLANTED_ROUTES builds the test-only `page.plant.tsx` routes the quality suites assert on.
        env: {
          ...shared,
          PORT: String(port),
          HOSTNAME: 'localhost',
          PLANTED_ROUTES: '1',
          I18N_PSEUDO: pseudo ? '1' : '0'
        },
        url: `http://localhost:${port}/health`,
        reuseExistingServer: !process.env.CI && !pseudo,
        timeout: 180_000
      }
})
