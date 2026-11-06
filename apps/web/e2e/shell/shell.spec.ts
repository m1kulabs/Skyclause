import type { Page } from '@playwright/test'
import { pseudo } from '../../../../packages/i18n/src/pseudo'
import { test, expect } from '../fixtures'
import { stubApi } from '../harness/stub-api'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { shellOperations } from '../../features/shell/operations'
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
const preferences = {
  theme: 'dark',
  high_contrast: false,
  density: 'comfortable',
  reduced_motion: false,
  language: 'en',
  shortcuts: true,
  sidebar_collapsed: true
}

async function openShell(page: Page, shellData: ShellData = data, scope = '?org=test-one&project=test-project') {
  await page.context().addCookies([
    {
      name: 'skyclause-test-shell',
      value: encodeURIComponent(JSON.stringify(shellData)),
      url: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
      httpOnly: true
    }
  ])
  await page.goto(`/_test/shell${scope}`)
  await expect(page.locator('.app-shell')).toBeVisible()
  await expect(page.locator('[data-shell-ready="true"]')).toBeAttached()
}

test('keyboard order is skip link, sidebar, top line, then the nine project tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShell(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: copy('Skip to content') })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.shell-sidebar').getByRole('button', { name: /Switch organisation:/ })).toBeFocused()
  for (let index = 0; index < 11; index++) await page.keyboard.press('Tab')
  await expect(page.locator('.shell-topline').getByRole('button', { name: /Switch organisation:/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /Switch project:/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /Open command palette/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('.shell-project-tabs a').first()).toBeFocused()
  await expect(page.locator('.shell-project-tabs a')).toHaveCount(9)
})

test('skip link moves focus to page content', async ({ page }) => {
  await openShell(page)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('#shell-content')).toBeFocused()
})

test('375px has five labelled bottom items with 44px targets and a scope sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openShell(page)
  await expect(page.locator('.shell-sidebar')).toBeHidden()
  const items = page.locator('.shell-bottom-bar > a, .shell-bottom-bar > button')
  await expect(items).toHaveCount(5)
  for (const item of await items.all()) {
    expect((await item.innerText()).trim()).not.toBe('')
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await expect(page.locator('.shell-desktop-scope')).toBeHidden()
  await expect(page.locator('.shell-phone-scope')).toContainText('Test project one')
  await page.getByRole('button', { name: /Switch organisation or project:/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText(copy('Owner'))
  await expect(page.getByRole('dialog')).toContainText(copy('Viewer'))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /Switch organisation or project:/ })).toBeFocused()
})

test('900px uses a 50px rail with accessible names and dismissable tooltips', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 })
  await openShell(page)
  expect((await page.locator('.shell-sidebar').boundingBox())!.width).toBe(50)
  const dashboard = page.locator('.shell-sidebar').getByRole('link', { name: copy('Dashboard'), exact: true })
  await dashboard.hover()
  await expect(page.getByRole('tooltip')).toHaveText(copy('Dashboard'))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await page.mouse.move(400, 400)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(dashboard).toBeFocused()
  await expect(page.getByRole('tooltip')).toHaveText(copy('Dashboard'))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
})

test('1280px shows the 224px labelled sidebar and 48px top line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await openShell(page)
  expect((await page.locator('.shell-sidebar').boundingBox())!.width).toBe(224)
  expect((await page.locator('.shell-topline').boundingBox())!.height).toBe(48)
  await expect(page.locator('.shell-sidebar .shell-nav-label').first()).toBeVisible()
  await expect(page.locator('.shell-brand')).toHaveText(copy('Skyclause'))
})

test('switchers list only supplied memberships with roles and projects in that organisation', async ({ page }) => {
  await openShell(page)
  await page
    .locator('.shell-topline')
    .getByRole('button', { name: /Switch organisation:/ })
    .click()
  await expect(page.getByRole('menuitem')).toHaveCount(2)
  await expect(page.getByRole('menu')).toContainText(copy('Owner'))
  await expect(page.getByRole('menu')).toContainText(copy('Viewer'))
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Switch project:/ }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(1)
  await expect(page.getByRole('menu')).toContainText('Test project one')
  await expect(page.getByRole('menu')).not.toContainText('Other organisation project')
})

test('empty data prints n=0 with the next action and no sample organisations', async ({ page }) => {
  await openShell(page, { memberships: [], projects: [] }, '')
  await expect(page.locator('main')).toContainText(copy('Organisations: n=0'))
  await expect(page.locator('main').getByRole('link', { name: copy('Create an organisation') })).toHaveAttribute(
    'href',
    '/new'
  )
  await expect(page.locator('main')).not.toContainText('Test organisation')
})

test('a membership without projects shows n=0 and its role-appropriate next action', async ({ page }) => {
  await openShell(page, { ...data, projects: [] }, '?org=test-one')
  await page.getByRole('button', { name: /Switch project:/ }).press('Enter')
  await expect(page.getByRole('menu')).toContainText(copy('Projects: n=0'))
  const nextAction = page.getByRole('menuitem', { name: copy('Create a project') })
  await expect(nextAction).toBeFocused()
  await expect(nextAction).toHaveAttribute('href', '/test-one/new')
})

test('rail preference PATCH uses stubApi and survives the next server-provided preference', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await stubApi(page, 'updateMyPreferences', preferences, { registry: shellOperations })
  await openShell(page)
  const request = page.waitForRequest(
    (request) => request.url().endsWith('/api/me/preferences') && request.method() === 'PATCH'
  )
  await page.getByRole('button', { name: copy('Collapse sidebar') }).press('Enter')
  expect((await request).postDataJSON()).toEqual({ sidebar_collapsed: true })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-collapsed', 'true')
  expect((await page.locator('.shell-sidebar').boundingBox())!.width).toBe(50)
  await openShell(page, { ...data, sidebarCollapsed: true })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-collapsed', 'true')
})

test('a failed preference write restores the sidebar and explains how to retry', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/me/preferences', (route) => route.fulfill({ status: 501, json: { title: 'Not built' } }))
  await openShell(page)
  await page.getByRole('button', { name: copy('Collapse sidebar') }).press('Enter')
  await expect(page.locator('.app-shell').getByRole('alert')).toHaveText(
    copy('Sidebar preference was not saved. Try again.')
  )
  await expect(page.locator('.app-shell')).toHaveAttribute('data-collapsed', 'false')
})

for (const theme of ['dark', 'light', 'high contrast'] as const) {
  test(`axe passes in ${theme} and the active label uses the selection thickness`, async ({ page, expectAxeClean }) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high contrast' ? 'more' : 'standard'
        }),
        url: process.env.E2E_BASE_URL ?? 'http://localhost:3100'
      }
    ])
    await openShell(page)
    await expectAxeClean(page)
    const active = page.locator('.shell-project-tabs [aria-current="page"] span')
    const style = await active.evaluate((element) => ({
      thickness: getComputedStyle(element).textDecorationThickness,
      color: getComputedStyle(element).textDecorationColor,
      selection: getComputedStyle(element).getPropertyValue('--selection')
    }))
    expect(style.thickness).toBe(theme === 'high contrast' ? '2px' : '1px')
  })
}

test('labels and tabs do not clip, including the 30 percent pseudo locale', async ({ page }) => {
  for (const width of [375, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await openShell(page)
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const tabs = page.locator('.shell-project-tabs')
    await tabs.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect(tabs.getByRole('link', { name: copy('Settings'), exact: true })).toBeInViewport()
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
  for (const width of [375, 900, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await openShell(page, longData)
    await expectUnclippedText(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: /Open command palette/ })).toBeInViewport()
  }
})
