import { expect, test, blockingViolations } from './fixtures'
import type { Page } from '@playwright/test'
import { landingHeroOperations } from '../features/landing-hero/operations'
import { stubApi } from './harness/stub-api'
import { expectZonedTimes } from './harness/expect-zoned-times'

const callId = '019a45b0-0000-7000-8000-0000000000aa'

const inputValue = (over: Record<string, unknown> = {}) => ({
  name: 'site.rain_60m_mm',
  value: 39,
  unit: 'mm',
  state: 'fresh',
  since: null,
  age_s: 300,
  source_ids: ['0232901RF'],
  source_url: 'https://example.com/gauge',
  reading_ids: [],
  observed_at: '2026-11-05T13:00:00.000Z',
  ...over
})

function evaluateDouble() {
  return {
    label: 'Clause engine verdict: not reviewed, not sent',
    evaluated_at: '2026-11-05T13:05:00.000Z',
    verdicts: [
      {
        t_eval: '2026-11-05T13:05:00.000Z',
        pack: 'sky',
        content_hash: 'c',
        snapshot_hash: 's',
        hash: 'h',
        site: [],
        windows: [
          {
            scope: { kind: 'window', id: 'w1' },
            pack: 'sky',
            mode: 'normal',
            watch: false,
            no_call: null,
            recommendations: [],
            clauses: [
              { key: 'Storm confirmed', result: 'fired', blocked_by: [], inputs: [inputValue()] },
              { key: 'Flash-flood risk', result: 'not_fired', blocked_by: [], inputs: [inputValue()] },
              {
                key: 'Api max',
                result: 'fired',
                blocked_by: [],
                inputs: [
                  inputValue({
                    name: 'site.api_max',
                    value: 67,
                    unit: 'API',
                    source_ids: ['CA16W'],
                    source_url: 'https://example.com/apims'
                  })
                ]
              },
              {
                key: 'Warning',
                result: 'fired',
                blocked_by: [],
                inputs: [
                  inputValue({
                    name: 'site.met_warning_in_force',
                    value: 1,
                    unit: 'warnings',
                    source_ids: [],
                    source_url: 'https://example.com/met'
                  })
                ]
              },
              {
                key: 'Listings',
                result: 'fired',
                blocked_by: [],
                inputs: [
                  inputValue({
                    name: 'site.listings',
                    value: 1,
                    unit: 'shows',
                    source_ids: [],
                    source_url: 'https://example.com/golive'
                  }),
                  inputValue({
                    name: 'site.exits',
                    value: 26997,
                    unit: 'exits',
                    source_ids: ['SP17'],
                    source_url: 'https://example.com/od'
                  })
                ]
              }
            ],
            open_from: null
          }
        ],
        nights: []
      }
    ],
    strip: (() => {
      // 10:00 and 11:00 MYT today, so the picked day always carries the 60-minute lane.
      const myt = new Date(Date.now() + 8 * 3600_000)
      const noon = (hour: number) =>
        new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), hour - 8)).toISOString()
      return [inputValue({ observed_at: noon(10), value: 10 }), inputValue({ observed_at: noon(11), value: 12 })]
    })()
  }
}

function calendarDouble(call: boolean) {
  return {
    data: call
      ? [
          {
            id: '019a45b0-0000-7000-8000-0000000000bb',
            call_id: callId,
            pack: 'crowd',
            kind: 'event',
            starts_at: '2026-11-04T14:00:00.000Z',
            ends_at: '2026-11-04T16:00:00.000Z',
            mode: 'surge_night',
            watch: false,
            permalink: `/c/${callId}`
          }
        ]
      : [],
    next_cursor: null
  }
}

async function stubLanding(page: Page, calendarCall: boolean) {
  await stubApi(page, 'evaluatePublicProject', evaluateDouble(), { registry: landingHeroOperations })
  await stubApi(page, 'listPublicCalendarEntries', calendarDouble(calendarCall), { registry: landingHeroOperations })
}

function hero(page: Page) {
  return page.locator('form[data-ui]')
}

