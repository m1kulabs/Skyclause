import { expect as baseExpect } from '@playwright/test'
import { test, expectAxeClean } from '../fixtures'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { projectRoute, now, setup, sourceIdsForTest } from './fixtures'

const expect = baseExpect.configure({ timeout: 15_000 })
test.describe.configure({ timeout: 60_000 })

test('SIG-1 bound sources show the captured values, finding, age, licence and source links', async ({ page }) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page)
  await page.goto(projectRoute)
  const root = page.locator('[data-signals-page]')

  await expect(root.getByText(/5 inputs reporting; oldest 12 min/)).toBeVisible()
  await expect(root.locator(`[data-source="${sourceIdsForTest.gauge}"]`)).toContainText('0232901RF')
  await expect(root.locator(`[data-source="${sourceIdsForTest.gauge}"]`)).toContainText('0.5 mm in 60 min')
  await expect(root.locator(`[data-source="${sourceIdsForTest.ca16w}"]`)).toContainText('67 API · Moderate')
  await expect(root.locator(`[data-source="${sourceIdsForTest.ca19b}"]`)).toContainText('57 API · Moderate')
  await expect(root.locator(`[data-source="${sourceIdsForTest.ca17w}"]`)).toContainText('62 API · Moderate')
  await expect(root).toContainText('Thunderstorms Warning')
  await expect(root).toContainText('21:05 MYT')
  await expect(
    root.locator(`[data-source="${sourceIdsForTest.ca16w}"]`).getByRole('link', { name: /^Publisher’s page for / })
  ).toHaveAttribute('href', 'https://eqms.doe.gov.my/mapcaqm')
  await expectZonedTimes(page)
  await expectAxeClean(page)
})

test('SIG-5 recent errors stay visible with HTTP status and errors older than 24 hours are excluded', async ({
  page
}) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page)
  await page.goto(projectRoute)
  const errors = page.locator('[data-signal-errors]')

  await expect(errors.getByText('HTTP 503')).toBeVisible()
  await expect(errors).toContainText('18:12 MYT')
  await expect(errors.getByText('HTTP 502')).toHaveCount(0)
})

test('pending, offline Pi and probation camera states include their MYT times and sample size', async ({ page }) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page, { specialStates: true })
  await page.goto(projectRoute)
  const root = page.locator('[data-signals-page]')

  await expect(root).toContainText('Pending until 21:30 MYT')
  await expect(root).toContainText('Pi offline since 20:00 MYT')
  await expect(root).toContainText('n=80')
  await expect(root).toContainText('92.5%')
  await expectZonedTimes(page)
})

test('source ages tick each minute and a repeated SSE error event is announced once', async ({ page }) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page, { streamError: true })
  await page.goto(projectRoute)
  const row = page.locator(`[data-source="${sourceIdsForTest.gauge}"]`)
  const announcement = page.locator('[data-signal-announcement]')

  await expect(row).toContainText('12 min')
  await expect(announcement).toHaveText(/CA16W.*HTTP 503/)
  await page.clock.fastForward(60_000)
  await expect(row).toContainText('13 min')
  await page.waitForTimeout(700)
  await expect(announcement).toHaveCount(1)
  await expect(announcement).toHaveText(/CA16W.*HTTP 503/)
})

test('?source=CA16W opens the station detail, keeps its URL state, table view and chart thresholds', async ({
  page
}) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page)
  await page.goto(`${projectRoute}?source=CA16W`)
  const root = page.locator('[data-signals-page]')
  const detail = root.locator('[data-source-detail]')

  await expect(detail).toBeVisible()
  await expect(detail).toContainText('CA16W')
  await expect(detail).toContainText('API 100')
  await expect(detail).toContainText('API 150')
  await expect(detail).toContainText('API 180')
  await expect(detail.locator('[data-chart-summary]')).toBeVisible()
  await expect(detail.getByRole('table')).toBeVisible()
  await expectAxeClean(page)
  await page.reload()
  await expect(page).toHaveURL(/\?source=CA16W$/)
  await expect(page.locator('[data-source-detail]')).toBeVisible()
})

test('gauge detail uses a no-window strip with a table and the copied CLI tail command works by keyboard', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.install({ time: new Date(now) })
  await setup(page)
  await page.goto(`${projectRoute}?source=0232901RF`)
  const detail = page.locator('[data-source-detail]')

  await expect(detail).toBeVisible()
  await expect(detail).toContainText('0.5 mm')
  await expect(detail).toContainText('21:00 MYT')
  await expect(detail).toContainText('no declared window')
  await expect(detail.locator('[data-readings-table] table')).toBeVisible()
  expect(await detail.locator('[data-readings-table] tbody tr').count()).toBeLessThanOrEqual(50)
  const copy = page.getByRole('button', { name: 'Copy tail command' })
  await copy.press('Enter')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('skyclause signals tail test-org/test-project')
})

test('Signals rows reflow at 320px without horizontal overflow', async ({ page }) => {
  await page.clock.install({ time: new Date(now) })
  await setup(page, { worstCase: true })
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto(projectRoute)
  const row = page.locator(`[data-source="${sourceIdsForTest.gauge}"]`)

  await expect(row.locator('td')).toHaveCount(4)
  expect(
    await row
      .locator('td')
      .first()
      .evaluate((cell) => getComputedStyle(cell).display)
  ).toBe('block')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await expect(page.locator('[data-source="019a55e0-0000-7000-8000-000000000109"]')).toContainText(
    `CA16W-${'f47ac10b58cc4372a5670e02b2c3d479'.repeat(2)}`
  )
  await expectUnclippedText(page)
  await expectAxeClean(page)
})
