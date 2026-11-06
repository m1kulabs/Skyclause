import { expect, test, type Page } from '@playwright/test'
import { expectUnclippedText } from './harness/expect-unclipped-text'
import { expectZonedTimes } from './harness/expect-zoned-times'

// Playwright's locale emulation overrides Accept-Language on document requests; route it explicitly.
async function acceptLanguage(page: Page, value: string) {
  await page.route('**/*', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'accept-language': value } })
  )
}

test('a Malay browser gets a dismissable Malay suggestion without a redirect', async ({ page }) => {
  await acceptLanguage(page, 'ms-MY,ms;q=0.9')
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(response?.request().redirectedFrom()).toBeNull()
  expect((await response!.request().allHeaders())['accept-language']).toBe('ms-MY,ms;q=0.9')
  const suggestion = page.locator('[data-language-suggestion]')
  await expect(suggestion).toHaveAttribute('lang', 'ms')
  await expect(suggestion.getByRole('link')).toHaveAttribute('href', '/ms/legal/privacy')
  await expect(suggestion.getByRole('link')).toHaveText('Baca notis privasi dalam Bahasa Melayu.')
  await expectZonedTimes(page)
  await suggestion.getByRole('button').click()
  await expect(suggestion).toHaveCount(0)
})

test('an English browser gets no suggestion from a Malaysian IP', async ({ page }) => {
  await acceptLanguage(page, 'en-GB')
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '175.136.0.1' })
  const response = await page.goto('/')
  expect(response?.status()).toBe(200)
  expect(response?.request().redirectedFrom()).toBeNull()
  await expect(page.locator('[data-language-suggestion]')).toHaveCount(0)
})

test('English wins a higher language weight', async ({ page }) => {
  await acceptLanguage(page, 'ms-MY;q=0.5,en-GB;q=0.9')
  await page.goto('/')
  await expect(page.locator('[data-language-suggestion]')).toHaveCount(0)
})

test('the root mounts one polite announcer', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#skyclause-announcer')).toHaveCount(1)
  await expect(page.locator('#skyclause-announcer')).toHaveAttribute('aria-live', 'polite')
})

test('the clipping guard rejects hidden overflow and ellipsis, including ancestor clipping', async ({ page }) => {
  for (const style of ['overflow:hidden', 'overflow:hidden;text-overflow:ellipsis']) {
    await page.setContent(`<div style="width:40px;white-space:nowrap;${style}"><span>Long translated text</span></div>`)
    await expect(expectUnclippedText(page)).rejects.toThrow('Clipped text')
  }
  await page.setContent('<div style="width:40px;overflow-wrap:anywhere">Long translated text</div>')
  await expect(expectUnclippedText(page)).resolves.toBeUndefined()
})

test('the zone guard rejects a visible unzoned time and permits MYT and datetime', async ({ page }) => {
  await page.setContent('<p>15:30</p>')
  await expect(expectZonedTimes(page)).rejects.toThrow('Visible times without MYT')
  await page.setContent('<p>15:30 MYT</p><time datetime="2026-11-02T07:30:00Z">15:30</time>')
  await expect(expectZonedTimes(page)).resolves.toBeUndefined()
})
