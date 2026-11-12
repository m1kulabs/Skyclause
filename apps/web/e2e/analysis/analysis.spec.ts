import { test, expect as baseExpect } from '../fixtures'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { expectZonedTimes } from '../harness/expect-zoned-times'
import { analysisOperations as registry } from '../../features/analysis/operations'
import { stubApi } from '../harness'
import {
  setup,
  copy,
  tabName,
  projectRoute,
  orgRoute,
  projectId,
  sheetId,
  draftId,
  replayQuery,
  detailedGrade,
  at
} from './fixtures'

// The route waits for the shared server shell before browser-stubbed reads can start.
test.describe.configure({ timeout: 60_000 })
const expect = baseExpect.configure({ timeout: 15_000 })

for (const path of [projectRoute, orgRoute]) {
  test(`ANL-5 ${path} renders API figures with Wilson bars, n and period`, async ({ page }) => {
    await setup(page)
    await page.goto(path)
    const root = page.locator('[data-analysis-page]')
    await expect(root.locator('[data-metric=precision]').first()).toContainText('n=8')
    await expect(root.locator('[data-point-tick]').first()).toHaveAttribute('stroke-width', '2')
    await expect(root.locator('[data-metric=precision]').first()).toContainText('53%')
    await expect(root.locator('[data-metric=precision]').first()).toContainText('2026')
    await expect(root.getByRole('heading', { name: copy('fullTable') })).toBeVisible()
    await expectZonedTimes(page)
  })
  test(`ANL-5 ${path} n=0 draws no chart or interval and prints the next action`, async ({ page }) => {
    await setup(page, { empty: true })
    await page.goto(path)
    const root = page.locator('[data-analysis-page]')
    await expect(root).toContainText(copy('emptyFinding'))
    await expect(root).toContainText(copy('next'))
    await expect(root.locator('[data-slot=chart], [data-point-tick]')).toHaveCount(0)
    await expect(root.locator('[data-metric]').first()).toContainText('n=0')
  })
}

test('ANL-6 what-if uses a named version and every live table stays live', async ({ page }) => {
  await setup(page)
  await page.goto(`${projectRoute}?${replayQuery}`)
  const pane = page.locator('[data-replay-pane]')
  await expect(pane.getByRole('button', { name: copy('run'), exact: true })).toBeEnabled()
  const request = page.waitForRequest((r) => r.method() === 'POST' && r.url().includes('/analysis/what-if'))
  await pane.getByRole('button', { name: copy('run'), exact: true }).press('Enter')
  const result = pane.locator('.analysis-replay-result')
  const body = (await request).postDataJSON()
  expect(() => registry.evaluateWhatIf.request.body.parse(body)).not.toThrow()
  expect(body).toMatchObject({
    sheet: { pack: 'sky', clauses: [] },
    range: { from: '2026-10-31T16:00:00.000Z', to: '2026-11-04T15:59:59.000Z', step: 'reading' }
  })
  // P2-11: the replay is marked with the Replay tag, never the dashed No call edge; the sheet is named, not its ID.
  const mark = pane.locator('.analysis-replay-result [data-replay-mark]')
  await expect(mark).toContainText(copy('sheetName').replace('{pack}', tabName('sky')))
  await expect(mark).not.toContainText(sheetId)
  await expect(mark).toContainText('3')
  await expect(result).toBeFocused()
  await expect(pane.locator('[data-replay-chart]')).toBeVisible()
  await expect(pane.locator('.recharts-line-curve')).toHaveAttribute('stroke-dasharray', '5 4')
  await expect(pane.locator('.recharts-dot').first()).toHaveAttribute('fill', 'var(--card)')
  for (const chart of await page.locator('[data-live-chart]').all()) {
    await chart.getByRole('button', { name: copy('table'), exact: true }).press('Enter')
    await expect(chart.locator('tbody tr')).toHaveCount(4)
    await expect(chart.locator('tbody tr:not([data-origin=live])')).toHaveCount(0)
    await expect(chart).not.toContainText('15:00')
  }
  await pane.getByRole('button', { name: copy('table'), exact: true }).press('Enter')
  await expect(pane.locator('tbody tr[data-origin=replay]')).toHaveCount(2)
  await expectZonedTimes(page)
  await pane.getByLabel(copy('from'), { exact: true }).fill('2026-10-01')
  await expect(pane.locator('[data-replay-chart]')).toHaveCount(0)
})

