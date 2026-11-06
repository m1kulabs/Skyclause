import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import config from '../../playwright.config'

// The main pseudo project discovers routes but cannot open their dialogs. Exercise these interactions too.
export default defineConfig({
  ...config,
  testDir: path.resolve(import.meta.dirname, '..'),
  projects: [
    {
      name: 'set7-pseudo',
      testMatch: /(?:set-7|palette)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
