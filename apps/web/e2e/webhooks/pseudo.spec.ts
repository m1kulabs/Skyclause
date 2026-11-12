import { test, expect } from '../fixtures'
import { setup, endpoint, verified, delivery, secret, t, stubAction, openDeleteDialog } from './fixtures'
import { stubApi, expectZonedTimes } from '../harness'
import { webhookOperations } from '../../features/webhooks/operations'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`expanded webhook copy fits both routes, forms, secret and confirm in ${theme}`, async ({
    page,
    baseURL
  }, testInfo) => {
    const longUrl = `https://receiver.example.test/${'notifications-'.repeat(15)}`
    const hook = { ...verified, url: longUrl }
    await setup(page, [hook])
    await stubApi(
      page,
      'listWebhookDeliveries',
      {
        data: [{ ...delivery, error: '超长接收端错误'.repeat(30), response_body: 'x'.repeat(5000) }],
        next_cursor: null
      },
      { registry: webhookOperations }
    )
    await page.context().addCookies([
      {
        url: baseURL!,
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        })
      }
    ])
    for (const route of ['/developers/webhooks', '/test-org/settings/webhooks']) {
      await page.goto(route)
      await expect(page.locator('[data-webhooks]')).toBeVisible()
      if (route.includes('settings')) await page.getByRole('button', { name: t('webhooks.add'), exact: true }).click()
      for (const width of [1440, 768, 375, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate(() => document.fonts.ready)
        await expectUnclippedText(page)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await expectZonedTimes(page)
      if (route.includes('settings')) {
        await openDeleteDialog(page, longUrl)
        await expect(page.getByRole('alertdialog')).toBeVisible()
        await expectUnclippedText(page)
        await page.screenshot({ path: testInfo.outputPath('expanded-confirm.png'), fullPage: true })
        await page.keyboard.press('Escape')
      }
    }
    await setup(page, [])
    await stubAction(page, 'createWebhook', { ...endpoint, secret })
    await page.goto('/developers/webhooks')
    const heading = page.getByRole('heading', { name: t('webhooks.title'), exact: true })
    // Runs in both the normal and the 30% pseudo-locale suites; only the pseudo build expands copy.
    await expect(heading).toHaveText(process.env.I18N_PSEUDO === '1' ? /~+/ : t('webhooks.title'))
    await page.getByRole('textbox', { name: t('webhooks.url'), exact: true }).fill(endpoint.url)
    await page.getByRole('checkbox', { name: t('webhooks.event_type', { type: 'call.sent' }), exact: true }).check()
    await page.getByRole('button', { name: t('webhooks.save'), exact: true }).click()
    await expect(page.locator('[data-webhook-secret]')).toHaveText(secret)
    await expectUnclippedText(page)
  })
}
