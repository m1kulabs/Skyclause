// No dead links in what the build renders: every same-origin href the shell, the landing, the public and auth chrome
// and the not-found page draw is a page in the build's route manifest (links.ts). The command palette's destinations
// are checked by test/quality/links.test.ts, since its copy loads as JSON this runner can't import.
import { expect, test, type Page } from '@playwright/test'
import type { Role } from '@skyclause/contracts'
import type { ShellData } from '../../features/shell/types'
import { pageMatcher, UNBUILT_PATHS, type FoundLink } from './links'
import { builtRoutes } from './routes'

const origin = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
const { builtPage, deadLinks } = pageMatcher(builtRoutes().map((route) => route.path))
const ROLES: Role[] = ['owner', 'admin', 'approver', 'editor', 'viewer', 'guest']

async function anchors(page: Page, scope = 'body', at = page.url()): Promise<FoundLink[]> {
  const hrefs = await page
    .locator(`${scope} a[href]`)
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!))
  return hrefs.map((href) => ({ href, at }))
}

test('the build has every page the shell and the public chrome link, and none of the unbuilt ones', () => {
  for (const path of ['/', '/acme', '/acme/site/ledger', '/acme/site/bundles/b-1', '/legal/terms', '/new'])
    expect(builtPage(path), path).not.toBeNull()
  for (const path of UNBUILT_PATHS) expect(builtPage(path), path).toBeNull()
})

const shellData = (role: Role): ShellData => ({
  memberships: [
    { org_id: 'org-1', org_name: 'Acme', org_slug: role === 'guest' ? 'commons' : 'acme', role },
    { org_id: 'org-2', org_name: 'Second organisation', org_slug: 'second', role: 'viewer' }
  ],
  projects: [
    { id: 'project-1', org_id: 'org-1', name: 'Site', slug: 'site' },
    { id: 'project-2', org_id: 'org-2', name: 'Second site', slug: 'second-site' }
  ]
})

/** Every link the shell draws, with each of the bar's menus and the phone sheet open in turn. */
async function shellLinks(page: Page, data: ShellData, scope: string) {
  await page
    .context()
    .addCookies([
      { name: 'skyclause-test-shell', value: encodeURIComponent(JSON.stringify(data)), url: origin, httpOnly: true }
    ])
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/_test/shell${scope}`)
  await expect(page.locator('[data-shell-ready="true"]')).toBeAttached()
  const at = (where: string) => `${scope || 'no scope'}, ${where}`
  const found = await anchors(page, '.app-shell', at('bar'))
  const triggers = page.locator('.shell-bar button[aria-haspopup="menu"]:visible')
  for (let i = 0; i < (await triggers.count()); i++) {
    await triggers.nth(i).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem').first()).toBeVisible()
    found.push(...(await anchors(page, '[role="menu"]', at(`menu ${i + 1}`))))
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.shell-phone-menu').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  found.push(...(await anchors(page, '[role="dialog"]', at('phone sheet'))))
  await page.keyboard.press('Escape')
  return found
}

test('every link the shell draws is a built page, for every role and scope', async ({ page }) => {
  const found: FoundLink[] = []
  for (const role of ROLES) {
    const org = role === 'guest' ? 'commons' : 'acme'
    for (const scope of [`?org=${org}&project=site&tab=windows`, `?org=${org}`])
      found.push(...(await shellLinks(page, shellData(role), scope)))
  }
  found.push(...(await shellLinks(page, { memberships: [], projects: [] }, '')))
  expect(found.length).toBeGreaterThan(0)
  expect(deadLinks(found, origin)).toEqual([])
})

test('every link on the landing, the public and auth pages and the not-found page is a built page', async ({
  page
}) => {
  const found: FoundLink[] = []
  for (const path of [
    '/',
    '/legal/terms',
    '/legal/privacy',
    '/ms/legal/privacy',
    '/sign-in',
    '/sign-up',
    '/_not-found'
  ]) {
    await page.goto(path)
    found.push(...(await anchors(page)))
  }
  expect(found.length).toBeGreaterThan(0)
  expect(deadLinks(found, origin)).toEqual([])
})
