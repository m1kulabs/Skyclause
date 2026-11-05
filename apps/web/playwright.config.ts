import { defineConfig, devices } from '@playwright/test'

const port = 3100
// deploy.yml points the @smoke tests at the deployed web service; otherwise the suite builds and starts its own.
const deployed = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: deployed ?? `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: deployed
    ? undefined
    : {
        command: 'bun run build && bun run start',
        env: { APP_ENV: 'test', PORT: String(port), HOSTNAME: 'localhost' },
        url: `http://localhost:${port}/healthz`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
      }
})
