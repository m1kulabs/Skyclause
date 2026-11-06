import { test, expect } from '../fixtures'
import type { Page } from '@playwright/test'
import { stubApi } from '../harness/stub-api'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { cameraOperations } from '../../features/camera/operations'

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
})

const path = '/camera-test-org/window-project/camera/test-source'
const response = {
  source_id: 'test-source',
  accepted: 1,
  received_at: '2026-11-05T23:15:01Z',
  camera_day_start: '07:15',
  camera_day_end: '19:00'
}

async function configure(page: Page, keyboard = false) {
  await page.goto(path)
  await expect(page.locator('#device-token')).toBeVisible()
  const open = page.getByRole('button', { name: /Allow camera/ })
  await open.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Capture clear-day reference/ })).toBeEnabled()
  const fields: Record<string, string> = {
    'device-token': 'test-device-token',
    'distance-km': '2.5',
    'near-x': '5',
    'near-y': '5',
    'near-width': '40',
    'near-height': '30',
    'far-x': '1',
    'far-y': '1',
    'far-width': '98',
    'far-height': '60'
  }
  for (const [id, value] of Object.entries(fields)) {
    const field = page.locator(`#${id}`)
    if (keyboard) {
      await field.focus()
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.insertText(value)
    } else await field.fill(value)
  }
  const reference = page.getByRole('button', { name: /Capture clear-day reference/ })
  await reference.focus()
  await page.keyboard.press('Enter')
  await expect(reference).toBeDisabled()
  await page.locator('[name="camera_consent"]').focus()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: /Save and start/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-camera-status]')).toContainText(/Setup saved|Posted|After dusk/)
}

async function clock(page: Page, time = '2026-11-06T07:14:00+08:00') {
  const at = new Date(time)
  await page.clock.install({ time: new Date(at.getTime() - 1000) })
  await page.clock.pauseAt(at)
}

test('SIG-8: three offline marks post in capture order with original times and buffered true', async ({
  page,
  context
}) => {
  await clock(page)
  await stubApi(page, 'ingestReadings', response, { registry: cameraOperations })
  const posts: Array<{
    time: string
    buffered: boolean
    id: string
    auth: string | undefined
    key: string | undefined
  }> = []
  page.on('request', (request) => {
    if (!request.url().includes('/v1/ingest/')) return
    const reading = request.postDataJSON()
    posts.push({
      time: reading.device_time,
      buffered: reading.buffered,
      id: reading.capture_id,
      auth: request.headers().authorization,
      key: request.headers()['idempotency-key']
    })
  })
  await configure(page)
  await context.setOffline(true)
  for (const [i, minutes] of [1, 10, 10].entries()) {
    await page.clock.fastForward(minutes * 60_000)
    await expect(page.locator('[data-camera-queue]')).toContainText(`n=${i + 1}`)
  }
  expect(posts).toHaveLength(0)
  await context.setOffline(false)
  await expect.poll(() => posts.length).toBe(3)
  expect(posts.map((post) => post.time)).toEqual(
    ['07:15', '07:25', '07:35'].map((at) => `2026-11-06T${at}:00.000+08:00`)
  )
  expect(posts.every((post) => post.buffered && post.auth === 'Bearer test-device-token' && post.id === post.key)).toBe(
    true
  )
  expect(posts.map((post) => post.id)).toEqual([...posts.map((post) => post.id)].sort())
  await expect(page.locator('[data-camera-queue]')).toContainText('n=0')
  await expectZonedTimes(page)
})

test('no capture or post before dawn or at dusk; server daylight replaces local hours', async ({ page }) => {
  await clock(page)
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/v1/ingest/')) posts.push(request.postData()!)
  })
  await stubApi(
    page,
    'ingestReadings',
    { ...response, camera_day_start: '08:15', camera_day_end: '18:00' },
    { registry: cameraOperations }
  )
  await configure(page)
  expect(posts).toHaveLength(0)
  await page.clock.fastForward(60_000)
  await expect.poll(() => posts.length).toBe(1)
  await page.clock.fastForward(10 * 60_000)
  await expect(page.locator('[data-camera-status]')).toContainText(/After dusk.*08:15 MYT/)
  expect(posts).toHaveLength(1)
  await page.clock.fastForward(11 * 60 * 60_000)
  await expect(page.locator('[data-camera-status]')).toContainText(/After dusk/)
  expect(posts).toHaveLength(1)
})

