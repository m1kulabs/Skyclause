import { expect, test } from '@playwright/test'
import { pseudo, t } from '@skyclause/i18n'
import { builtRoutes } from './routes'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { signedOut } from './roles'
import { visit } from './visit'

for (const route of builtRoutes()) {
  test(`pseudo copy fits ${route.path}`, async ({ page }) => {
    test.fixme(route.dynamic, `${route.path} needs parameter fixtures before it can be visited`)
    await signedOut(page)
    await page.route('**/*', (route) =>
      route.continue({ headers: { ...route.request().headers(), 'accept-language': 'ms-MY,ms;q=0.9' } })
    )
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 800 })
      expect(await visit(page, route)).toEqual([])
      // The skip link is a server translation on every route; this proves pseudo mode actually ran.
      // The shell owns the app skip target and hides the shared document's public-page link.
      const skip = page.locator('.skip-link:visible')
      // A /ms/ route renders Malay whatever the browser asks for. A page without a route locale (the app, the auth
      // pages a signed-out app visit is sent to, the test roots) is rendered in the request's language, Malay here,
      // and its skip link says so; the landing and the English public pages stay English and suggest Malay.
      const malay = route.path.startsWith('/ms/') || !(route.group === 'marketing' || route.group === 'public')
      await expect(skip).toHaveText(pseudo(t('shell.skip_to_content', {}, malay ? 'ms' : 'en')))
      if (route.group === 'marketing') await expect(page.locator('[data-language-suggestion]')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expectUnclippedText(page)
      await expectZonedTimes(page)
      await skip.focus()
      await expectUnclippedText(page)
    }
  })
}
