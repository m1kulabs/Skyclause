import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures'
import { dashboardOperations } from '../../features/dashboard/operations'
import { stubApi } from '../harness'
import {
  emptyDashboard,
  filledDashboard,
  healthyDashboard,
  ids,
  org,
  project,
  stubComposedReads,
  stubDashboard
} from './doubles'

async function openPalette(page: Page) {
  await expect(page.locator('[data-palette-ready="true"]')).toBeAttached()
  await page.keyboard.press('Control+k')
}

async function waitForBundleFade(page: Page) {
  const entry = page.locator('[data-dashboard-bundle-entry="new"]')
  // The read lands after goto; checking for the entry while the skeleton shows would skip the fade wait.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  if (await entry.count()) {
    await expect(entry).toHaveCSS('animation-duration', '0.2s')
    await entry.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
    })
    await expect(entry).toHaveCSS('opacity', '1')
    await expect(entry).toHaveCSS('transform', 'none')
  }
}

test('DSH-1 keeps every dashboard block in DOM and visual order at desktop and phone widths', async ({
  page,
  expectAxeClean
}) => {
  await stubDashboard(page, { filled: true })
  const expectedOrder = ['needs_review', 'windows_at_risk', 'signal_health', 'upcoming_risks', 'yesterday_grades']
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/${org.slug}`)
  const blocks = page.locator('[data-dashboard-block]')
  await expect(blocks).toHaveCount(5)
  async function expectOrderAtCurrentWidth() {
    const order = await blocks.evaluateAll((nodes) =>
      nodes.map((node) => ({ id: node.getAttribute('data-dashboard-block'), top: node.getBoundingClientRect().top }))
    )
    expect(order.map((item) => item.id)).toEqual(expectedOrder)
    expect(order.every((item, index) => index === 0 || item.top >= order[index - 1]!.top)).toBe(true)
  }
  await expectOrderAtCurrentWidth()
  await expect(blocks.first()).toContainText('SLA')
  await page.setViewportSize({ width: 375, height: 812 })
  await expectOrderAtCurrentWidth()
  await waitForBundleFade(page)
  await expectAxeClean(page)
  await expect(page.locator('[data-dashboard-block]').first()).toBeInViewport()
  await page.setViewportSize({ width: 320, height: 640 })
  await expectOrderAtCurrentWidth()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('DSH-2 a new organisation offers one action and prints n=0 once per block, without charts', async ({
  page,
  expectAxeClean
}) => {
  await stubDashboard(page, { noProjects: true })
  await page.goto(`/${org.slug}`)
  await expect(page.getByText(/No projects yet \(n=0\)/)).toBeVisible()
  // Create a project once, as the page's one primary action; no other block has a button or a link.
  await expect(page.getByRole('link', { name: 'Create a project' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Create a project' })).toHaveAttribute('href', `/${org.slug}/new`)
  const blocks = page.locator('[data-dashboard-block]')
  await expect(blocks).toHaveCount(5)
  await expect(blocks.locator('a, button')).toHaveCount(0)
  for (const block of await blocks.all()) {
    expect(((await block.innerText()).match(/n=0/g) ?? []).length).toBe(1)
  }
  await expect(
    page.getByText(/No graded windows yet \(n=0\)\. Grades arrive by 06:45\u00a0MYT the morning after a window\./)
  ).toBeVisible()
  await expect(page.locator('[data-chart], [data-window-strip], [data-wilson-interval]')).toHaveCount(0)
  await expectAxeClean(page)
})

test('an organisation with projects keeps one action per empty block and prints n=0 once', async ({ page }) => {
  await stubDashboard(page)
  await page.goto(`/${org.slug}`)
  const blocks = page.locator('[data-dashboard-block]')
  await expect(blocks).toContainText(['No bundles need review', 'No windows at risk', 'No sources connected'])
  for (const block of await blocks.all()) {
    expect(((await block.innerText()).match(/n=0/g) ?? []).length).toBe(1)
    await expect(block.getByRole('link')).toHaveCount(1)
  }
})

test('dashboard renders a source error without a stale value and labels unknown risk as unknown', async ({ page }) => {
  await stubDashboard(page, { filled: true })
  await page.goto(`/${org.slug}`)
  const signal = page.locator('[data-dashboard-block="signal_health"]')
  await expect(signal).toContainText('Sg. Kuyoh error since 14:40 MYT · HTTP 503')
  await expect(signal).not.toContainText('39.0 mm')
  const risk = page.locator('[data-dashboard-block="upcoming_risks"]')
  await expect(risk.locator('li')).toContainText('Unknown')
  await expect(risk.locator('li')).not.toContainText('storm afternoon')
})

test('DSH-5 searches SP17 through the search operation and opens its returned signal href', async ({ page }) => {
  await stubDashboard(page)
  await stubApi(
    page,
    'searchOrganisation',
    {
      data: [
        {
          kind: 'source',
          id: '019a45b0-0000-7000-8000-000000000013',
          label: 'SP17 · Sentul Timur',
          href: `/${org.slug}/${project.slug}/signals?source=SP17`,
          project_id: project.id,
          external_id: 'SP17'
        }
      ],
      next_cursor: null
    },
    { registry: dashboardOperations, query: { q: 'SP17' } }
  )
  await page.goto(`/${org.slug}`)
  await openPalette(page)
  const search = page.getByRole('combobox', { name: 'Search commands' })
  await search.fill('SP17')
  const option = page.getByRole('option', { name: 'SP17 · Sentul Timur' })
  await expect(option).toBeVisible()
  await expect(option).toHaveAttribute('aria-selected', 'true')
  const target = `http://localhost:${process.env.E2E_PORT ?? 3100}/${org.slug}/${project.slug}/signals?source=SP17`
  const navigation = page.waitForRequest((request) => request.isNavigationRequest() && request.url() === target)
  const navigationComplete = page.waitForNavigation({ waitUntil: 'load' })
  await page.keyboard.press('Enter')
  expect((await navigation).url()).toBe(target)
  await navigationComplete
})

