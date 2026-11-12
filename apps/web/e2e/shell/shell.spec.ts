import type { Page } from '@playwright/test'
import { pseudo } from '../../../../packages/i18n/src/pseudo'
import { test, expect } from '../fixtures'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { org, project, stubDashboard } from '../dashboard/doubles'
import type { ShellData } from '../../features/shell/types'

const data: ShellData = {
  memberships: [
    { org_id: 'org-one', org_name: 'Test organisation one', org_slug: 'test-one', role: 'owner' },
    { org_id: 'org-two', org_name: 'Test organisation two', org_slug: 'test-two', role: 'viewer' }
  ],
  projects: [
    { id: 'project-one', org_id: 'org-one', name: 'Test project one', slug: 'test-project' },
    { id: 'project-two', org_id: 'org-two', name: 'Other organisation project', slug: 'other-project' }
  ]
}
const copy = (value: string) => (process.env.I18N_PSEUDO === '1' ? pseudo(value) : value)
/** A membership's accessible name: the role is translated, then the whole label. */
const membership = (name: string, role: string) => copy(`${name}, ${copy(role)}`)
const origin = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`
const PROJECT = '?org=test-one&project=test-project&tab=windows'
const UNBUILT = /\/(approvals|clauses|docs)(\/|$|\?|#)|^\/developers$/

async function setShell(page: Page, shellData: ShellData) {
  await page.context().addCookies([
    {
      name: 'skyclause-test-shell',
      value: encodeURIComponent(JSON.stringify(shellData)),
      url: origin,
      httpOnly: true
    }
  ])
}

async function openShell(page: Page, shellData: ShellData = data, scope = PROJECT) {
  await setShell(page, shellData)
  await page.goto(`/_test/shell${scope}`)
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.locator('[data-shell-ready="true"]')).toBeAttached()
}

const bar = (page: Page) => page.locator('.shell-bar')
async function closeMenu(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

async function menuLinks(page: Page) {
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem').first()).toBeVisible()
  return menu
    .locator('a[role="menuitem"]')
    .evaluateAll((items) =>
      items.map((item) => ({ name: item.getAttribute('aria-label') ?? '', href: item.getAttribute('href') }))
    )
}

test('keyboard order is the skip link, the wordmark, both switchers, the four links, More, Review, palette, account', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openShell(page)
  const order = [
    page.getByRole('link', { name: copy('Skip to content') }),
    bar(page).getByRole('link', { name: copy('Skyclause, organisation dashboard') }),
    bar(page).getByRole('button', { name: /Switch organisation:/ }),
    bar(page).getByRole('button', { name: /Switch project:/ }),
    ...['Windows', 'Signals', 'Calls', 'Ledger'].map((name) =>
      bar(page).getByRole('link', { name: copy(name), exact: true })
    ),
    bar(page).getByRole('button', { name: copy('More project pages') }),
    bar(page).getByRole('link', { name: copy('Review'), exact: true }),
    bar(page).getByRole('button', { name: /^Open command palette/ }),
    bar(page).getByRole('button', { name: copy('Organisation and account') })
  ]
  for (const stop of order) {
    await page.keyboard.press('Tab')
    await expect(stop).toBeFocused()
  }
})

test('skip link moves focus to page content', async ({ page }) => {
  await openShell(page)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('#shell-content')).toBeFocused()
})

test('the current destination carries aria-current and the capsule mark, never colour alone', async ({ page }) => {
  await openShell(page)
  const links = bar(page).locator('.shell-destinations a')
  await expect(links).toHaveCount(4)
  const windows = bar(page).getByRole('link', { name: copy('Windows'), exact: true })
  await expect(windows).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.shell-destinations [aria-current]')).toHaveCount(1)
  const mark = await windows.evaluate((element) => {
    const after = getComputedStyle(element, '::after')
    return { content: after.content, width: after.width, height: after.height }
  })
  expect(mark).toEqual({ content: '""', width: '16px', height: '4px' })
  const other = await bar(page)
    .getByRole('link', { name: copy('Signals'), exact: true })
    .evaluate((element) => getComputedStyle(element, '::after').content)
  expect(other).toBe('none')
})

test('1440 is one 48px row on the 1200px column, with the wordmark and the page on one left edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openShell(page)
  const row = (await page.locator('.shell-bar-row').boundingBox())!
  expect(row.width).toBe(1248)
  // Copy 30% longer may wrap the switchers' names onto a second line; it must never clip or scroll (tested below).
  if (process.env.I18N_PSEUDO !== '1') expect(row.height).toBe(48)
  const wordmark = (await page.locator('.shell-wordmark').boundingBox())!
  const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  expect(wordmark.x).toBe(120)
  expect(heading.x).toBe(120)
  const end = (await bar(page)
    .getByRole('button', { name: copy('Organisation and account') })
    .boundingBox())!
  expect(end.x + end.width).toBe(1320)
})

test('laptop and tablet widths move the project links and the time to a second row', async ({ page }) => {
  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await openShell(page)
    const wordmark = (await page.locator('.shell-wordmark').boundingBox())!
    const links = (await page.locator('.shell-destinations').boundingBox())!
    const time = (await bar(page).locator('time').boundingBox())!
    expect(links.y).toBeGreaterThanOrEqual(wordmark.y + wordmark.height)
    expect(Math.abs(time.y + time.height / 2 - (links.y + links.height / 2))).toBeLessThan(4)
    await expect(bar(page).locator('time')).toHaveText(/^\d{2}:\d{2} MYT/)
    expect(await bar(page).locator('time').getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/)
  }
})

test('390px keeps the wordmark, Review and Menu; the sheet holds every destination and both switchers', async ({
  page,
  expectAxeClean
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openShell(page)
  const visible = bar(page).locator('a:visible, button:visible')
  await expect(visible).toHaveCount(3)
  await expect(visible.nth(0)).toHaveAccessibleName(copy('Skyclause, organisation dashboard'))
  await expect(visible.nth(1)).toHaveAccessibleName(copy('Review'))
  await expect(visible.nth(2)).toHaveAccessibleName(copy('Menu'))
  for (const control of await visible.all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(36)

  await bar(page)
    .getByRole('button', { name: copy('Menu') })
    .click()
  const sheet = page.getByRole('dialog', { name: copy('Skyclause menu') })
  await expect(sheet).toBeVisible()
  for (const name of [
    'Windows',
    'Signals',
    'Calls',
    'Ledger',
    'Overview',
    'Analysis',
    'Subscribers',
    'Project settings'
  ])
    await expect(sheet.getByRole('link', { name: copy(name), exact: true })).toBeVisible()
  for (const name of ['Dashboard', 'Projects', 'Organisation analysis', 'Webhooks', 'Organisation settings', 'Account'])
    await expect(sheet.getByRole('link', { name: copy(name), exact: true })).toBeAttached()
  await expect(sheet.getByRole('link', { name: copy('Windows'), exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(sheet.getByRole('link', { name: membership('Test organisation one', 'Owner') })).toHaveAttribute(
    'aria-current',
    'true'
  )
  await expect(sheet.getByRole('link', { name: membership('Test organisation two', 'Viewer') })).toBeAttached()
  for (const link of await sheet.locator('[data-slot="phone-sheet-item"]').all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(sheet.locator('time')).toHaveText(/^\d{2}:\d{2} MYT/)
  await expectAxeClean(page)
  await page.keyboard.press('Escape')
  await expect(bar(page).getByRole('button', { name: copy('Menu') })).toBeFocused()
})

test('switchers list only supplied memberships with roles, and projects in that organisation', async ({ page }) => {
  await openShell(page)
  await bar(page)
    .getByRole('button', { name: /Switch organisation:/ })
    .click()
  expect(await menuLinks(page)).toEqual([
    { name: membership('Test organisation one', 'Owner'), href: '/test-one' },
    { name: membership('Test organisation two', 'Viewer'), href: '/test-two' },
    { name: copy('Create an organisation'), href: '/new' }
  ])
  await expect(page.getByRole('menuitem', { name: /Test organisation one/ })).toHaveAttribute('aria-current', 'true')
  await closeMenu(page)
  await bar(page)
    .getByRole('button', { name: /Switch project:/ })
    .click()
  expect(await menuLinks(page)).toEqual([
    { name: 'Test project one', href: '/test-one/test-project' },
    { name: copy('Create a project'), href: '/test-one/new' }
  ])
})

test('the project and account menus link only to built pages, filtered by role', async ({ page }) => {
  await openShell(page)
  await bar(page)
    .getByRole('button', { name: copy('More project pages') })
    .click()
  expect(await menuLinks(page)).toEqual([
    { name: copy('Overview'), href: '/test-one/test-project' },
    { name: copy('Analysis'), href: '/test-one/test-project/analysis' },
    { name: copy('Subscribers'), href: '/test-one/test-project/subscribers' },
    { name: copy('Project settings'), href: '/test-one/test-project/settings' }
  ])
  await closeMenu(page)
  await bar(page)
    .getByRole('button', { name: copy('Organisation and account') })
    .click()
  expect(await menuLinks(page)).toEqual([
    { name: copy('Dashboard'), href: '/test-one' },
    { name: copy('Projects'), href: '/test-one/projects' },
    { name: copy('Organisation analysis'), href: '/test-one/analysis' },
    { name: copy('Webhooks'), href: '/test-one/settings/webhooks' },
    { name: copy('Organisation settings'), href: '/test-one/settings/general' },
    { name: copy('Connect your AI'), href: '/connect' },
    { name: copy('Account'), href: '/account/profile' }
  ])
  await closeMenu(page)

  await openShell(page, data, '?org=test-two&project=other-project')
  await bar(page)
    .getByRole('button', { name: copy('More project pages') })
    .click()
  const viewerProject = await menuLinks(page)
  expect(viewerProject.map((item) => item.name)).toEqual([copy('Overview'), copy('Analysis')])
  await closeMenu(page)
  await bar(page)
    .getByRole('button', { name: copy('Organisation and account') })
    .click()
  const viewerOrganisation = await menuLinks(page)
  expect(viewerOrganisation.map((item) => item.name)).toEqual([
    copy('Dashboard'),
    copy('Projects'),
    copy('Organisation analysis'),
    copy('Connect your AI'),
    copy('Account')
  ])
  for (const link of [...viewerProject, ...viewerOrganisation]) expect(link.href).not.toMatch(UNBUILT)
})

test('a guest account sees only Appearance for its account', async ({ page }) => {
  await openShell(
    page,
    {
      memberships: [{ org_id: 'commons', org_name: 'Commons', org_slug: 'commons', role: 'guest' }],
      projects: [{ id: 'bukit-jalil', org_id: 'commons', name: 'Bukit Jalil', slug: 'bukit-jalil' }]
    },
    '?org=commons'
  )
  await bar(page)
    .getByRole('button', { name: copy('Organisation and account') })
    .click()
  expect((await menuLinks(page)).map((item) => item.href)).toEqual([
    '/commons',
    '/commons/projects',
    '/commons/analysis',
    '/account/appearance'
  ])
  await closeMenu(page)
  await bar(page)
    .getByRole('button', { name: /Switch organisation:/ })
    .click()
  expect((await menuLinks(page)).map((item) => item.href)).toEqual(['/commons'])
})

test('Review opens the dashboard at its needs-review block and prints no count without the live stream', async ({
  page
}) => {
  await openShell(page)
  const review = bar(page).getByRole('link', { name: copy('Review'), exact: true })
  await expect(review).toHaveAttribute('href', '/test-one#dashboard-needs-review')
  await expect(review).toHaveText(copy('Review'))
  await expect(review).toHaveAttribute('data-waiting', 'unknown')
  await expect(bar(page).locator('[data-count]')).toHaveCount(0)
  // An organisation the person isn't in (its page is a 404) gets neither Review nor project links.
  await openShell(page, data, '?org=not-a-member&project=test-project')
  await expect(bar(page).getByRole('link', { name: copy('Review'), exact: true })).toHaveCount(0)
  await expect(bar(page).locator('.shell-destinations')).toHaveCount(0)
})

test('empty data shows the no-organisation state and its next action, never sample organisations', async ({ page }) => {
  await openShell(page, { memberships: [], projects: [] }, '')
  const main = page.locator('main')
  await expect(main.locator('[data-slot="empty"]')).toContainText(copy('No organisations yet (n=0)'))
  await expect(main.getByRole('link', { name: copy('Create an organisation') })).toHaveAttribute('href', '/new')
  await expect(main).not.toContainText('Test organisation')
  await expect(main.locator('[data-source-error]')).toHaveCount(0)
  await expect(bar(page).getByRole('button', { name: /Switch project:/ })).toHaveCount(0)
})

test('a failed memberships read names itself as an error, not as no organisations', async ({ page }) => {
  await openShell(
    page,
    { memberships: [], projects: [], membershipsError: { status: 501, at: '2026-11-12T03:04:00.000Z' } },
    ''
  )
  const main = page.locator('main')
  await expect(main.locator('[data-source-error="501"]')).toContainText(
    copy(`Skyclause can’t show ${copy('your organisations')} yet.`)
  )
  // Reading again cannot change a "not built" answer, so it offers no Try again; a failed read (below) does.
  await expect(main.getByRole('button', { name: copy('Try again') })).toHaveCount(0)
  await expect(main.locator('[data-slot="empty"]')).toHaveCount(0)
  await expect(main).not.toContainText(copy('No organisations yet (n=0)'))
  await expect(bar(page).getByRole('button', { name: /Switch organisation:/ })).toContainText(
    copy('Organisations unavailable')
  )
  // On an organisation's page the project list is unknown too: an error, never "No projects".
  await openShell(
    page,
    { memberships: [], projects: [], membershipsError: { status: 503, at: '2026-11-12T03:04:00.000Z' } },
    '?org=test-one'
  )
  await expect(main.getByRole('button', { name: copy('Try again') })).toBeVisible()
  await expect(bar(page).getByRole('button', { name: /Switch project:/ })).toContainText(copy('Projects unavailable'))
})

test('a membership without projects says so and offers its role-appropriate next action', async ({ page }) => {
  await openShell(page, { ...data, projects: [] }, '?org=test-one')
  await bar(page)
    .getByRole('button', { name: /Switch project:/ })
    .press('Enter')
  await expect(page.getByRole('menu')).toContainText(copy('No projects'))
  await expect(page.getByRole('menuitem', { name: copy('Create a project') })).toHaveAttribute('href', '/test-one/new')
  await closeMenu(page)
  await openShell(page, { ...data, projects: [] }, '?org=test-two')
  await bar(page)
    .getByRole('button', { name: /Switch project:/ })
    .press('Enter')
  await expect(page.getByRole('menu')).toContainText(copy('Ask an organisation admin to add a project'))
  await expect(page.getByRole('menuitem', { name: copy('Create a project') })).toHaveCount(0)
})

test('focus is never hidden under the sticky bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openShell(page)
  await page.locator('#shell-content').evaluate((main) => {
    for (const id of ['before', 'probe']) {
      const spacer = document.createElement('div')
      spacer.style.height = '1200px'
      const link = document.createElement('a')
      link.href = `#${id}`
      link.id = id
      link.textContent = id
      main.append(spacer, link)
    }
    main.append(Object.assign(document.createElement('div'), { style: 'height: 1200px' }))
  })
  // Put the probe just under the bar's top edge, then reach it from the link before it.
  await page.locator('#probe').evaluate((probe) => window.scrollTo(0, probe.getBoundingClientRect().top + scrollY - 10))
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#probe')).toBeFocused()
  const barBottom = (await bar(page).boundingBox())!
  const probe = (await page.locator('#probe').boundingBox())!
  expect(probe.y).toBeGreaterThanOrEqual(barBottom.y + barBottom.height)
  await expect(bar(page)).toHaveAttribute('data-scrolled', '')
})

