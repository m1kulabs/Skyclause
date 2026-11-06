import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 3100)
// deploy.yml points the @smoke tests at the deployed web service; otherwise the suite builds and starts its own.
const deployed = process.env.E2E_BASE_URL
const pseudo = process.env.I18N_PSEUDO === '1'

// Pull requests run Chromium only (#116, GitHub Free minutes); `QUALITY_BROWSERS=all` adds Firefox and WebKit
// at desktop and iPhone sizes, on `main` and nightly.
const allBrowsers = process.env.QUALITY_BROWSERS === 'all'
// Firefox and WebKit run the crawl and the checks' self-tests, JS-off the crawl; the rest run once, in Chromium.
const crawl = /quality\/(crawl|checks)\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  // Allow constrained development machines to run the same matrix without competing browser workers.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  forbidOnly: !!process.env.CI,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  timeout: process.env.E2E_TIMEOUT ? Number(process.env.E2E_TIMEOUT) : 30_000,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: deployed ?? `http://localhost:${port}` },
  testIgnore: pseudo ? undefined : /(?:quality|camera)\/pseudo\.spec\.ts$/,
  projects: pseudo
    ? [
        {
          name: 'pseudo',
          testMatch: /(?:quality\/pseudo|connect\/connect|camera\/pseudo|brand\/badge)\.spec\.ts$/,
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
          APP_ENV: 'test',
          HOST_MODE: 'single',
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