test('palette role filtering hides Declare a window from Viewers and theme changes without reload', async ({
  page,
  expectAxeClean
}) => {
  await stubDashboard(page, { role: 'viewer' })
  await page.goto('/account/appearance')
  await openPalette(page)
  const dialog = page.getByRole('dialog', { name: 'Command palette' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Search commands' })).toBeFocused()
  await expectAxeClean(page)
  await expect(dialog.getByText('Declare a window', { exact: true })).toHaveCount(0)
  const url = page.url()
  await page.getByRole('combobox', { name: 'Search commands' }).fill('Light')
  await expect(dialog.getByRole('option', { name: 'Light', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/light/)
  expect(page.url()).toBe(url)
})

test('dashboard states and the open palette are axe-clean in dark, light and high contrast', async ({
  page,
  baseURL,
  expectAxeClean
}) => {
  test.slow()
  const themes = [
    { name: 'dark', colorScheme: 'dark' as const, contrast: 'no-preference' as const },
    { name: 'light', colorScheme: 'light' as const, contrast: 'no-preference' as const },
    { name: 'high contrast', colorScheme: 'dark' as const, contrast: 'more' as const }
  ]
  const stateCases = [
    { name: 'empty', options: { noProjects: true } },
    { name: 'filled', options: { filled: true, dashboard: healthyDashboard } },
    { name: 'source error', options: { filled: true } }
  ]

  for (const theme of themes) {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme.name === 'light' ? 'light' : 'dark',
          contrast: theme.contrast === 'more' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await page.emulateMedia({ colorScheme: theme.colorScheme, contrast: theme.contrast })

    for (const state of stateCases) {
      await page.unrouteAll({ behavior: 'wait' })
      await stubDashboard(page, state.options)
      await page.goto(`/${org.slug}`)
      if (state.name === 'filled' || state.name === 'source error') await waitForBundleFade(page)
      await expectAxeClean(page)
      test.info().annotations.push({ type: 'axe state', description: `${state.name} · ${theme.name}` })
    }

    await page.unrouteAll({ behavior: 'wait' })
    await stubDashboard(page, { noProjects: true })
    await page.route('**/v1/dashboard', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyDashboard) })
    })
    await page.goto(`/${org.slug}`)
    await expect(page.locator('[aria-busy="true"]')).toBeVisible()
    await expectAxeClean(page)
    test.info().annotations.push({ type: 'axe state', description: `loading · ${theme.name}` })

    await page.unrouteAll({ behavior: 'wait' })
    await stubDashboard(page, { role: 'owner' })
    await page.goto(`/${org.slug}`)
    await openPalette(page)
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
    await expectAxeClean(page)
    test.info().annotations.push({ type: 'axe state', description: `palette open · ${theme.name}` })
  }
})

test('the new bundle appears before the next block and opens its own review', async ({ page }) => {
  await stubDashboard(page, { filled: true })
  await page.goto(`/${org.slug}`)
  await expect(page.getByRole('link', { name: 'Review bundle' })).toHaveAttribute(
    'href',
    `/${org.slug}/${project.slug}/bundles/${ids.bundle}`
  )
  // The approvals queue is not built (DSH-4): nothing on the dashboard links to it.
  await expect(page.locator('main a[href*="/approvals"]')).toHaveCount(0)
  await expect(page.locator('[data-dashboard-block="needs_review"] [data-bundle]')).toHaveCount(1)
  await expect(page.locator('[data-dashboard-block="needs_review"] [data-window-strip]')).toHaveCount(1)
  await expect(page.locator('[data-dashboard-block="yesterday_grades"]')).toContainText('Wilson 95%')
})

