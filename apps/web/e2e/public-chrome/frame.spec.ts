import { expect, test } from '../fixtures'
import { t } from '@skyclause/i18n'
import '../../features/public-chrome/catalogue'

const pages = [
  ['/legal/privacy', 'en'],
  ['/legal/terms', 'en'],
  ['/ms/legal/privacy', 'ms']
] as const

test('the footer closes every public page with both brand lines and the name, in both locales', async ({ page }) => {
  for (const [path, locale] of pages) {
    await page.goto(path)
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByText(t('brand.non_affiliation', {}, locale), { exact: true })).toBeVisible()
    await expect(page.getByText(t('brand.not_safety_service', {}, locale), { exact: true })).toBeVisible()
    await expect(page.getByRole('contentinfo').getByRole('img', { name: t('brand.name', {}, locale) })).toBeVisible()
  }
})

test('header and footer link only to pages that exist, and the language link crosses over', async ({ page }) => {
  await page.goto('/legal/privacy')
  const hrefs = await page
    .locator('header a, footer a')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
  expect(hrefs).toEqual([
    '/',
    '/legal/terms',
    '/legal/privacy',
    '/sign-in',
    '/legal/terms',
    '/legal/privacy',
    '/ms/legal/privacy'
  ])
  for (const href of new Set(hrefs.filter((href) => href !== '/'))) {
    expect((await page.request.get(href!)).status(), href!).toBe(200)
  }
  await expect(page.getByRole('link', { name: 'Privacy' }).first()).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: 'Bahasa Melayu' }).click()
  await expect(page).toHaveURL(/\/ms\/legal\/privacy$/)
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('href', '/legal/privacy')
})

test('the 404 keeps its heading and offers the home page; the error page offers the same exit', async ({ page }) => {
  const missing = await page.goto('/ms/legal/does-not-exist')
  expect(missing?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Halaman tidak ditemui' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link')).toHaveAttribute('href', '/')

  await page.goto('/legal/__test/error')
  await expect(page.getByRole('heading', { level: 1, name: t('legal.error.label') })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: t('legal.error.home') })).toHaveAttribute('href', '/')
})
