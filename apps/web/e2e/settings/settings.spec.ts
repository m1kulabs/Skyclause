import type { Page } from '@playwright/test'
import type { Principal, Role } from '@skyclause/contracts'
import { expect, test } from '../fixtures'
import { asPage } from '../harness'
import { makeOrg, signInAs } from '../harness/sign-in-as'
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
    if (path === '/account/notifications') await expect(page.locator('[data-alerts-panel]')).toBeVisible()
    else if (['/account/profile', '/account/security', '/account/appearance'].includes(path)) {
      await expect(page.locator(`[data-account-panel="${path.slice('/account/'.length)}"]`)).toBeVisible()
    } else if (path.endsWith('/settings/integrations')) {
      await expect(page.getByRole('heading', { name: 'OAuth clients', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Connected grants', exact: true })).toBeVisible()
    } else {
      // #102 built the organisation general panel, #108 billing, audit and data, #104 members and rota, and #196
      // webhooks; the rest are placeholders.
      const builtBy102 = /^\/[^/]+\/settings\/general$/.test(path)
      const builtBy108 = path === '/account/data' || /\/settings\/(?:billing|audit|data)$/.test(path)
      const builtBy104 = /\/settings\/(members|rota)$/.test(path)
      const builtBy196 = path.endsWith('/settings/webhooks')
      await expect(page.locator('[data-settings-panel] [data-unbuilt]')).toHaveCount(
        builtBy102 || builtBy108 || builtBy104 || builtBy196 ? 0 : 1
      )
    }
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

// SET-3 turns on the URL organisation's membership, so these run on real sessions (#94's signInAs).
for (const role of ['admin', 'owner'] as const) {
  test(`SET-3 all ten routes admit ${role}`, async ({ page }) => {
    const org = await makeOrg()
    await signInAs(page, role, org)
    for (const section of organisation) await expectPage(page, `/${org.slug}/settings/${section}`, true)
    await expect(page.locator('[data-settings-nav] a')).toHaveCount(organisation.length)
  })
}

test('SET-3 an Approver gets only rota and its nav contains no forbidden sections', async ({ page }) => {
  const org = await makeOrg()
  await signInAs(page, 'approver', org)
  for (const section of organisation) await expectPage(page, `/${org.slug}/settings/${section}`, section === 'rota')
  await page.goto(`/${org.slug}/settings/rota`)
  await expect(page.locator('[data-settings-nav] a')).toHaveCount(1)
})

test('SET-3 another organisation gets not-found on every route, including rota', async ({ page }) => {
  const [org, another] = [await makeOrg(), await makeOrg()]
  await signInAs(page, 'owner', org)
  for (const section of organisation) await expectPage(page, `/${another.slug}/settings/${section}`, false)
})

test('SET-4 keyboard navigation reaches all panels', async ({ page }) => {
  await asPage(page, principal())
  for (const section of project) {
    await page.goto('/test-org/test-project/settings')
    const href = `/test-org/test-project/settings/${section}`
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
    await expect(page.locator('[data-settings-frame]:visible')).toBeVisible()
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
  for (const section of ['profile', 'security', 'appearance'] as const) {
    test(`account settings axe: ${section}, ${mode.theme}, ${mode.contrast}`, async ({
      page,
      baseURL,
      expectAxeClean
    }, testInfo) => {
      await asPage(page, principal())
      await page
        .context()
        .addCookies([{ url: baseURL!, name: 'skyclause-test-appearance', value: JSON.stringify(mode) }])
      await page.goto(`/account/${section}`)
      await expect(page.locator('html')).toHaveClass(mode.contrast === 'more' ? 'dark hc' : mode.theme)
      await expectAxeClean(page)
      await page.screenshot({
        path: testInfo.outputPath(`settings-${section}-${mode.theme}-${mode.contrast}.png`),
        fullPage: true
      })
    })
  }
}

test('settings frame fills the shell column in 428/700 columns, rests on tone, and stacks below 860px', async ({
  page
}, testInfo) => {
  await asPage(page, principal())
  // The column is the shell's 1200px, so the 428 + 24 + 700 row fits from 1248px.
  await page.setViewportSize({ width: 1680, height: 900 })
  await page.goto('/account/profile')
  const columns = await page.locator('[data-settings-columns]').evaluate((element) => {
    const style = getComputedStyle(element)
    return { tracks: style.gridTemplateColumns.split(' ').map(parseFloat), gap: style.columnGap }
  })
  expect(columns.gap).toBe('24px')
  expect(columns.tracks).toHaveLength(2)
  expect(columns.tracks[0]! / columns.tracks[1]!).toBeCloseTo(428 / 700, 2)
  // Sections separate by space and tone, never by rules; the panel is a 16px surface with no border.
  await expect(page.locator('[data-settings-frame] [data-slot=separator]')).toHaveCount(0)
  const panel = page.locator('[data-settings-panel]')
  await expect(panel).toHaveCSS('border-top-width', '0px')
  await expect(panel).toHaveCSS('border-top-left-radius', '16px')
  await expect(page.locator('[data-settings-nav] a[aria-current="page"]')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('settings-desktop.png'), fullPage: true })
  for (const width of [1440, 900]) {
    await page.setViewportSize({ width, height: 900 })
    const tracks = await page
      .locator('[data-settings-columns]')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').map(parseFloat))
    expect(tracks).toHaveLength(2)
    expect(tracks[0]! / tracks[1]!).toBeCloseTo(428 / 700, 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await expectUnclippedText(page)
  const label = await page.locator('[data-settings-label]').boundingBox()
  const phonePanel = await page.locator('[data-settings-panel]').boundingBox()
  expect(phonePanel!.y).toBeGreaterThan(label!.y + label!.height)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
  await page.screenshot({ path: testInfo.outputPath('settings-phone.png'), fullPage: true })
})
