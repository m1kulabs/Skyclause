import { defineConfig, devices } from '@playwright/test'
import base from '../../playwright.config'

/** A separate port keeps concurrent #96 worktrees from reaching another worker's server. */
export function settingsConfig(pseudo = false) {
  const port = Number(process.env.SETTINGS_E2E_PORT ?? 49682)
  const url = `http://localhost:${port}`
  // asPage uses the same origin when setting its principal cookie.
  process.env.E2E_BASE_URL = url
  process.env.I18N_PSEUDO = pseudo ? '1' : '0'

  return defineConfig({
    ...base,
    testDir: '.',
    testIgnore: undefined,
    use: { ...base.use, baseURL: url },
    projects: [
      {
        name: pseudo ? 'settings-pseudo' : 'settings',
        testMatch: pseudo ? /pseudo\.spec\.ts$/ : /\.spec\.ts$/,
        use: { ...devices['Desktop Chrome'] }
      }
    ],
    webServer: {
      command: 'bun run build && bun run start',
      cwd: import.meta.dirname + '/../..',
      env: {
        APP_ENV: 'test',
        // A test-only key: IP_HASH_KEY is required to start (#93).
        IP_HASH_KEY: 'test-only-ip-hash-key-for-playwright-runs',
        PORT: String(port),
        HOSTNAME: 'localhost',
        PLANTED_ROUTES: '1',
        I18N_PSEUDO: pseudo ? '1' : '0'
      },
      url: `${url}/health`,
      reuseExistingServer: false,
      timeout: 180_000
    }
  })
}
