import { test, expect } from '../fixtures'
import { stubApi, expectZonedTimes } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { windowsOperations } from '../../features/windows/operations'
import { prepareWindows, replayWindow, route, skyBundle, crowdBundle, projectId } from './replay'
import { w } from './messages'

test('WIN-2 replay calls from different runs link to their own bundles', async ({ page }) => {
  await prepareWindows(page)
  await page.goto(route)
  await expect(page.locator('a[data-call-mark]').filter({ hasText: /Sky.*Commute disruption.*Sent/ })).toHaveAttribute(
    'href',
    `/replay/bukit-jalil/bundles/${skyBundle}`
  )
  await expect(page.locator('a[data-call-mark]').filter({ hasText: /Crowd.*Normal.*Drafted/ })).toHaveAttribute(
    'href',
    `/replay/bukit-jalil/bundles/${crowdBundle}`
  )
  await expect(page.getByRole('heading', { name: w('commute_wave'), exact: true })).toBeVisible()
  await expectZonedTimes(page)
})

test('calendar view and from survive reload; DESIGN empty state is exact', async ({ page }) => {
  await prepareWindows(page, [])
  await page.goto('/replay/bukit-jalil/windows?view=calendar&from=2026-11-01')
  await page.reload()
  await expect(page.getByRole('button', { name: w('calendar'), exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(w('from'), { exact: true })).toHaveValue('2026-11-01')
  await expect(page.getByText(w('empty'), { exact: true })).toBeVisible()
})

test('calendar shows three windows then opens the rest of the day', async ({ page }) => {
  const windows = Array.from({ length: 5 }, (_, index) => ({
    ...replayWindow,
    id: `replay-window-${index}`,
    title: `${replayWindow.title} ${index}`
  }))
  await prepareWindows(page, windows)
  await page.goto(`${route}&view=calendar`)
  await expect(page.locator('[data-calendar-window]')).toHaveCount(3)
  await page.locator('[data-calendar-more]').click()
  await expect(page.locator('[data-window-row]')).toHaveCount(5)
})

test('over 50 rows virtualise and the last window is reachable by keyboard scrolling', async ({ page }) => {
  const windows = Array.from({ length: 200 }, (_, index) => ({
    ...replayWindow,
    id: `replay-window-${index}`,
    title: `${replayWindow.title} ${index}`,
    latest_calls: { sky: null, crowd: null }
  }))
  await prepareWindows(page, windows)
  await page.goto(route)
  const scroller = page.getByRole('region', { name: w('timeline'), exact: true })
  await expect(page.locator('[data-window-row]').first()).toBeVisible()
  expect(await page.locator('[data-window-row]').count()).toBeLessThan(50)
  await scroller.focus()
  await page.keyboard.press('Control+End')
  await expect(page.getByRole('button', { name: /release wave 199,/ })).toBeAttached()
})

test('operation failures show errors with retry and never the empty state', async ({ page }) => {
  await prepareWindows(page)
  await page.route('**/v1/projects/*/windows*', (route) => route.fulfill({ status: 501, json: { title: 'Not built' } }))
  await page.goto(route)
  await expect(page.getByRole('alert').filter({ hasText: w('load_error') })).toBeVisible()
  await expect(page.getByText(w('empty'), { exact: true })).toHaveCount(0)
  await stubApi(page, 'listWindows', { data: [replayWindow], next_cursor: null }, { registry: windowsOperations })
  await page
    .getByRole('button', { name: w('retry'), exact: true })
    .first()
    .click()
  await expect(page.locator('a[data-call-mark]').filter({ hasText: /Sky.*Commute disruption/ })).toBeVisible()
})

for (const theme of ['dark', 'light', 'high-contrast'] as const) {
  test(`windows and form are axe-clean and reflow at 320px in ${theme}`, async ({ page, expectAxeClean }, testInfo) => {
    await page.context().addCookies([
      {
        name: 'skyclause-test-appearance',
        value: JSON.stringify({
          theme: theme === 'light' ? 'light' : 'dark',
          contrast: theme === 'high-contrast' ? 'more' : 'standard'
        }),
        url: process.env.E2E_BASE_URL ?? 'http://localhost:3100'
      }
    ])
    await prepareWindows(page, [
      {
        ...replayWindow,
        title:
          '2 November replay · Persatuan Kebajikan dan Pendidikan Komuniti Wilayah Persekutuan Kuala Lumpur dan Selangor'
      }
    ])
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      await expect(page.locator('[data-window-row]')).toBeVisible()
      await expectAxeClean(page)
      await expectUnclippedText(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`windows-${theme}-${width}.png`), fullPage: true })
      await page.getByRole('button', { name: w('calendar'), exact: true }).click()
      await expect(page.getByRole('region', { name: w('calendar'), exact: true })).toBeVisible()
      await expectAxeClean(page)
      await expectUnclippedText(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: w('timeline'), exact: true }).click()
      await expect(page.locator('[data-window-row]')).toBeVisible()
      await page.getByRole('button', { name: w('declare'), exact: true }).press('Enter')
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true
      )
      await expectAxeClean(page)
      await expectUnclippedText(page)
      await page.screenshot({ path: testInfo.outputPath(`window-form-${theme}-${width}.png`), fullPage: true })
    }
  })
}