test('the review finding uses its call window when today has no matching at-risk row', async ({ page }) => {
  await stubDashboard(page, {
    filled: true,
    dashboard: {
      ...filledDashboard,
      windows_at_risk: { ...filledDashboard.windows_at_risk, data: [], n: 0 }
    }
  })
  await page.goto(`/${org.slug}`)
  await expect(page.locator('section[aria-labelledby="dashboard-title"] > header')).toContainText(
    'Replay · 2 November 2026 · first release wave'
  )
})

test('loading uses static bars with every dashboard header', async ({ page, expectAxeClean }) => {
  await stubDashboard(page, { noProjects: true })
  await page.route('**/v1/dashboard', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1400))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(emptyDashboard) })
  })
  await page.goto(`/${org.slug}`)
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.locator('[data-dashboard-block]')).toHaveCount(5)
  await expect(page.locator('[data-dashboard-block] h2')).toHaveCount(5)
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(9)
  await expect(page.locator('[data-slot="skeleton"]').first()).not.toHaveClass(/animate/)
  await expectAxeClean(page)
  await expect(page.getByText(/No projects yet \(n=0\)/)).toBeVisible({ timeout: 5000 })
})

test('today’s windows at risk lie on the day strip, each listed with a link to its window', async ({ page }) => {
  await stubDashboard(page)
  const atRisk = filledDashboard.windows_at_risk.data[0]!
  const data = Array.from({ length: 8 }, (_, index) => ({
    ...atRisk,
    window: {
      ...atRisk.window,
      id: `019a45b0-0000-7000-8000-${String(index + 31).padStart(12, '0')}`,
      title: `Window ${index + 1}`
    }
  }))
  await stubApi(
    page,
    'getDashboard',
    { ...emptyDashboard, windows_at_risk: { data, n: data.length, next_action: 'Open the calendar' } },
    { registry: dashboardOperations }
  )
  await page.goto(`/${org.slug}`)
  const risk = page.locator('[data-dashboard-block="windows_at_risk"]')
  await expect(risk.locator('.day-strip [data-window]')).toHaveCount(8)
  await expect(risk.locator('[data-window-row]')).toHaveCount(8)
  await expect(risk.getByRole('link', { name: 'Window 1', exact: true })).toHaveAttribute(
    'href',
    `/${org.slug}/${project.slug}/windows?window=${data[0]!.window.id}`
  )
  await expect(risk.getByRole('link', { name: 'Open the calendar' })).toHaveAttribute(
    'href',
    `/${org.slug}/${project.slug}/windows`
  )
})

test('while getDashboard is not built, the dashboard is composed from the reads that are built', async ({
  page,
  expectAxeClean
}) => {
  await stubDashboard(page)
  await stubComposedReads(page)
  await page.goto(`/${org.slug}`)
  const review = page.locator('[data-dashboard-block="needs_review"]')
  // The bar's Review control lands on this heading in every state.
  await expect(review.locator('h2#dashboard-needs-review')).toHaveText('Needs review')
  await expect(review.locator('[data-bundle]')).toHaveCount(1)
  await expect(review.getByRole('link', { name: 'Review bundle' })).toBeVisible()
  // Today's window above Normal, from its latest call (a draft, so said to be unreviewed).
  const risk = page.locator('[data-dashboard-block="windows_at_risk"]')
  await expect(risk.locator('.day-strip [data-window]')).toHaveCount(1)
  await expect(risk).toContainText('A draft is not reviewed yet.')
  await expect(page.locator('[data-dashboard-block="signal_health"]')).toContainText('Sg. Kuyoh')
  await expect(page.locator('[data-dashboard-block="upcoming_risks"] li')).toHaveCount(1)
  await expect(page.locator('[data-dashboard-block="yesterday_grades"] [data-grade]')).toHaveCount(1)
  await expect(page.locator('[data-source-error]')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/not built|answered|501/i)
  await expectAxeClean(page)
})

