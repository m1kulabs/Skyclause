// NFR-9 in the lab (#116): the dashboard against the production build with stubbed reads.
import { expect, test } from '../fixtures'
import { expectMobileVitals } from '../harness/mobile-vitals'
import { org, stubDashboard } from './doubles'

test('NFR-9 mobile dashboard meets LCP, INP and CLS budgets against the production build', async ({
  context
}, testInfo) => {
  test.setTimeout(90_000)
  await expectMobileVitals(context, testInfo, 'dashboard-mobile', async (page) => {
    await stubDashboard(page, { filled: true })
    await page.goto(`/${org.slug}`)
    await expect(page.locator('[data-dashboard-block]')).toHaveCount(5)
    // The skeleton is aria-busy. Its content renders after the client read, so let that paint before the
    // interaction, which ends LCP; otherwise LCP can stop at the server-rendered shell.
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    // The interaction: open the command palette, then close it.
    await expect(page.locator('[data-palette-ready="true"]')).toBeAttached()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
