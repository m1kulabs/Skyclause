import { expect, test } from '@playwright/test'
import { builtRoutes } from './routes'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'

for (const route of builtRoutes()) {
  test(`pseudo copy fits ${route.path}`, async ({ page }) => {
    test.fixme(route.dynamic, `${route.path} needs parameter fixtures before it can be visited`)
    await page.route('**/*', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'accept-language': 'ms-MY,ms;q=0.9' } })
    )
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 })
      const response = await page.goto(route.path)
      expect(response?.status()).toBe(route.status)
      // The skip link is a server translation on every route; this proves pseudo mode actually ran.
      await expect(page.locator('.skip-link')).toHaveText('Skip to content~~~~~')
      if (route.group === 'marketing') await expect(page.locator('[data-language-suggestion]')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expectUnclippedText(page)
      await expectZonedTimes(page)
      await page.locator('.skip-link').focus()
      await expectUnclippedText(page)
    }
  })
}
