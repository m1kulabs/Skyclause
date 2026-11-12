import { expect, test } from '../fixtures'
import { attribution as attributionRules } from '@skyclause/elements'
import { t } from '@skyclause/i18n'
import { sourceFixtures } from '../../test/public-chrome/source-fixtures'
import '../../features/public-chrome/catalogue'

const path = '/legal/__test/attribution'

test('PUB-5 source attribution opens the complete details and returns focus with Escape', async ({ page }) => {
  await page.goto(path)
  const triggers = page.locator('[aria-haspopup="dialog"]')
  const dialog = page.getByRole('dialog')

  await expect(triggers).toHaveCount(sourceFixtures.length)
  for (const [index, source] of sourceFixtures.entries()) {
    const trigger = triggers.nth(index)
    await trigger.click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(source.name)
    await expect(dialog.locator('dd[translate="no"]').first()).toHaveText(source.external_id)
    await expect(dialog.locator('[data-licence-id]')).toHaveAttribute('data-licence-id', String(source.licence_id))
    await expect(dialog).toContainText(source.licence_label)
    await expect(dialog.locator(`a[href="${source.url}"]`)).toHaveText(source.url)

    const rules = attributionRules[source.kind]
    if (rules.derived_only) {
      await expect(dialog).toContainText(t('legal.attribution.derived'))
    } else {
      await expect(dialog.locator(`a[href="${rules.licence_url}"]`)).toHaveText(source.licence_label)
    }
    if (source.kind === 'wikipedia') {
      await expect(dialog).toContainText(t('legal.attribution.shareAlike'))
      const focusable = dialog.locator('button, a[href]')
      await focusable.last().focus()
      await page.keyboard.press('Tab')
      await expect(focusable.first()).toBeFocused()
    }

    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  }
})

test('PUB-5 source attribution links to the complete list without JavaScript', async ({ browser, page }) => {
  await page.goto(path)
  const origin = new URL(page.url()).origin
  const context = await browser.newContext({ javaScriptEnabled: false })
  const noJsPage = await context.newPage()

  try {
    await noJsPage.goto(`${origin}${path}`)
    const links = noJsPage.locator('a[href="#attribution"]')
    await expect(links).toHaveCount(sourceFixtures.length)
    const entries = noJsPage.locator('#attribution li')
    await expect(entries).toHaveCount(sourceFixtures.length)
    for (const [index, source] of sourceFixtures.entries()) {
      const trigger = links.nth(index)
      const entry = entries.nth(index)
      await expect(trigger).toHaveAttribute(
        'aria-label',
        t('legal.attribution.view', { source: source.name, station: source.external_id })
      )
      await expect(entry).toContainText(source.name)
      await expect(entry.locator('dd[translate="no"]').first()).toHaveText(source.external_id)
      await expect(entry.locator('[data-licence-id]')).toHaveAttribute('data-licence-id', String(source.licence_id))
      await expect(entry).toContainText(source.licence_label)
      await expect(entry.locator(`a[href="${source.url}"]`)).toHaveText(source.url)
      const rules = attributionRules[source.kind]
      if (rules.derived_only) await expect(entry).toContainText(t('legal.attribution.derived'))
      else await expect(entry.locator(`a[href="${rules.licence_url}"]`)).toHaveText(source.licence_label)
    }
    await links.first().click()
    await expect(noJsPage).toHaveURL(/#attribution$/)
  } finally {
    await context.close()
  }
})
