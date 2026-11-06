import { expect, test } from '../fixtures'
import { asPage } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

test('30% pseudo-locale clips no settings title at phone, rail and desktop widths', async ({ page }, testInfo) => {
  await asPage(page, {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date('2026-11-06T00:00:00Z'),
    orgId: 'test-org',
    role: 'admin',
    isGuest: false,
    staff: false
  })
  for (const width of [375, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [path, title] of [
      ['/account/notifications', 'Account settings'],
      ['/test-org/settings/integrations', 'Organisation settings'],
      ['/test-org/test-project/settings', 'Project settings']
    ]) {
      await page.goto(path!)
      const expanded =
        process.env.I18N_PSEUDO === '1' ? `${title}${'~'.repeat(Math.ceil(Array.from(title!).length * 0.3))}` : title!
      await expect(page.locator('[data-settings-frame] h1')).toHaveText(expanded)
      await expectUnclippedText(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      if (path!.endsWith('/settings') && width !== 900) {
        await page.screenshot({ path: testInfo.outputPath(`settings-pseudo-${width}.png`), fullPage: true })
      }
    }
  }
})
