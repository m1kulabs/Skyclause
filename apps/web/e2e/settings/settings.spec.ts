import type { Page } from '@playwright/test'
import type { Principal, Role } from '@skyclause/contracts'
import { expect, test } from '../fixtures'
import { asPage } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'

const account = ['profile', 'security', 'appearance', 'notifications', 'ai-keys', 'api-keys', 'data']
const organisation = [
  'general',
  'members',
  'rota',
  'billing',
  'audit',
  'ai-keys',
  'api-keys',
  'webhooks',
  'integrations',
  'data'
]
const project = ['packs', 'channels', 'rota', 'public', 'share']

function principal(role: Role = 'admin', isGuest = false): Principal {
  return {
    kind: 'session',
    client: 'app',
    clientName: null,
    via: 'cookie',
    accountId: 'test-account',
    sessionId: 'test-session',
    authenticatedAt: new Date('2026-11-06T00:00:00Z'),
    orgId: 'test-org',
    role,
    isGuest,
    staff: false
  }
}

async function expectPage(page: Page, path: string, allowed: boolean) {
  const response = await page.goto(path)
  if (allowed) {
    expect(response?.status(), path).toBe(200)
    await expect(page.locator('[data-settings-frame]')).toBeVisible()
    await expect(page.locator('[data-settings-panel] [data-unbuilt]')).toHaveCount(1)
  } else {
    // Next may stream a 200 shell before a page-level notFound; the rendered 404 is the gate.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.locator('[data-settings-frame]')).toHaveCount(0)
  }
}

test('SET-1 all seven routes admit a signed-in account', async ({ page }) => {
  await asPage(page, principal('viewer'))
  for (const section of account) await expectPage(page, `/account/${section}`, true)
})

test('SET-1 guests get appearance only', async ({ page }) => {
  await asPage(page, principal('guest', true))
  for (const section of account) await expectPage(page, `/account/${section}`, section === 'appearance')
  await expectPage(page, '/account/does-not-exist', false)
})

for (const role of ['admin', 'owner'] as const) {
  test(`SET-3 all ten routes admit ${role}`, async ({ page }) => {
    await asPage(page, principal(role))
    for (const section of organisation) await expectPage(page, `/test-org/settings/${section}`, true)
  })
}

test('SET-3 an Approver gets only rota and its nav contains no forbidden sections', async ({ page }) => {
  await asPage(page, principal('approver'))
  for (const section of organisation) await expectPage(page, `/test-org/settings/${section}`, section === 'rota')
  await page.goto('/test-org/settings/rota')
  await expect(page.locator('[data-settings-nav] a')).toHaveCount(1)
})

test('SET-3 another organisation gets not-found on every route, including rota', async ({ page }) => {
  await asPage(page, principal('owner'))
  for (const section of organisation) await expectPage(page, `/another-org/settings/${section}`, false)
})

test('SET-4 keyboard navigation reaches all panels and clause sheet versions', async ({ page }) => {
  await asPage(page, principal())
  for (const section of [...project, 'clauses']) {
    await page.goto('/test-org/test-project/settings')
    const href = section === 'clauses' ? '/test-org/test-project/clauses' : `/test-org/test-project/settings/${section}`
    const link = page.locator(`[data-settings-nav] a[href="${href}"]`)
    // Start before the section nav, then use only Tab and Enter to follow its links.
    await page.locator('[data-settings-frame] h1').focus()
    for (let step = 0; step < 9; step++) {
      await page.keyboard.press('Tab')
      if (await link.evaluate((element) => element === document.activeElement)) break
    }
    await expect(link).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(href)
    if (section !== 'clauses') await expect(page.locator('[data-settings-frame]:visible')).toBeVisible()
  }
})

test('SET-4 denies Approvers and a different organisation', async ({ page }) => {
  await asPage(page, principal('approver'))
  for (const section of ['', ...project])
    await expectPage(page, `/test-org/test-project/settings${section ? `/${section}` : ''}`, false)
  await asPage(page, principal('owner'))
  await expectPage(page, '/another-org/test-project/settings', false)
})

for (const mode of [
  { theme: 'dark', contrast: 'standard' },
  { theme: 'light', contrast: 'standard' },
  { theme: 'dark', contrast: 'more' }
] as const) {
  test(`settings axe: ${mode.theme}, ${mode.contrast}`, async ({ page, baseURL, expectAxeClean }, testInfo) => {
    await asPage(page, principal())
    await page.context().addCookies([{ url: baseURL!, name: 'skyclause-test-appearance', value: JSON.stringify(mode) }])
    await page.goto('/account/profile')
    await expect(page.locator('html')).toHaveClass(mode.contrast === 'more' ? 'dark hc' : mode.theme)
    await expectAxeClean(page)
    await page.screenshot({ path: testInfo.outputPath('settings-theme.png'), fullPage: true })
  })
}

test('settings frame uses 428/24/700 columns and stacks below 640px', async ({ page }, testInfo) => {
  await asPage(page, principal())
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/account/profile')
  const columns = await page.locator('[data-settings-columns]').evaluate((element) => {
    const style = getComputedStyle(element)
    return { columns: style.gridTemplateColumns, gap: style.columnGap }
  })
  expect(columns).toEqual({ columns: '428px 700px', gap: '24px' })
  const rules = page.locator('[data-settings-frame] [data-slot=separator]')
  await expect(rules).toHaveCount(2)
  for (const rule of await rules.all()) await expect(rule).toHaveCSS('height', '1px')
  await page.screenshot({ path: testInfo.outputPath('settings-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await expectUnclippedText(page)
  const label = await page.locator('[data-settings-label]').boundingBox()
  const panel = await page.locator('[data-settings-panel]').boundingBox()
  expect(panel!.y).toBeGreaterThan(label!.y + label!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await page.screenshot({ path: testInfo.outputPath('settings-phone.png'), fullPage: true })
})