test('listed show periods cross rows, MET wording heads its day, and the legend lists only visible marks', async ({
  page
}) => {
  await prepareWindows(page)
  await stubApi(
    page,
    'listProjectDays',
    {
      data: [
        {
          date: '2026-11-02',
          reading_count: 1,
          error_count: 0,
          window_count: 1,
          storm_afternoon: { wording: 'Ribut petir (2 November replay)', source_url: 'https://www.met.gov.my/' }
        }
      ],
      next_cursor: null
    },
    { registry: windowsOperations }
  )
  await stubApi(
    page,
    'listNights',
    {
      data: [
        {
          id: '2-november-replay-night',
          project_id: projectId,
          date: '2026-11-02',
          state: 'upcoming',
          doors: '2026-11-02T08:00:00Z',
          show: '2026-11-02T09:00:00Z',
          arrival_start: '2026-11-02T07:00:00Z',
          arrival_end: '2026-11-02T08:00:00Z',
          exit_start: '2026-11-02T10:00:00Z',
          exit_end: '2026-11-02T11:00:00Z',
          forecast: null,
          show_name: '2 November replay · listed show'
        }
      ],
      next_cursor: null
    },
    { registry: windowsOperations }
  )
  await page.goto(route)
  await expect(page.getByRole('link', { name: /Ribut petir/ })).toHaveAttribute('lang', 'ms')
  await expect(page.getByRole('link', { name: /2 November replay · listed show/ })).toBeVisible()
  await expect(page.locator('[data-period="arrival"]')).toHaveCount(1)
  await expect(page.locator('[data-period="exit"]')).toHaveCount(1)
  await expect(page.locator('[data-mark="sent"]').first()).toBeVisible()
  await expect(page.locator('[data-mark="expired"]')).toHaveCount(0)
})

test('imported occurrences show their series and original feed and guest windows are labelled', async ({ page }) => {
  await prepareWindows(page, [
    {
      ...replayWindow,
      guest: true,
      series_id: '2-November-replay-series',
      ics_feed_id: '2-November-replay-feed',
      via: 'ics'
    }
  ])
  await stubApi(
    page,
    'listIcsFeeds',
    {
      data: [
        {
          id: '2-November-replay-feed',
          project_id: projectId,
          url: 'https://calendar.example.org/2-november-replay.ics'
        }
      ],
      next_cursor: null
    },
    { registry: windowsOperations }
  )
  await page.goto(route)
  await expect(page.getByRole('heading', { name: w('guest_window'), exact: true })).toBeVisible()
  await expect(page.getByText(w('series', { id: '2-November-replay-series' }), { exact: true })).toBeVisible()
  await expect(
    page.getByText(w('feed', { url: 'https://calendar.example.org/2-november-replay.ics' }), { exact: true })
  ).toBeVisible()
})

test('needs-review and sent marks use bundle state and the typed ModeBadge seam', async ({ page }) => {
  await prepareWindows(page)
  await stubApi(
    page,
    'listProjectBundles',
    {
      data: [
        {
          id: crowdBundle,
          project_id: projectId,
          run_id: '2-november-replay-crowd-run',
          pack: 'crowd',
          state: 'needs_review',
          superseded_by: null,
          review_hash: '2-november-replay',
          sla_due_at: '2026-11-02T08:00:00Z',
          needs_review_at: '2026-11-02T07:00:00Z',
          approved_by: null,
          escalation_level: 0,
          draft_only: false,
          calls: [],
          trigger: 'window',
          triggered_at: '2026-11-02T07:00:00Z',
          sheet_version_id: '2-november-replay-sheet',
          alerts: []
        }
      ],
      next_cursor: null
    },
    { registry: windowsOperations }
  )
  await page.goto(route)
  await expect(page.locator('a[data-call-mark="needs_review"]')).toContainText(w('needs_review'))
  await expect(page.locator('a[data-mark="needs_review"]')).toHaveAttribute(
    'href',
    `/replay/bukit-jalil/bundles/${crowdBundle}`
  )
  await expect(page.locator('a[data-mark="sent"]')).toHaveAttribute('href', `/replay/bukit-jalil/bundles/${skyBundle}`)
  // #171 owns the glyphs. Until it merges, the mode word remains visible beside its typed placeholder.
  await expect(page.locator('a[data-call-mark="needs_review"]')).toContainText(w('normal'))
})
