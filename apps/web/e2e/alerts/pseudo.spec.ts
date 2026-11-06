import { test, expect } from '../fixtures'
import { asPage, stubApi, expectZonedTimes } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { alertsOperations } from '../../features/alerts/operations'
import { principal, emptyApi, browserPush, testDevice } from './support'
import { t } from './messages'

for (const theme of ['dark', 'light', 'high-contrast']) {
  test(`alerts panel and card are axe-clean, keyboard reachable and unclipped in ${theme}`, async ({
    page,
    baseURL,
    expectAxeClean
  }, testInfo) => {
    await asPage(page, principal())
    await browserPush(page)
    await emptyApi(page)
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        url: baseURL!,
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        })
      }
    ])
    // All bodies are test doubles, including the extreme unbroken identifier and Unicode device name.
    const id = 'notification-with-an-unbroken-reference-'.repeat(5)
    await stubApi(
      page,
      'listNotifications',
      {
        data: [
          {
            id,
            kind: 'auditor',
            ref: { type: 'source', id },
            project: { id: 'p', org_slug: 'org', slug: 'project' },
            recovered: true,
            created_at: '2026-11-06T02:00:00Z',
            read_at: null
          }
        ],
        next_cursor: null
      },
      { registry: alertsOperations }
    )
    await stubApi(
      page,
      'listPushSubscriptions',
      { data: [{ ...testDevice, user_agent: '吉隆坡社区教育与文化交流协会 '.repeat(6) }], next_cursor: null },
      { registry: alertsOperations }
    )
    for (const width of [1440, 900, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/account/notifications')
      await expect(page.getByRole('switch', { name: t('kinds.auditor') })).toBeEnabled()
      await expectUnclippedText(page)
      await expectZonedTimes(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      if (width === 375) {
        await expectAxeClean(page)
        await page.screenshot({ path: testInfo.outputPath('alerts-panel.png'), fullPage: true })
      }
    }
    await page.getByRole('switch', { name: t('kinds.auditor') }).focus()
    await expect(page.getByRole('switch', { name: t('kinds.auditor') })).toBeFocused()
    await page.goto('/_test/alerts')
    await expect(page.getByRole('button', { name: t('enable') })).toBeEnabled()
    await expectAxeClean(page)
    await expectUnclippedText(page)
    await page.screenshot({ path: testInfo.outputPath('alerts-card.png'), fullPage: true })
  })
}

test.describe('Malay', () => {
  test.use({ locale: 'ms-MY' })
  test('Malay alerts copy fits the settings panel and card', async ({ page }) => {
    await asPage(page, principal())
    await browserPush(page, 'default', true)
    await emptyApi(page)
    for (const path of ['/account/notifications', '/_test/alerts']) {
      await page.setViewportSize({ width: 320, height: 900 })
      await page.goto(path)
      await expect(page.getByText(t('iosHelp', {}, 'ms'))).toBeVisible({ timeout: 10_000 })
      await expectUnclippedText(page)
    }
  })
})