test('service worker reloads offline with queue, reference and setup intact', async ({ page, context }) => {
  await clock(page)
  await configure(page)
  await expect(page.locator('[data-offline-ready]')).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.clock.fastForward(60_000)
  await expect(page.locator('[data-camera-queue]')).toContainText('n=1')
  await page.reload()
  await expect(page.locator('#device-token')).toHaveValue('test-device-token')
  await expect(page.locator('[data-camera-queue]')).toContainText('n=1')
  await expect(page.getByRole('button', { name: /Capture clear-day reference/ })).toBeDisabled()
  expect(await page.locator('h1').count()).toBe(1)
  expect(await page.locator('[data-app-shell]').count()).toBe(0)
})

for (const mode of [
  { theme: 'dark', contrast: 'standard' },
  { theme: 'light', contrast: 'standard' },
  { theme: 'dark', contrast: 'more' },
  { theme: 'light', contrast: 'more' }
]) {
  test(`keyboard setup and axe: ${mode.theme} ${mode.contrast}`, async ({ page, baseURL, expectAxeClean }) => {
    await page.context().addCookies([{ url: baseURL!, name: 'skyclause-test-appearance', value: JSON.stringify(mode) }])
    await page.clock.setFixedTime(new Date('2026-11-06T07:14:00+08:00'))
    await configure(page, true)
    await expectAxeClean(page)
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await expectUnclippedText(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.screenshot({ path: `test-results/camera-${mode.theme}-${mode.contrast}.png`, fullPage: true })
  })
}

test('permission denial has an actionable, polite state and never posts', async ({ page, context }) => {
  await context.clearPermissions()
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('test denial', 'NotAllowedError')
    }
  })
  await page.goto(path)
  await page.getByRole('button', { name: /Allow camera/ }).click()
  await expect(page.locator('[data-camera-status]')).toContainText('Camera off: permission denied.')
  await expect(page.locator('[data-camera-status]')).toHaveAttribute('aria-live', 'polite')
})

test('camera manifest and worker belong only to this camera path', async ({ page }) => {
  const manifest = await page.request.get(`${path}/manifest.webmanifest`)
  expect(await manifest.json()).toMatchObject({ start_url: path, scope: path, display: 'standalone' })
  const worker = await page.request.get(`${path}/worker.js`)
  expect(worker.headers()['service-worker-allowed']).toBe(path)
  expect(worker.headers()['content-type']).toContain('application/javascript')
})

test('wake lock release is announced once and visibility requests it again', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { requests: 0, lock: null as (EventTarget & { release(): Promise<void>; released: boolean }) | null }
    Object.defineProperty(window, '__cameraWake', { value: state })
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: async () => {
          state.requests++
          const target = new EventTarget()
          const lock = Object.assign(target, {
            released: false,
            async release() {
              this.released = true
              target.dispatchEvent(new Event('release'))
            }
          })
          state.lock = lock
          return lock
        }
      }
    })
  })
  await page.goto(path)
  await page.getByRole('button', { name: /Allow camera/ }).click()
  await expect(page.getByText('Screen wake lock held.', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    const state = (window as unknown as { __cameraWake: { lock: { release(): Promise<void> } } }).__cameraWake
    await state.lock.release()
  })
  await expect(page.locator('[data-camera-status]')).toContainText('Screen lock released:')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Screen wake lock held.', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() => (window as unknown as { __cameraWake: { requests: number } }).__cameraWake.requests)
  ).toBe(2)
})

test('unsupported camera explains the supported browser path', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined })
  })
  await page.goto(path)
  await page.getByRole('button', { name: /Allow camera/ }).click()
  await expect(page.locator('[data-camera-status]')).toContainText('Camera not supported here.')
})