for (const theme of ['dark', 'light', 'high contrast'] as const) {
  test(`axe passes in ${theme}, with the bar and each of its menus open`, async ({ page, expectAxeClean }) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high contrast' ? 'more' : 'standard'
        }),
        url: origin
      }
    ])
    await openShell(page, { ...data, projects: [] }, '?org=test-two')
    await expectAxeClean(page)
    for (const control of [/Switch project:/, /Switch organisation:/, new RegExp(copy('Organisation and account'))]) {
      await bar(page).getByRole('button', { name: control }).click()
      await expect(page.getByRole('menu')).toBeVisible()
      await expectAxeClean(page)
      await closeMenu(page)
    }
  })
}

test('labels and links do not clip, including the 30 percent pseudo locale', async ({ page }) => {
  for (const width of [320, 375, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await openShell(page)
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('long organisation and project names wrap without hiding controls', async ({ page }) => {
  const longData: ShellData = {
    ...data,
    memberships: data.memberships.map((item) => ({
      ...item,
      org_name: 'Faculty of Engineering, Technology and Built Environment'
    })),
    projects: data.projects.map((item) => ({ ...item, name: 'Kuala Lumpur teaching and assessment release windows' }))
  }
  for (const width of [375, 900, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await openShell(page, longData)
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const tool = width > 640 ? /^Open command palette/ : copy('Menu')
    await expect(bar(page).getByRole('button', { name: tool })).toBeInViewport()
  }
})

test('on a real route the palette opens from the bar and offers every destination, grouped', async ({ page }) => {
  await stubDashboard(page, { role: 'owner' })
  await setShell(page, {
    memberships: [{ org_id: org.id, org_name: org.name, org_slug: org.slug, role: 'owner' }],
    projects: [{ id: project.id, org_id: org.id, name: project.name, slug: project.slug }]
  })
  await page.goto(`/${org.slug}/${project.slug}/windows`)
  await expect(page.locator('[data-palette-ready="true"]')).toBeAttached()
  await bar(page)
    .getByRole('button', { name: /^Open command palette/ })
    .click()
  const dialog = page.getByRole('dialog', { name: copy('Command palette') })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('combobox', { name: copy('Search commands') })).toBeFocused()
  await expect(dialog.getByRole('group', { name: copy('Suggestions') })).toBeVisible()
  for (const name of [
    'Review',
    'Windows',
    'Signals',
    'Calls',
    'Ledger',
    'Overview',
    'Analysis',
    'Subscribers',
    'Project settings',
    'Dashboard',
    'Projects',
    'Organisation analysis',
    'Webhooks',
    'Organisation settings',
    'Connect your AI',
    'Account'
  ])
    await expect(dialog.getByRole('option', { name: copy(name), exact: true })).toBeAttached()
  await page.getByRole('combobox', { name: copy('Search commands') }).fill('ledger')
  await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('option', { name: copy('Ledger'), exact: true })).toBeVisible()
  const navigation = page.waitForURL(`**/${org.slug}/${project.slug}/ledger`)
  await dialog.getByRole('option', { name: copy('Ledger'), exact: true }).click()
  await navigation
})
