import { test, expect } from '../fixtures'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

test('camera 30% pseudo copy fits at 320 px and 200% text size', async ({ page, expectAxeClean }) => {
  await page.goto('/camera-test-org/window-project/camera/test-source')
  await expect(page.locator('#device-token')).toBeVisible()
  await expect(page.locator('h1')).toContainText('Skyline camera~~~~')
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.locator('html').evaluate((root) => {
    root.style.fontSize = '200%'
  })
  await expectUnclippedText(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expectAxeClean(page)
})
