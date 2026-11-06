import { test, expect } from '../fixtures'
import { t } from './messages'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

for (const shortcut of ['Meta+k', 'Control+k']) {
  test(`palette opens with ${shortcut}, closes with Escape and returns focus`, async ({ page }) => {
    await page.goto('/_test/set-7')
    const target = page.getByRole('button', { name: t('set7.harness.focus'), exact: true })
    await expect(target).toBeEnabled()
    await target.focus()
    await page.keyboard.press(shortcut)
    const dialog = page.getByRole('dialog', { name: t('palette.title'), exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('combobox', { name: t('palette.search') })).toBeFocused()
    await expect(dialog).toContainText(t('palette.empty'))
    await page.keyboard.press(shortcut)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(target).toBeFocused()
  })
}

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`palette is axe-clean and unclipped at 375px in ${theme}`, async ({ page, baseURL, expectAxeClean }) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/_test/set-7')
    await expect(page.getByRole('button', { name: t('set7.harness.focus'), exact: true })).toBeEnabled()
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAxeClean(page)
    await expectUnclippedText(page)
  })
}
