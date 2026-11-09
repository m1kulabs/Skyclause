import { expect, type Page } from '@playwright/test'
import { t } from '@skyclause/i18n'
import type { CrawlRoute } from './routes'
import type { Role } from './roles'
import type { Finding } from './checks'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import '../../features/public-chrome/catalogue'

/** A share link is a credential but no session (#94). */
const hasSession = (role: Role) => role !== 'signed out' && role !== 'share-link reviewer'

/** The account gate denies everyone without a session, and guests outside Appearance (#96). */
export function expectedStatus(route: CrawlRoute, role: Role) {
  if (route.group === 'app' && route.path.startsWith('/account/')) {
    if (!hasSession(role) || (role === 'guest' && route.path !== '/account/appearance')) return 404
  }
  return route.status
}

export async function visit(page: Page, route: CrawlRoute, role: Role = 'signed out'): Promise<Finding[]> {
  const response = await page.goto(route.path)
  if (route.path === '/connect' && (!hasSession(role) || role === 'guest')) {
    await expect(page).toHaveURL(/\/sign-up$/)
    await expect(page.locator('[data-connect-page]')).toHaveCount(0)
    // #97 owns sign-up; the gate is testable before that destination is built.
    return []
  }
  await expectZonedTimes(page)
  const locale = route.path.startsWith('/ms/') ? 'ms' : 'en'
  if (route.group === 'public' || route.path === '/') {
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByText(t('brand.non_affiliation', {}, locale), { exact: true })).toBeVisible()
    await expect(page.getByText(t('brand.not_safety_service', {}, locale), { exact: true })).toBeVisible()
  }
  const expected = expectedStatus(route, role)
  // Firefox revalidates a static page it has cached; 304 is its 200.
  const status = response?.status() === 304 ? 200 : response?.status()
  if (expected === 404) {
    // A streamed notFound may have already sent HTTP 200. Require the real gate in either case.
    await expect(page.getByRole('heading', { level: 1, name: t('legal.notFound.label', {}, locale) })).toBeVisible()
    await expect(page.locator('[data-settings-frame]')).toHaveCount(0)
    if (status === 200 || status === 404) return []
  }
  return status === expected ? [] : [{ check: 'status', detail: `answered ${status}, expected ${expected}` }]
}