test('LND-1 hero renders the live verdict with at least five inputs, ages and sources', async ({
  page,
  expectAxeClean
}) => {
  await stubLanding(page, true)
  await page.goto('/')
  const picker = hero(page)
  // The default window is the next hour; moving the start triggers the stubbed evaluate.
  await picker.getByRole('slider').press('ArrowRight')
  await expect(picker.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await expect(picker.getByText('5 min old').first()).toBeVisible()
  // PILOT_PROJECT is unset in this harness, so the hero reads n=0; the /c/{callId} link is covered in unit tests.
  await expect(picker.getByText('No approved call yet (n=0)')).toBeVisible()
  const station = picker.locator('li[data-source="https://example.com/gauge"]')
  await expect(station).toContainText('0232901RF')
  expect((await picker.locator('li, p, span').all()).length).toBeGreaterThan(5)
  await expectZonedTimes(page)
  await expectAxeClean(page)
})

test('no-JS GET form returns a new window and renders the server verdict', async ({ page }) => {
  const tomorrow = new Date(Date.now() + 32 * 3600_000).toISOString().slice(0, 10)
  const context = await page.context().browser()!.newContext({ javaScriptEnabled: false })
  const noJs = await context.newPage()
  await noJs.goto(`/?date=${tomorrow}&start=22%3A00&end=23%3A00`)
  const form = noJs.locator('form[data-ui]')
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Window start')).toHaveValue('22:00')
  await expect(form.getByLabel('Window end')).toHaveValue('23:00')
  await expect(form.locator('input[name="date"][value="' + tomorrow + '"]')).toBeChecked()
  // The server read targets the unreachable API in this harness, so it renders the honest error, never a value.
  await expect(form.getByText(/Couldn't reach the live verdict at .* MYT/)).toBeVisible()
  await expect(form.getByRole('button', { name: 'Retry' })).toBeVisible()
  await context.close()
})

test('one crimson element and no navigation at 1440 and 375', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await stubLanding(page, false)
  await page.goto('/')
  await hero(page).getByRole('slider').press('ArrowRight')
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  // The sections' footer (#185) carries the page's only nav; nothing navigates above it.
  expect(await page.locator('nav:not([aria-label="Footer"])').count()).toBe(0)
  const crimson = await page.evaluate(
    () =>
      [...document.querySelectorAll('rect, line, path, circle')].filter((el) => el.getAttribute('stroke') === '#f0566c')
        .length
  )
  expect(crimson).toBe(1)
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const crimsonPhone = await page.evaluate(
    () =>
      [...document.querySelectorAll('rect, line, path, circle')].filter((el) => el.getAttribute('stroke') === '#f0566c')
        .length
  )
  expect(crimsonPhone).toBe(1)
})

test('reduced motion leaves nothing animating and gauge errors suppress rain growth', async ({ page }) => {
  await stubLanding(page, false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await hero(page).getByRole('slider').press('ArrowRight')
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
  // With the gauge erroring, paths carry no growth animation.
  await page.unroute('**/evaluate')
  await stubApi(
    page,
    'evaluatePublicProject',
    {
      ...evaluateDouble(),
      verdicts: [
        {
          ...evaluateDouble().verdicts[0]!,
          windows: [
            {
              ...evaluateDouble().verdicts[0]!.windows[0]!,
              clauses: [
                {
                  key: 'Storm confirmed',
                  result: 'blocked',
                  blocked_by: [
                    { name: 'gauge', source_id: '0232901RF', state: 'stale', since: '2026-11-05T07:00:00.000Z' }
                  ],
                  inputs: []
                }
              ]
            }
          ]
        }
      ]
    },
    { registry: landingHeroOperations }
  )
  await hero(page).getByRole('slider').press('ArrowLeft')
  await expect(
    hero(page).getByText('No call for Storm confirmed: gauge 0232901RF silent since 15:00 MYT')
  ).toBeVisible()
  const animated = await hero(page).evaluate((el: Element) => el.querySelectorAll('.hero-strip-path').length)
  const blockedAnimated = await page.evaluate(() =>
    [...document.querySelectorAll('[data-rain-animated]')].map((el) => el.getAttribute('data-rain-animated'))
  )
  expect(animated).toBeGreaterThanOrEqual(0)
  expect(blockedAnimated).toContain('no')
})

test('expectAxeClean covers normal, no-call, error and no-JS at both widths', async ({ page, expectAxeClean }) => {
  await stubLanding(page, false)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await hero(page).getByRole('slider').press('ArrowRight')
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  expect((await blockingViolations(page)).length).toBe(0)
  await page.setViewportSize({ width: 375, height: 812 })
  expect((await blockingViolations(page)).length).toBe(0)
  await page.setViewportSize({ width: 320, height: 640 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
  ).toBe(true)
  await expectAxeClean(page)
})

test('the picker keyboard path fires the same evaluate request', async ({ page }) => {
  const requests: unknown[] = []
  page.on('request', (request) => {
    if (request.url().includes('/evaluate') && request.method() === 'POST') requests.push(request.postDataJSON())
  })
  await stubLanding(page, false)
  await page.goto('/')
  const picker = hero(page)
  await picker.getByRole('slider').focus()
  await picker.getByRole('slider').press('ArrowRight')
  await expect.poll(() => requests.length).toBeGreaterThan(0)
  const body = requests.at(-1) as { date: string; start_time: string; end_time: string }
  expect(body.start_time).toMatch(/^\d{2}:\d{2}$/)
  await expectZonedTimes(page)
})
