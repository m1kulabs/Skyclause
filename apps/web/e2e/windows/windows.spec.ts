import { test, expect } from '../fixtures'
import { stubApi, expectZonedTimes } from '../harness'
import { expectUnclippedText } from '../harness/expect-unclipped-text'
import { windowsOperations } from '../../features/windows/operations'
import { onboardingOperations } from '../../features/onboarding/operations'
import { onboarding, prepareWindows, replayWindow, route, skyBundle, crowdBundle, projectId } from './replay'
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
  await expect(page.locator('[data-window-row]').filter({ hasText: w('commute_wave') })).toBeVisible()
  await expectZonedTimes(page)
})

test('the month view and from survive reload, and the old calendar address opens the month', async ({ page }) => {
  await prepareWindows(page)
  await page.goto('/replay/bukit-jalil/windows?view=month&from=2026-11-01')
  await page.reload()
  await expect(page.getByRole('button', { name: w('view_month'), exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel(w('from'), { exact: true })).toHaveValue('2026-11-01')
  await page.goto('/replay/bukit-jalil/windows?view=calendar&from=2026-11-01')
  await expect(page.getByRole('button', { name: w('view_month'), exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('a successful read with no windows is the empty day with Declare a window as its one action', async ({ page }) => {
  await prepareWindows(page, [])
  await page.goto(route)
  const empty = page.locator('[data-empty-day]')
  await expect(empty).toBeVisible()
  await expect(empty.getByRole('button', { name: w('declare'), exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: w('declare'), exact: true })).toHaveCount(1)
  await expect(page.locator('[data-source-error]')).toHaveCount(0)
})

test('loading is skeleton capsules on the day strip, not text', async ({ page }) => {
  await prepareWindows(page)
  let release: (() => void) | undefined
  await page.route('**/v1/projects/*/windows*', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fallback()
  })
  await page.goto(route)
  await expect(page.locator('[data-timeline-skeleton]')).toBeVisible()
  // The status is for a screen reader only: nothing reads "Loading windows…" on the screen.
  await expect(page.getByText(w('loading'), { exact: true })).toHaveClass(/sr-only/)
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(page.locator('[data-timeline-skeleton]')).toHaveCount(0)
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
  const scroller = page.getByRole('region', { name: w('list_label', { date: 'Mon, 2 Nov' }), exact: true })
  await expect(page.locator('[data-window-row]').first()).toBeVisible()
  expect(await page.locator('[data-window-row]').count()).toBeLessThan(50)
  await scroller.focus()
  await page.keyboard.press('Control+End')
  await expect(page.getByRole('button', { name: /release wave 99$/ })).toBeAttached()
})

test('a 501 read is a named source error with no Try again, and never the empty day', async ({ page }) => {
  await prepareWindows(page)
  await page.route('**/v1/projects/*/windows*', (route) => route.fulfill({ status: 501, json: { title: 'Not built' } }))
  await page.goto(route)
  await expect(page.locator('[data-source-error="501"]')).toContainText(w('source_load'))
  await expect(page.locator('[data-empty-day]')).toHaveCount(0)
  // Reading again cannot change a "not built" answer.
  await expect(page.getByRole('button', { name: w('retry'), exact: true })).toHaveCount(0)
})

test('a failed read names its error and retry reads again', async ({ page }) => {
  await prepareWindows(page)
  await page.route('**/v1/projects/*/windows*', (route) =>
    route.fulfill({ status: 503, json: { title: 'Unavailable' } })
  )
  await page.goto(route)
  await expect(page.locator('[data-source-error="503"]')).toContainText(w('source_load'))
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
      await page.getByRole('button', { name: w('view_month'), exact: true }).click()
      await expect(page.locator('[data-calendar], [data-timeline]')).toBeVisible()
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

test('listed show periods sit on their day, MET wording heads it, and only the calls that exist are drawn', async ({
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
  await expect(page.getByText(/2 November replay · listed show/)).toBeVisible()
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
  await expect(page.locator('[data-window-row]').getByText(w('guest'), { exact: true })).toBeVisible()
  // A series is named by its first window's title, never by its id (here the title is the window's own).
  await expect(page.getByText(w('repeats'), { exact: true })).toBeVisible()
  await expect(page.getByText('2-November-replay-series')).toHaveCount(0)
  await expect(
    page.getByText(`${w('feed')} https://calendar.example.org/2-november-replay.ics`, { exact: true })
  ).toBeVisible()
  await expect(page.getByText('2-November-replay-feed')).toHaveCount(0)
})

test('a window of a series whose first occurrence has another title names that series, not its id', async ({
  page
}) => {
  const first = { ...replayWindow, id: 'series-first', title: 'Morning lecture', series_id: 'series-7' }
  const later = {
    ...replayWindow,
    id: 'series-later',
    title: 'Morning lecture (room moved)',
    series_id: 'series-7',
    starts_at: '2026-11-02T08:30:00Z',
    ends_at: '2026-11-02T09:00:00Z',
    latest_calls: { sky: null, crowd: null }
  }
  await prepareWindows(page, [first, later])
  await page.goto(route)
  const row = page.locator('[data-window-row]').filter({ hasText: 'room moved' })
  await expect(row.getByText(w('series'))).toBeVisible()
  await expect(row.getByText('Morning lecture', { exact: true })).toBeVisible()
  await expect(page.getByText('series-7')).toHaveCount(0)
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
  await expect(page.locator('a[data-call-mark="needs_review"]')).toHaveAttribute(
    'href',
    `/replay/bukit-jalil/bundles/${crowdBundle}`
  )
  await expect(page.locator('a[data-call-mark="sent"]')).toHaveAttribute(
    'href',
    `/replay/bukit-jalil/bundles/${skyBundle}`
  )
  await expect(page.locator('span[data-mark="needs_review"]')).toBeVisible()
  // #171 owns the glyphs. Until it merges, the mode word remains visible beside its typed placeholder.
  await expect(page.locator('a[data-call-mark="needs_review"]')).toContainText(w('normal'))
})

test('a month cell keeps each mode on one line: glyph and a short word, the full name in its title', async ({
  page
}) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await prepareWindows(page)
  await page.goto(`${route}&view=month`)
  const sky = page.locator('[data-calendar-window] a[data-call-mark]').filter({ hasText: w('sent') })
  const badge = sky.locator('.mode-badge')
  await expect(badge).toHaveAttribute('title', /Sky.*Commute disruption/)
  await expect(badge).toContainText(w('short_commute_disruption'))
  // One line: the capsule is no taller than a line of text with its padding.
  expect((await badge.boundingBox())!.height).toBeLessThan(32)
  // The accessible name is still the full one.
  await expect(sky).toHaveAccessibleName(/Sky.*Commute disruption.*Sent/)
})

test('the timeline labels its now mark and the arrival and exit bars in words, and keeps the hour axis in view', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-11-02T06:30:00Z') })
  await page.setViewportSize({ width: 390, height: 800 })
  await prepareWindows(page)
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
  const today = page.locator('[data-day="2026-11-02"]')
  await expect(today.locator('[data-now-label]')).toHaveText(w('now'))
  // The list row names each bar, with a swatch that looks like it.
  await expect(today.locator('[data-night-row]')).toContainText(w('arrival'))
  await expect(today.locator('[data-night-row]')).toContainText(w('exit'))
  // The hour axis stays under the bar while the days scroll.
  const axis = page.locator('[data-timeline] > div').first()
  await page.evaluate(() => window.scrollTo(0, 900))
  const bar = await page.locator('.shell-bar').boundingBox()
  const axisBox = await axis.boundingBox()
  expect(Math.abs(axisBox!.y - (bar!.y + bar!.height))).toBeLessThan(2)
})

test('a link with ?window= opens the period holding that window and marks it', async ({ page }) => {
  const far = {
    ...replayWindow,
    id: 'window-far',
    title: 'Far window',
    starts_at: '2026-12-20T07:30:00Z',
    ends_at: '2026-12-20T08:00:00Z',
    latest_calls: { sky: null, crowd: null }
  }
  await prepareWindows(page, [replayWindow, far])
  await page.goto(`${route}&window=window-far`)
  const row = page.locator('[data-window-id="window-far"]')
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('data-added', 'true')
  await expect(page.getByLabel(w('from'), { exact: true })).toHaveValue('2026-12-20')
})

test('an Owner at the window step of the first run sees the steps here, and declaring moves them on to the rota', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-11-02T01:00:00Z') })
  await prepareWindows(page, [], onboarding('window'))
  await page.goto(route)
  const progress = page.locator('[data-first-run-progress]')
  const current = progress.locator('li[data-state="current"]')
  await expect(current).toContainText('Declare the first window')
  await expect(current.getByRole('link', { name: 'Continue' })).toHaveAttribute(
    'href',
    '/replay/bukit-jalil/windows?declare=window'
  )
  // Steps are read again once the window is saved: the rota step is the next one.
  await stubApi(page, 'getOnboarding', onboarding('rota'), { registry: onboardingOperations })
  await stubApi(page, 'createWindow', replayWindow, { registry: windowsOperations })
  await current.getByRole('link', { name: 'Continue' }).click()
  const dialog = page.getByRole('dialog', { name: w('declare') })
  await dialog.locator('[name="title"]').fill(replayWindow.title)
  await dialog.locator('[name="date"]').fill('2026-11-02')
  await dialog.locator('[name="start"]').fill('15:30')
  await dialog.locator('[name="end"]').fill('16:00')
  await dialog.getByRole('button', { name: w('save'), exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(current).toContainText('Set the approver rota')
})

test('the first-run steps stay off the windows page once every step is done', async ({ page }) => {
  await prepareWindows(page)
  await page.goto(route)
  await expect(page.locator('[data-window-row]')).toBeVisible()
  await expect(page.locator('[data-first-run-progress]')).toHaveCount(0)
})
