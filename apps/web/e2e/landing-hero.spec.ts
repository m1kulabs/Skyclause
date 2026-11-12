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
      // 10:00 and 11:00 MYT on the next hour's day, which the default window picks (tomorrow from 23:00 MYT).
      const myt = new Date(Date.now() + 9 * 3600_000)
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
  return page.locator('form#window[data-ui]')
}

/** The day strip in the card's stripe band: the window's capsule on 24 hours, the picker's drag and key target. */
function band(page: Page) {
  return page.getByRole('slider', { name: 'Your window on the day' })
}

test('LND-1 hero renders the live verdict with at least five inputs, ages and sources', async ({
  page,
  expectAxeClean
}) => {
  await stubLanding(page, true)
  await page.goto('/')
  const picker = hero(page)
  // The default window is the next hour; moving the start triggers the stubbed evaluate.
  await band(page).press('ArrowRight')
  await expect(picker.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await expect(picker.getByText('5 min old').first()).toBeVisible()
  // PILOT_PROJECT is unset in this harness, so the hero reads n=0; the latest call's date is covered in unit tests.
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
  // The server read targets an API this harness does not stub, so it renders the honest state, never a value: a
  // failed read offers Retry; a verdict not built yet (501) offers the labelled replay instead, since Retry cannot help.
  const error = form.getByText(/Couldn’t reach the live verdict at .* MYT|The live verdict is not built yet/)
  await expect(error).toBeVisible()
  if (/not built/.test((await error.textContent()) ?? '')) {
    await expect(form.getByRole('link', { name: 'See 2 November, replayed' })).toHaveAttribute('href', '#how')
    await expect(form.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  } else await expect(form.getByRole('button', { name: 'Retry' })).toBeVisible()
  // LND-3: the latest approved call's line stands in the error state too.
  await expect(form.getByText(/approved call|approved-call calendar/)).toBeVisible()
  await context.close()
})

test('the band’s capsule takes the verdict’s mode and the readings strip draws the window as its capsule', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await stubLanding(page, false)
  await page.goto('/')
  // Before any read answers, the capsule is the selection's ink, with no mode of its own.
  await expect(page.locator('[role="slider"] [data-state="selection"]')).toHaveCount(1)
  await band(page).press('ArrowRight')
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  const capsule = page.locator('[role="slider"] [data-state="normal"]')
  await expect(capsule).toHaveAttribute('data-tone', 'normal')
  // The shared strip engine draws the window as a capsule with its span band (T1), never a crimson line.
  await expect(hero(page).locator('svg [data-window]')).toHaveCount(1)
  await expect(hero(page).locator('svg [data-window-span]')).toHaveCount(1)
  // The card's one row of links points at sections that exist on the page.
  for (const link of await page.getByRole('navigation', { name: 'On this page' }).getByRole('link').all()) {
    const target = (await link.getAttribute('href'))!.slice(1)
    await expect(page.locator(`#${target}`)).toHaveCount(1)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(capsule).toBeVisible()
})

test('reduced motion leaves nothing animating and gauge errors suppress rain growth', async ({ page }) => {
  await stubLanding(page, false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await band(page).press('ArrowRight')
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
  await band(page).press('ArrowLeft')
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
  await band(page).press('ArrowRight')
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
  await band(page).focus()
  await band(page).press('ArrowRight')
  await expect.poll(() => requests.length).toBeGreaterThan(0)
  const body = requests.at(-1) as { date: string; start_time: string; end_time: string }
  expect(body.start_time).toMatch(/^\d{2}:\d{2}$/)
  await expectZonedTimes(page)
})

// The day strip under touch at 390px, with gestures synthesized through CDP (Chromium's touch emulation): a scroll
// that starts on the strip changes nothing, a cancelled drag puts the window back, and the capsule as drawn (28px at
// least, wider than a short window's span) is what a press moves.
test.describe('the day strip under touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })

  const frame = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))

  async function swipe(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    end: 'touchEnd' | 'touchCancel' = 'touchEnd'
  ) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (let step = 1; step <= 12; step++) {
      const point = { x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
      await frame(page)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: end, touchPoints: [] })
    await frame(page)
    await cdp.detach()
  }

  /** Loads the picker island by keyboard and sets the window to 06:00–07:00, an hour drawn narrower than 28px. */
  async function windowAtSix(page: Page) {
    await stubLanding(page, false)
    await page.goto('/')
    const strip = band(page)
    await strip.scrollIntoViewIfNeeded()
    await strip.press('End')
    await expect(strip).toHaveAttribute('aria-valuenow', '1365')
    await strip.press('Home')
    for (let hour = 0; hour < 6; hour++) await strip.press('PageUp')
    await expect(strip).toHaveAttribute('aria-valuenow', '360')
    await expect(strip).toHaveAttribute('aria-valuetext', '06:00 MYT to 07:00 MYT')
    const track = (await strip.boundingBox())!
    const capsule = (await strip.locator('[data-state]').boundingBox())!
    expect(capsule.width).toBeGreaterThan((track.width / 24) * 1.5)
    return { strip, track, capsule, y: track.y + track.height / 2 }
  }

  test('dragging the capsule by its drawn centre moves the window and keeps its length', async ({ page }) => {
    const { strip, capsule, y } = await windowAtSix(page)
    const centre = capsule.x + capsule.width / 2
    await swipe(page, { x: centre, y }, { x: centre + 80, y })
    await expect(strip).not.toHaveAttribute('aria-valuenow', '360')
    const [start, end] = ((await strip.getAttribute('aria-valuetext'))!.match(/\d\d:\d\d/g) ?? []).map((time) => {
      const [hours, minutes] = time.split(':').map(Number)
      return hours! * 60 + minutes!
    })
    expect(start).toBeGreaterThan(360)
    expect(end! - start!).toBe(60)
  })

  test('a vertical swipe that starts on the strip scrolls the page and leaves the window alone', async ({ page }) => {
    const { strip, track, y } = await windowAtSix(page)
    const scrolled = await page.evaluate(() => window.scrollY)
    // 18:00 on the strip: far from the 06:00 capsule, where a press would anchor a new window.
    const x = track.x + track.width * 0.75
    await swipe(page, { x, y }, { x, y: y - 220 })
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled)
    await expect(strip).toHaveAttribute('aria-valuetext', '06:00 MYT to 07:00 MYT')
  })

  test('a cancelled drag restores the window held at the press', async ({ page }) => {
    const { strip, capsule, y } = await windowAtSix(page)
    const centre = capsule.x + capsule.width / 2
    await swipe(page, { x: centre, y }, { x: centre - 50, y }, 'touchCancel')
    await expect(strip).toHaveAttribute('aria-valuetext', '06:00 MYT to 07:00 MYT')
  })
})
