import { defineConfig, devices } from '@playwright/test'

const port = 3100

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bun run build && bun run start',
    env: { PORT: String(port), HOSTNAME: 'localhost' },
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