test('URL state restores tabs, period, pack and draft inputs with Back navigation', async ({ page }) => {
  await setup(page)
  await page.goto(`${projectRoute}?tab=agreement&period=7d&pack=sky&${replayQuery}`)
  await expect(page.getByRole('tab', { name: tabName('agreement'), exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const pane = page.locator('[data-replay-pane]')
  await pane.getByRole('combobox', { name: copy('subject'), exact: true }).selectOption('draft')
  await expect(pane.getByRole('combobox', { name: copy('draft'), exact: true })).toBeEnabled()
  await pane.getByRole('combobox', { name: copy('draft'), exact: true }).selectOption(draftId)
  await expect(pane.getByRole('button', { name: copy('run'), exact: true })).toBeEnabled()
  await pane.getByRole('button', { name: copy('run'), exact: true }).press('Enter')
  await expect(pane.locator('.analysis-replay-result [data-replay-mark]')).toContainText(
    copy('draftLabel').replace('{n}', '3')
  )
  await page.getByRole('tab', { name: tabName('delays'), exact: true }).press('Enter')
  await expect(page).toHaveURL(/tab=delays/)
  await page.goBack()
  await expect(page.getByRole('tab', { name: tabName('agreement'), exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.reload()
  await expect(pane.getByRole('combobox', { name: copy('draft'), exact: true })).toHaveValue(draftId)
})

test('replay enforces the API 90-day range and preserves an explicit URL step', async ({ page }) => {
  await setup(page)
  await page.goto(
    `${projectRoute}?${replayQuery.replace('from=2026-11-01', 'from=2024-01-01').replace('step=reading', 'step=PT15M')}`
  )
  const pane = page.locator('[data-replay-pane]')
  await expect(pane.getByRole('combobox', { name: copy('step'), exact: true })).toHaveValue('PT15M')
  await expect(pane.getByRole('button', { name: copy('run'), exact: true })).toBeDisabled()
  await expect(pane.getByRole('alert')).toHaveText(copy('invalidRange'))
  // The reason is tied to the fields and to Run, so a screen reader hears why Run waits.
  await expect(pane.getByLabel(copy('from'), { exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(pane.getByRole('button', { name: copy('run'), exact: true })).toHaveAccessibleDescription(
    copy('invalidRange')
  )
  await pane.getByLabel(copy('from'), { exact: true }).fill('2026-11-01')
  await expect(pane.getByRole('button', { name: copy('run'), exact: true })).toBeEnabled()
})

test('agreement kill line, delay columns and table views use a single scale', async ({ page }) => {
  await setup(page)
  await page.goto(`${projectRoute}?tab=agreement`)
  const agreement = page.locator('[data-live-chart=agreement]')
  await expect(agreement).toContainText(copy('killLine'))
  await expect(page.locator('.analysis-ranked')).toContainText('test-storm')
  await expect(agreement.locator('.recharts-reference-line-line')).toHaveAttribute('stroke-dasharray', '4 4')
  await expect(agreement.locator('.recharts-yAxis')).toHaveCount(1)
  expect(await agreement.locator('.recharts-yAxis .recharts-cartesian-axis-tick').count()).toBeGreaterThanOrEqual(3)
  expect(await agreement.locator('.recharts-yAxis .recharts-cartesian-axis-tick').count()).toBeLessThanOrEqual(5)
  await page.getByRole('tab', { name: tabName('delays'), exact: true }).press('Enter')
  await expect(page.locator('[data-live-chart] .recharts-bar-rectangle').first()).toBeVisible()
  await page
    .locator('[data-live-chart]')
    .getByRole('button', { name: copy('table'), exact: true })
    .press('Enter')
  await expect(page.locator('[data-live-chart] tbody')).toContainText('12')
})

test('ANL-2 Approvers explain no call windows, including those without a review item', async ({ page }) => {
  await setup(page)
  await stubApi(
    page,
    'listGrades',
    {
      data: [detailedGrade, { ...detailedGrade, id: 'grade-missing', window_id: 'window-missing' }],
      next_cursor: null
    },
    { registry }
  )
  await page.goto(`${projectRoute}?tab=review`)
  // Windows are named by their date, never their ID: the review item comes first, the one without an item last.
  await expect(page.locator('.analysis-review-list')).not.toContainText('window-no-call')
  const form = page.locator('.analysis-review-item').first()
  await expect(form).toContainText('shadow')
  await form.getByRole('textbox').fill('Explained by the approver')
  const request = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().endsWith('/review-items/review-one'))
  await form.getByRole('button', { name: copy('save'), exact: true }).press('Enter')
  expect((await request).postDataJSON()).toEqual({ explanation: 'Explained by the approver' })
  await expect(form.getByRole('status')).toHaveText(copy('saved'))
  const missing = page.locator('.analysis-review-item').last()
  await expect(missing.getByRole('textbox')).toHaveAttribute('readonly', '')
  await expect(missing).toContainText(copy('reviewMissing'))
})

test('Viewers read explanations and cannot edit or request drafts', async ({ page }) => {
  await setup(page, { role: 'viewer' })
  await page.goto(`${projectRoute}?tab=review&${replayQuery}&subject=draft`)
  await expect(page.locator('.analysis-review-item textarea')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: copy('save'), exact: true })).toHaveCount(0)
  await expect(page.locator('[data-replay-pane] option[value=draft]')).toHaveCount(0)
  // Run waits, and says what for: a viewer has no draft to replay.
  const run = page.locator('[data-replay-pane]').getByRole('button', { name: copy('run'), exact: true })
  await expect(run).toBeDisabled()
  await expect(run).toHaveAccessibleDescription(copy('chooseVersionFirst'))
})

test('pack_crowd off removes Crowd and explains a direct feature-off URL', async ({ page }) => {
  await setup(page, { crowd: false })
  await page.goto(`${projectRoute}?tab=crowd`)
  await expect(page.getByRole('tab', { name: tabName('crowd'), exact: true })).toHaveCount(0)
  await expect(page.locator('[data-analysis-page]').getByRole('alert')).toContainText(copy('featureOff'))
  await page.getByRole('tab', { name: tabName('sky'), exact: true }).press('Enter')
  await expect(page.locator('[data-metric=precision]').first()).toBeVisible()
})

test('Crowd Night lanes show arrival, hatched exit, forecast band and the D+1 actual tick', async ({ page }) => {
  await setup(page)
  const night = {
    id: 'night-one',
    project_id: projectId,
    date: '2026-11-04',
    state: 'graded',
    doors: '2026-11-04T10:00:00Z',
    show: '2026-11-04T12:00:00Z',
    arrival_start: '2026-11-04T10:00:00Z',
    arrival_end: '2026-11-04T12:00:00Z',
    exit_start: '2026-11-04T14:00:00Z',
    exit_end: '2026-11-04T15:30:00Z',
    forecast: {
      id: 'forecast-one',
      night_id: 'night-one',
      baseline: 100,
      uplift: 100,
      forecast: 200,
      band_low: 150,
      band_high: 250,
      created_at: at,
      method: 'test-recorded-method',
      reading_ids: ['reading-test']
    }
  }
  await stubApi(page, 'listNights', { data: [night], next_cursor: null }, { registry })
  await stubApi(
    page,
    'listProjectListings',
    {
      data: [
        {
          id: 'listing-one',
          project_id: projectId,
          listing_key: 'Test show',
          source_url: 'https://example.test/capture',
          source_revision: 'test-revision',
          state: 'listed',
          class: 'concert',
          class_hint: null,
          single_source: true,
          historical: false,
          night_id: night.id,
          pending_change: null
        }
      ],
      next_cursor: null
    },
    { registry }
  )
  await stubApi(
    page,
    'listGrades',
    {
      data: [
        {
          ...detailedGrade,
          pack: 'crowd',
          outcome: 'in_band',
          no_call: false,
          night_id: night.id,
          window_id: null,
          actual: 220,
          forecast: night.forecast
        }
      ],
      next_cursor: null
    },
    { registry }
  )
  await page.goto(`${projectRoute}?tab=crowd`)
  const lane = page.locator('[data-night-lane]')
  await expect(lane).toContainText('Test show')
  await expect(lane.locator('pattern path')).toHaveAttribute('stroke-width', '1')
  await expect(lane.locator('[data-actual-tick]')).toHaveCount(1)
  await expect(lane).toContainText('220')
  await lane.getByRole('button', { name: copy('table'), exact: true }).press('Enter')
  await expect(lane.locator('[data-night-table]')).toBeVisible()
  await expectZonedTimes(page)
})

test('Crowd nights still draw when listings are not available yet, and a real listings failure offers Retry', async ({
  page
}) => {
  await setup(page)
  const night = {
    id: 'night-two',
    project_id: projectId,
    date: '2026-11-04',
    state: 'graded' as const,
    doors: '2026-11-04T10:00:00Z',
    show: '2026-11-04T12:00:00Z',
    arrival_start: '2026-11-04T10:00:00Z',
    arrival_end: '2026-11-04T12:00:00Z',
    exit_start: null,
    exit_end: null,
    forecast: null
  }
  await stubApi(page, 'listNights', { data: [night], next_cursor: null }, { registry })
  await stubApi(
    page,
    'listProjectListings',
    { type: 'https://skyclause.test/problems/not-built', title: 'Not built', status: 501 },
    { registry, status: 501 }
  )
  await page.goto(`${projectRoute}?tab=crowd`)
  await expect(page.locator('[data-night-lane]')).toHaveCount(1)
  await expect(page.locator('.analysis-nights [data-source-error]')).toHaveCount(0)
  await expect(page.locator('.analysis-nights').getByRole('button', { name: copy('retry'), exact: true })).toHaveCount(
    0
  )

  await stubApi(page, 'listProjectListings', { title: 'Unavailable', status: 503 }, { registry, status: 503 })
  await page.reload()
  await expect(page.locator('[data-night-lane]')).toHaveCount(1)
  await expect(page.locator('.analysis-nights [data-source-error="503"]')).toBeVisible()
  await expect(page.locator('.analysis-nights').getByRole('button', { name: copy('retry'), exact: true })).toBeVisible()
})

test('operation failures render errors instead of inventing zero counts', async ({ page }) => {
  await setup(page)
  await page.route(`**/v1/projects/${projectId}/analysis?**`, (route) =>
    route.fulfill({ status: 503, json: { title: 'Unavailable' } })
  )
  await page.goto(projectRoute)
  await expect(page.locator('[data-analysis-page] [data-source-error="503"]')).toBeVisible()
  await expect(page.locator('[data-live-chart], [data-metric]')).toHaveCount(0)
  await expect(page.locator('[data-analysis-page]')).not.toContainText(copy('emptyFinding'))
})

test('a Crowd availability failure is reported while live Sky figures remain available', async ({ page }) => {
  await setup(page)
  await page.route(`**/v1/projects/${projectId}/analysis?**`, (route) =>
    new URL(route.request().url()).searchParams.get('pack') === 'crowd'
      ? route.fulfill({ status: 503, json: { title: 'Unavailable' } })
      : route.fallback()
  )
  await page.goto(projectRoute)
  await expect(page.locator('[data-analysis-page] [data-source-error="503"]')).toContainText('Crowd')
  await expect(page.locator('[data-metric=precision]').first()).toBeVisible()
})

// Recharts 3 draws an axis label as `.recharts-cartesian-axis-tick-value` with its own grey fill (#666, 2.51:1 on
// Dusk); the kit's chart container inks every chart's labels with --chart-ink instead, in each theme.
for (const appearance of [
  { theme: 'dark', contrast: 'standard' },
  { theme: 'light', contrast: 'standard' },
  { theme: 'dark', contrast: 'more' },
  { theme: 'light', contrast: 'more' }
] as const) {
  test(`axis labels take the chart ink in ${appearance.theme}, ${appearance.contrast} contrast`, async ({
    page,
    baseURL
  }) => {
    await setup(page)
    await page
      .context()
      .addCookies([{ name: 'skyclause-test-appearance', value: JSON.stringify(appearance), url: baseURL! }])
    await page.goto(`${projectRoute}?tab=agreement`)
    const labels = page.locator('[data-live-chart=agreement] .recharts-cartesian-axis-tick-value')
    await expect(labels.first()).toBeVisible()
    const fills = await labels.evaluateAll((texts) => {
      const probe = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      probe.style.fill = 'var(--chart-ink)'
      texts[0]!.parentNode!.appendChild(probe)
      const ink = getComputedStyle(probe).fill
      probe.remove()
      return { ink, labels: [...new Set(texts.map((text) => getComputedStyle(text).fill))] }
    })
    expect(fills.ink).toMatch(/^rgb/)
    expect(fills.labels).toEqual([fills.ink])
  })
}

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`analysis is keyboard usable, axe-clean and unclipped in ${theme}`, async ({
    page,
    baseURL,
    expectAxeClean
  }, info) => {
    await setup(page)
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: baseURL!
      }
    ])
    await page.goto(`${projectRoute}?tab=agreement&${replayQuery}`)
    const active = page.getByRole('tab', { name: tabName('agreement'), exact: true })
    await expect(active).toHaveAttribute('aria-selected', 'true')
    await active.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: tabName('delays'), exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/tab=delays/)
    // The selected tab and period are inverted capsules, not a colour alone.
    await expect(page.getByRole('tab', { name: tabName('delays'), exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(page.getByRole('tab', { name: tabName('delays'), exact: true })).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)'
    )
    const selectedRange = page.locator('.analysis-period [data-slot=toggle-group-item][aria-pressed=true]')
    await expect(selectedRange).toHaveCount(1)
    await expect(selectedRange).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    for (const width of [1280, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await expectUnclippedText(page)
      // Recharts re-measures after a resize, so poll until the layout settles.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await expectAxeClean(page)
    await page.screenshot({ path: info.outputPath(`${theme}.png`), fullPage: true })
  })
}

test.describe('Malay browser', () => {
  test.use({ locale: 'ms-MY' })
  test('Malay copy and all five tabs fit with 30 percent pseudo expansion', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    for (const tab of ['sky', 'crowd', 'agreement', 'delays', 'review'] as const) {
      await page.goto(`${projectRoute}?tab=${tab}&${replayQuery}`)
      await expect(page.getByRole('tab', { name: tabName(tab, 'ms'), exact: true })).toHaveAttribute(
        'aria-selected',
        'true'
      )
      for (const width of [1280, 375, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await expectUnclippedText(page)
        await expectZonedTimes(page)
        // Recharts re-measures after a resize, so poll until the layout settles.
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
  })
})