test('a composed block whose read fails says so for that block only; one not available yet offers no Retry', async ({
  page
}) => {
  await stubDashboard(page)
  await stubComposedReads(page, { listProjectSources: 503, listGrades: 501 })
  await page.goto(`/${org.slug}`)
  const signals = page.locator('[data-dashboard-block="signal_health"]')
  await expect(signals.locator('[data-source-error="503"]')).toContainText('Couldn’t read the sources just now.')
  await expect(signals.getByRole('button', { name: 'Try again' })).toBeVisible()
  const grades = page.locator('[data-dashboard-block="yesterday_grades"]')
  await expect(grades.locator('[data-source-error="501"]')).toContainText(
    'Skyclause can’t show yesterday’s grades yet.'
  )
  await expect(grades.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  // The other blocks still render from their own reads.
  await expect(page.locator('[data-dashboard-block="needs_review"] [data-bundle]')).toHaveCount(1)
  await expect(page.locator('[data-dashboard-block="upcoming_risks"] li')).toHaveCount(1)
  await expect(page.locator('main')).not.toContainText(/not built|answered|50[13]/i)
})

test('a dashboard read that failed offers Try again', async ({ page }) => {
  await stubDashboard(page)
  await stubApi(page, 'getDashboard', { title: 'Unavailable' }, { registry: dashboardOperations, status: 503 })
  await page.goto(`/${org.slug}`)
  const review = page.locator('[data-dashboard-block="needs_review"]')
  await expect(review.locator('[data-source-error="503"]')).toBeVisible()
  await expect(review.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('palette finds each resource ID and all three station IDs through GET /v1/search', async ({ page }) => {
  await stubDashboard(page, { role: 'owner' })
  const cases = [
    { query: org.id, label: 'Open organisation Test organisation', href: `/${org.slug}`, kind: null },
    { query: project.id, label: 'Open project Test project', href: `/${org.slug}/${project.slug}`, kind: null },
    {
      query: '019a45b0-0000-7000-8000-000000000031',
      label: 'Window 019a45b0-0000-7000-8000-000000000031',
      href: `/${org.slug}/${project.slug}/windows?window=019a45b0-0000-7000-8000-000000000031`,
      kind: 'window' as const
    },
    {
      query: ids.bundle,
      label: 'Bundle review',
      href: `/${org.slug}/approvals?item=${ids.bundle}`,
      kind: 'bundle' as const
    },
    {
      query: ids.call,
      label: 'Call record',
      href: `/${org.slug}/${project.slug}/bundles/${ids.call}`,
      kind: 'call' as const
    },
    {
      query: '019a45b0-0000-7000-8000-000000000032',
      label: 'Ledger entry',
      href: `/${org.slug}/${project.slug}/ledger?entry=019a45b0-0000-7000-8000-000000000032`,
      kind: 'ledger' as const
    },
    ...['0232901RF', 'CA16W', 'SP17'].map((station) => ({
      query: station,
      label: `${station} · station`,
      href: `/${org.slug}/${project.slug}/signals?source=${station}`,
      kind: 'source' as const,
      external_id: station
    }))
  ]
  for (const item of cases) {
    const result = item.kind
      ? {
          kind: item.kind,
          id: item.kind === 'source' ? '019a45b0-0000-7000-8000-000000000033' : item.query,
          label: item.label,
          href: item.href,
          project_id: project.id,
          external_id: 'external_id' in item ? item.external_id : null
        }
      : null
    await stubApi(
      page,
      'searchOrganisation',
      { data: result ? [result] : [], next_cursor: null },
      { registry: dashboardOperations, query: { q: item.query } }
    )
  }

  for (const item of cases) {
    await page.goto('/account/appearance')
    await openPalette(page)
    const search = page.getByRole('combobox', { name: 'Search commands' })
    await search.fill(item.query)
    const option = page.getByRole('option', { name: item.label, exact: true })
    await expect(option).toBeVisible()
    if ('external_id' in item) await expect(option.locator('[translate="no"]')).toHaveCount(1)
    const target = new URL(item.href, page.url()).toString()
    const navigation = page.waitForRequest((request) => request.isNavigationRequest() && request.url() === target)
    const navigationComplete = page.waitForNavigation({ waitUntil: 'load' })
    await page.keyboard.press('Enter')
    expect((await navigation).url()).toBe(target)
    await navigationComplete
  }
})

test('a healthy filled dashboard renders from its read and stays axe-clean', async ({ page, expectAxeClean }) => {
  await stubDashboard(page, { filled: true, dashboard: healthyDashboard })
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more' })
  await page.goto(`/${org.slug}`)
  await expect(page.getByRole('link', { name: 'Review bundle' })).toBeVisible()
  await waitForBundleFade(page)
  await expectAxeClean(page)
})

test('Declare a window asks for a project, then opens the existing window form', async ({ page }) => {
  await stubDashboard(page, { role: 'approver' })
  await page.goto(`/${org.slug}`)
  await openPalette(page)
  const search = page.getByRole('combobox', { name: 'Search commands' })
  await search.fill('Declare a window')
  await expect(page.getByRole('option', { name: 'Declare a window', exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option', { name: 'Declare a window · Test project' })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/${org.slug}/${project.slug}/windows\\?declare=window$`))
  await expect(page.getByRole('dialog')).toContainText('Declare a window')
})
