import { defineConfig, devices } from '@playwright/test'

const port = 3100

// Pull requests run Chromium only (#116, GitHub Free minutes); `QUALITY_BROWSERS=all` adds Firefox and WebKit
// at desktop and iPhone sizes, on `main` and nightly.
const allBrowsers = process.env.QUALITY_BROWSERS === 'all'
// Firefox and WebKit run the crawl and the checks' self-tests, JS-off the crawl; the rest run once, in Chromium.
const crawl = /quality\/(crawl|checks)\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [
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
  webServer: {
    command: 'bun run build && bun run start',
    // PLANTED_ROUTES builds the test-only `page.plant.tsx` routes the quality suites assert on.
    env: { APP_ENV: 'test', PORT: String(port), HOSTNAME: 'localhost', PLANTED_ROUTES: '1' },
    url: `http://localhost:${port}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
