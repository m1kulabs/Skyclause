import { expect, type Page } from '@playwright/test'
import { pseudo, t } from '@skyclause/i18n'
import type { CrawlRoute } from './routes'
import type { Role } from './roles'
import type { Finding } from './checks'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import '../../features/public-chrome/catalogue'

/** A share link is a credential but no session (#94). */
export const hasSession = (role: Role) => role !== 'signed out' && role !== 'share-link reviewer'

/** The copy as rendered: the pseudo project renders every string through `pseudo`. */
const rendered = (value: string) => (process.env.I18N_PSEUDO === '1' ? pseudo(value) : value)

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
    // features/settings/access.ts: Owners and Admins see every organisation section, Approvers only rota. The crawl
    // has already put the role's organisation slug in place of [org].
    if (/^\/[^/]+\/settings\//.test(route.path)) {
      return isOwnerOrAdmin || (role === 'Approver' && route.path.endsWith('/rota')) ? route.status : 404
    }
    // A project's settings are Owners' and Admins'; its subscribers are Approvers' too (#169).
    if (/^\/[^/]+\/[^/]+\/settings\//.test(route.path)) return isOwnerOrAdmin ? route.status : 404
    if (/^\/[^/]+\/[^/]+\/subscribers$/.test(route.path)) {
      return isOwnerOrAdmin || role === 'Approver' ? route.status : 404
    }
    // PRD routes: an organisation's pages are its members'. Its layout only checks that it exists (#596).
    if (!hasSession(role)) return 404
  }
  if (route.path.startsWith('/[org]/[project]/settings') && role !== 'Owner' && role !== 'Admin') return 404
  // The crawl visits consent without an authorization request, which the page answers with notFound.
  if (route.path === '/oauth/consent') return 404
  // PRD routes: the dashboard is for members. A share link reaches only its own project, so the organisation 404s.
  if ((route.path === '/[org]' || route.path === '/test-org') && role === 'share-link reviewer') return 404
  return route.status
}

/** #98 redirects members through #97's continue endpoint to their account destination. */
export function redirectsToAccount(route: CrawlRoute, role: Role) {
  return (route.path === '/sign-in' || route.path === '/sign-up') && hasSession(role) && role !== 'guest'
}

export async function visit(
  page: Page,
  route: CrawlRoute,
  role: Role = 'signed out',
  readySelector?: string,
  orgSlug?: string
): Promise<Finding[]> {
  // #174's project UI routes keep their pattern path; their fixtures serve test-org/test-project.
  const path = route.path.replace('[org]', 'test-org').replace('[project]', 'test-project')
  const continuation = redirectsToAccount(route, role)
    ? page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/auth/continue' && response.status() === 303
      )
    : undefined
  const response = await page.goto(path)
  if (readySelector) await page.locator(readySelector).first().waitFor({ state: 'attached' })
  if (continuation) {
    expect(orgSlug).toBeTruthy()
    expect((await continuation).headers().location).toBe(`/${orgSlug}`)
    await expect(page).toHaveURL(new URL(`/${orgSlug}`, page.url()).href)
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
    await expect(page.locator('form:has(#org-name)')).toHaveCount(0)
  }
  await expectZonedTimes(page)
  const locale = route.path.startsWith('/ms/') ? 'ms' : 'en'
  if (route.group === 'public') {
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
    await expect(page.getByText(rendered(t('brand.non_affiliation', {}, locale)), { exact: true })).toBeVisible()
    await expect(page.getByText(rendered(t('brand.not_safety_service', {}, locale)), { exact: true })).toBeVisible()
  }
  if (route.path === '/') {
    // The landing carries DESIGN's copy-deck forms of both lines: the Proof footnote and the first FAQ answer, whose
    // pane stays closed until its question is chosen.
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(
      page.getByText(
        'Skyclause is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium.'
      )
    ).toBeVisible()
    await expect(
      page.getByText('Skyclause is not a safety or emergency service. In an emergency, call 999.')
    ).toBeAttached()
  }
  const expected = expectedStatus(route, role)
  // Firefox revalidates a static page it has cached; 304 is its 200.
  const status = response?.status() === 304 ? 200 : response?.status()
  const notFound = page.getByRole('heading', { level: 1, name: /^Page not found~*$/ })
  if (expected === 404) {
    // A streamed notFound may have already sent HTTP 200. Require the real gate in either case. A page that renders
    // instead is a finding, so a known gap can name it and the crawl still inspects what the role was shown.
    const denied = await notFound.waitFor({ timeout: 5_000 }).then(
      () => true,
      () => false
    )
    if (!denied || (await page.locator('[data-settings-frame]').count()) > 0) {
      return [{ check: 'status', detail: `answered ${status} with the page, expected 404` }]
    }
    if (status === 200 || status === 404) return []
  }
  // The same streaming lets a wrongly denied role reach a "Page not found" that answered 200.
  if (expected === 200 && (await notFound.count()) > 0) {
    return [{ check: 'status', detail: `answered ${status} with "Page not found", expected the page` }]
  }
  return status === expected ? [] : [{ check: 'status', detail: `answered ${status}, expected ${expected}` }]
}
