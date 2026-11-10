import { expect, type Page } from '@playwright/test'
import type { CrawlRoute } from './routes'
import type { Role } from './roles'
import type { Finding } from './checks'
import { expectZonedTimes } from '../harness/expect-zoned-times'

/** A share link is a credential but no session (#94). */
const hasSession = (role: Role) => role !== 'signed out' && role !== 'share-link reviewer'

/** The account gate denies everyone without a session, and guests outside Appearance (#96). */
export function expectedStatus(route: CrawlRoute, role: Role) {
  if (route.group === 'app' && route.path.startsWith('/account/')) {
    if (!hasSession(role) || (role === 'guest' && route.path !== '/account/appearance')) return 404
  }
  if (route.group === 'app' && route.params?.includes('org')) {
    const isOwnerOrAdmin = role === 'Owner' || role === 'Admin'
    if (route.path.endsWith('/new') || route.path.endsWith('/settings/packs')) {
      return isOwnerOrAdmin ? route.status : 404
    }
  }
  if (route.path.startsWith('/[org]/[project]/settings') && role !== 'Owner' && role !== 'Admin') return 404
  return route.status
}

export async function visit(page: Page, route: CrawlRoute, role: Role = 'signed out'): Promise<Finding[]> {
  // #174's project UI routes keep their pattern path; their fixtures serve test-org/test-project.
  const path = route.path.replace('[org]', 'test-org').replace('[project]', 'test-project')
  const response = await page.goto(path)
  if ((route.path === '/sign-in' || route.path === '/sign-up') && hasSession(role) && role !== 'guest') {
    await expect(page).toHaveURL(/\/api\/auth\/continue(?:\?.*)?$/)
    return []
  }
  if (route.path === '/connect' && (!hasSession(role) || role === 'guest')) {
    await expect(page).toHaveURL(/\/sign-up$/)
    await expect(page.locator('[data-connect-page]')).toHaveCount(0)
    return []
  }
  if (route.path === '/device' && (!hasSession(role) || role === 'guest')) {
    await expect(page).toHaveURL(hasSession(role) ? /\/sign-up$/ : /\/sign-in\?next=%2Fdevice$/)
    await expect(page.locator('#device-access-title')).toHaveCount(0)
    // #98 owns sign-in and sign-up; the gate is testable before those destinations are built.
    return []
  }
  if (route.path === '/oauth/consent' && (role === 'guest' || !hasSession(role))) {
    await expect(page).toHaveURL(role === 'guest' ? /\/sign-up$/ : /\/sign-in$/)
    await expect(page.locator('main[aria-labelledby="oauth-consent-title"]')).toHaveCount(0)
    return []
  }
  if (route.path === '/new' && (!hasSession(role) || role === 'guest')) {
    await expect(page).toHaveURL(/\/sign-up$/)
    await expect(page.locator('form')).toHaveCount(0)
    // #98 owns sign-up; the gate is testable before that destination is built.
    return []
  }
  await expectZonedTimes(page)
  const expected = expectedStatus(route, role)
  // Firefox revalidates a static page it has cached; 304 is its 200.
  const status = response?.status() === 304 ? 200 : response?.status()
  if (expected === 404) {
    // A streamed notFound may have already sent HTTP 200. Require the real gate in either case.
    await expect(page.getByRole('heading', { level: 1, name: /^Page not found~*$/ })).toBeVisible()
    await expect(page.locator('[data-settings-frame]')).toHaveCount(0)
    if (status === 200 || status === 404) return []
  }
  return status === expected ? [] : [{ check: 'status', detail: `answered ${status}, expected ${expected}` }]
}
