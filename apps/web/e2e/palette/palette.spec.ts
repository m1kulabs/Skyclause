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
    await expect(dialog.getByRole('option', { name: t('palette.light'), exact: true })).toBeVisible()
    await page.keyboard.press(shortcut)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(target).toBeFocused()
  })
}

test('palette shortcut does not open while an editable control has focus', async ({ page }) => {
  await page.goto('/_test/set-7')
  await page.evaluate(() => {
    const input = document.createElement('input')
    input.id = 'shortcut-input'
    const textarea = document.createElement('textarea')
    textarea.id = 'shortcut-textarea'
    const editor = document.createElement('div')
    editor.id = 'shortcut-editor'
    editor.contentEditable = 'true'
    editor.tabIndex = 0
    document.body.append(input, textarea, editor)
  })

  const dialog = page.getByRole('dialog', { name: t('palette.title'), exact: true })
  for (const selector of ['#shortcut-input', '#shortcut-textarea', '#shortcut-editor']) {
    const target = page.locator(selector)
    for (const shortcut of ['Control+k', 'Meta+k']) {
      await target.focus()
      await page.keyboard.press(shortcut)
      await expect(target).toBeFocused()
      await expect(dialog).toBeHidden()
    }
  }
})

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
