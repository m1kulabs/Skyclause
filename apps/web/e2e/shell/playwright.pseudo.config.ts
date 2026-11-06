import { defineConfig } from '@playwright/test'
import base from '../../playwright.config'

// The main pseudo project targets the quality crawl; this runs the shell matrix against its pseudo build.
export default defineConfig({
  ...base,
  testDir: '.',
  testIgnore: undefined,
  projects: [{ name: 'shell-pseudo', testMatch: /shell\.spec\.ts$/ }]
})
