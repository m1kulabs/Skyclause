import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'
import { join, resolve } from 'node:path'

const VIDEO_ROOT = resolve(import.meta.dirname, '..')
const STORAGE_STATE = join(VIDEO_ROOT, 'record/.state/google.json')

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})
  .formatToParts(new Date())
  .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {})
process.env.SKYCLAUSE_RUN_ID = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${randomUUID().slice(0, 8)}`

export default defineConfig({
  testDir: '.',
  testMatch: /takes\.rec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 5 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: `${VIDEO_ROOT}/record/.state/test-results`,
  use: {
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    timezoneId: 'Asia/Kuala_Lumpur',
    ...(existsSync(STORAGE_STATE) ? { storageState: STORAGE_STATE } : {}),
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--disable-audio-output'] },
    trace: 'off',
    video: 'off',
    screenshot: 'off'
  }
})
