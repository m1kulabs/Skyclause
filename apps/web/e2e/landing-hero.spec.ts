import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test, blockingViolations } from './fixtures'
import { expectZonedTimes } from './harness/expect-zoned-times'
import {
  API,
  EVALUATE,
  MARKETING,
  NOT_BUILT,
  routeProductionHosts,
  startMultiHostServer,
  startStandInApi,
  type Answer,
  type StandInApi
} from './harness/hero-hosts'

// The hero on a production-style build (harness/hero-hosts.ts): the built server in HOST_MODE=multi with production's
// origins, the page on the marketing host, and a stand-in for the public API whose answers each test sets. The
// server's first read and the browser's later ones are told apart, so each state is proven at the boundary.

const port = Number(process.env.E2E_PORT ?? 3100) + 4
const JPS = 'https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75'
const REPLAY_LEAD =
  'Live verdicts for the window you pick are not open yet, so this is 2 November, replayed from the JPS gauge’s readings.'
const CLOSED = 'Its live verdict opens later; the replay above shows a window that got a call.'
/** The picker's line naming the chosen window, in the replay's own format ("Saturday 14 November 2026"). */
const windowLine = (start: string, end: string) =>
  new RegExp(
    `^Your window: \\w+day \\d{1,2} \\w+ \\d{4}, ${start} MYT to ${end} MYT\\. ${CLOSED.replace(/[.;]/g, '\\$&')}$`
  )

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

function evaluateDouble(rain = 39) {
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
              { key: 'Storm confirmed', result: 'fired', blocked_by: [], inputs: [inputValue({ value: rain })] },
              { key: 'Flash-flood risk', result: 'not_fired', blocked_by: [], inputs: [inputValue({ value: rain })] },
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

const verdict = (rain = 39): Answer => ({ status: 200, body: evaluateDouble(rain) })

/** Storm confirmed blocked by a stale gauge: No call for it, and no rain value anywhere. */
function blockedVerdict(): Answer {
  const double = evaluateDouble()
  const sky = double.verdicts[0]!
  const blocked = {
    key: 'Storm confirmed',
    result: 'blocked',
    blocked_by: [{ name: 'gauge', source_id: '0232901RF', state: 'stale', since: '2026-11-05T07:00:00.000Z' }],
    inputs: []
  }
  return {
    status: 200,
    body: { ...double, verdicts: [{ ...sky, windows: [{ ...sky.windows[0]!, clauses: [blocked] }] }] }
  }
}

let standIn: StandInApi
let server: Awaited<ReturnType<typeof startMultiHostServer>>

test.beforeAll(async ({ request }) => {
  standIn = await startStandInApi()
  server = await startMultiHostServer(request, port, standIn.origin)
})

test.afterAll(async () => {
  await server?.stop()
  await standIn?.close()
})

test.beforeEach(async ({ page, request }) => {
  standIn.evaluate = { server: NOT_BUILT, browser: NOT_BUILT }
  standIn.log.length = 0
  await routeProductionHosts(page.context(), request, { server: server.origin, standIn: standIn.origin })
})

// A beacon still in flight when a test ends has nowhere to go: let it drop.
test.afterEach(async ({ page }) => {
  await page.context().unrouteAll({ behavior: 'ignoreErrors' })
})

function hero(page: Page) {
  return page.locator('form#window[data-ui]')
}

/** The day strip in the card's stripe band: the window's capsule on 24 hours, the picker's drag and key target. */
function band(page: Page) {
  return page.getByRole('slider', { name: 'Your window on the day' })
}

/** The photograph's bottom edge in page coordinates: it moves when anything under it in the hero changes height. */
function photoBottom(page: Page) {
  return page.evaluate(() =>
    Math.round(document.querySelector('[data-room-capsule]')!.getBoundingClientRect().bottom + window.scrollY)
  )
}

/** Every request the page sends, in order, for the record and for asserting which host was asked. */
function requestLog(page: Page) {
  const log: string[] = []
  page.on('request', (sent) => log.push(`${new Date().toISOString()} ${sent.method()} ${sent.url()}`))
  return log
}

async function keepLog(name: string, lines: string[]) {
  const body = `${lines.join('\n')}\n`
  await writeFile(test.info().outputPath(name), body)
  await test.info().attach(name, { body, contentType: 'text/plain' })
}

test('while live verdicts are not open, the hero answers with the 2 November replay and the browser never asks', async ({
  page,
  expectAxeClean
}) => {
  test.setTimeout(150_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const log = requestLog(page)
  await page.goto(`${MARKETING}/`)
  const form = hero(page)

  // The call leads at the statement step, then what fired on which reading, the label and the replay's own window;
  // one plain sentence says why, last and small.
  await expect(form.locator('[data-statement]')).toHaveText(/^Commute disruption\s+for\sthe 15:30 MYT release wave$/)
  await expect(form.getByText(REPLAY_LEAD)).toBeVisible()
  await expect(form.locator('[data-replay-mark]')).toHaveText('Replay')
  await expect(form.locator('[data-replay-mark]')).toHaveAttribute('data-source', JPS)
  await expect(form.getByText('Monday 2 November 2026, 15:30 MYT to 15:45 MYT')).toBeVisible()
  await expect(form.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await expect(form.locator('[data-pack="sky"] .status-mark')).toHaveText('Commute disruption')
  await expect(form.locator('[data-pack="sky"] .status-mark svg')).toHaveCount(1)
  await expect(form.getByText('Storm confirmed fired')).toBeVisible()
  const gauge = form.locator(`li[data-source="${JPS}"]`)
  await expect(gauge).toContainText('39.0 mm in 60 min')
  await expect(gauge).toContainText('0232901RF')
  await expect(gauge).toContainText('5 min old')
  await expect(gauge.getByRole('link', { name: 'JPS gauge data for gauge 0232901RF, in a new tab' })).toHaveAttribute(
    'href',
    JPS
  )
  // The replay's window is drawn on a dashed strip of its own day, apart from the visitor's.
  await expect(form.locator('[data-replay-band] [data-state="commute_disruption"]')).toBeVisible()
  await expect(form.getByText(/^No approved call yet \(n=0\): /)).toBeVisible()
  // Nothing a visitor would read as a fault: no status code, no "not built", no API, nothing to retry.
  expect(await form.innerText()).not.toMatch(/\b(?:4\d\d|50\d)\b|not built|\bAPI\b|Couldn’t/i)
  await expect(form.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  // The first screen holds the name, the h1 and the whole answer at 1440x900.
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
  expect((await form.boundingBox())!.y + (await form.boundingBox())!.height).toBeLessThanOrEqual(900)
  await expectAxeClean(page)

  // Every control still describes a window: the strip draws it, the line names it, the URL keeps it, and no verdict is
  // asked for.
  const answered = form.locator('[data-window-line]')
  await expect(answered).toHaveAttribute('aria-live', 'polite')
  const verdictCalls = () => log.filter((line) => line.includes(EVALUATE))
  const settled = async () => {
    await page.waitForTimeout(700)
    expect(verdictCalls()).toEqual([])
  }
  const edge = await photoBottom(page)
  const dates = form.locator('label:has(input[name="date"])')
  await dates.nth(1).click()
  await expect(dates.nth(1).locator('input')).toBeChecked()
  const chosen = (await dates.nth(1).locator('input').getAttribute('value'))!
  await expect(answered).toHaveText(new RegExp(`^Your window: \\w+day ${Number(chosen.slice(8))} `))
  await expect(page).toHaveURL(new RegExp(`[?&]date=${chosen}&`))
  await settled()
  await form.getByLabel('Window start').fill('17:30')
  await form.getByLabel('Window start').press('Tab')
  await settled()
  await form.getByLabel('Window end').fill('19:00')
  await form.getByLabel('Window end').press('Tab')
  await expect(band(page)).toHaveAttribute('aria-valuetext', '17:30 MYT to 19:00 MYT')
  await expect(answered).toHaveText(windowLine('17:30', '19:00'))
  await settled()
  await band(page).press('ArrowRight')
  await expect(band(page)).toHaveAttribute('aria-valuetext', '17:45 MYT to 19:15 MYT')
  await expect(answered).toHaveText(windowLine('17:45', '19:15'))
  await expect(page).toHaveURL(new RegExp(`/\\?date=${chosen}&start=17%3A45&end=19%3A15$`))
  await settled()
  const capsule = (await band(page).locator('[data-state]').boundingBox())!
  await page.mouse.move(capsule.x + capsule.width / 2, capsule.y + capsule.height / 2)
  await page.mouse.down()
  await page.mouse.move(capsule.x + capsule.width / 2 + 60, capsule.y + capsule.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(band(page)).not.toHaveAttribute('aria-valuetext', '17:45 MYT to 19:15 MYT')
  await settled()
  await form.getByLabel('Window end').press('Enter')
  await settled()
  await expect(form.getByText(REPLAY_LEAD)).toBeVisible()
  expect(await photoBottom(page)).toBe(edge)
  // A reload, or the link shared, opens the same window, still with the replay and no verdict asked for.
  const kept = (await band(page).getAttribute('aria-valuetext'))!
  await expect(page).toHaveURL(new RegExp(`/\\?date=${chosen}&start=\\d\\d%3A\\d\\d&end=\\d\\d%3A\\d\\d$`))
  await page.reload()
  await expect(dates.nth(1).locator('input')).toBeChecked()
  await expect(band(page)).toHaveAttribute('aria-valuetext', kept)
  const [start, end] = kept.match(/\d\d:\d\d/g)!
  await expect(answered).toHaveText(windowLine(start!, end!))
  await expect(form.getByText(REPLAY_LEAD)).toBeVisible()

  // A minute of idling runs no refresh either.
  await page.waitForTimeout(61_000)
  expect(verdictCalls()).toEqual([])
  expect(log.filter((line) => line.includes(`${MARKETING}/v1/`))).toEqual([])
  expect(standIn.log.filter((entry) => entry.caller === 'browser')).toEqual([])
  // The server asked once per page load (first paint and the reload; this harness shares no reads) and drew the
  // replay from each 501.
  expect(standIn.log.filter((entry) => entry.caller === 'server' && entry.path === EVALUATE)).toHaveLength(2)
  await keepLog('requests-unavailable.log', [
    ...log,
    '--- stand-in API',
    ...standIn.log.map((entry) => `${entry.caller} ${entry.method} ${entry.path}`)
  ])
})

test('when live verdicts are open, the browser asks the API host itself and the verdict renders', async ({ page }) => {
  standIn.evaluate = { server: verdict(39), browser: verdict(42.5) }
  const log = requestLog(page)
  await page.goto(`${MARKETING}/`)
  const form = hero(page)
  const gauge = form.locator('li[data-source="https://example.com/gauge"]')
  await expect(gauge).toContainText('39.0 mm')
  const asked = page.waitForRequest((sent) => sent.url().endsWith(EVALUATE) && sent.method() === 'POST')
  await band(page).press('ArrowRight')
  const sent = await asked
  // Straight to the API origin the server handed down (CORS *), never the marketing host.
  expect(sent.url()).toBe(`${API}${EVALUATE}`)
  expect(sent.postDataJSON()).toMatchObject({ start_time: expect.stringMatching(/^\d{2}:\d{2}$/) })
  await expect(gauge).toContainText('42.5 mm')
  await expect(form.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  expect(log.filter((line) => line.includes(`${MARKETING}/v1/`))).toEqual([])
  expect(standIn.log.filter((entry) => entry.caller === 'browser' && entry.method === 'POST')).toHaveLength(1)
  await expectZonedTimes(page)
  await keepLog('requests-open.log', log)
})

test('the API host answers a cross-origin verdict read with CORS *, and the landing’s CSP lets the browser connect', async ({
  request
}) => {
  const visitor = `2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`
  const preflight = await request.fetch(`${server.origin}${EVALUATE}`, {
    method: 'OPTIONS',
    headers: {
      host: 'api.skyclause.m1ku.tech',
      origin: MARKETING,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'accept,content-type',
      'x-forwarded-for': visitor
    }
  })
  expect(preflight.status()).toBe(204)
  expect(preflight.headers()['access-control-allow-origin']).toBe('*')
  const answer = await request.post(`${server.origin}${EVALUATE}`, {
    headers: { host: 'api.skyclause.m1ku.tech', origin: MARKETING, 'x-forwarded-for': visitor },
    data: { date: '2026-11-14', start_time: '17:30', end_time: '19:00' }
  })
  expect(answer.headers()['access-control-allow-origin']).toBe('*')
  const landing = await request.get(`${server.origin}/`, { headers: { host: 'skyclause.m1ku.tech' } })
  expect(landing.headers()['content-security-policy']).toMatch(
    /connect-src 'self'[^;]* https:\/\/api\.skyclause\.m1ku\.tech/
  )
})

test('a real failure says so in words with Retry, a rate limit says when to try again, and the hero holds still', async ({
  page
}) => {
  standIn.evaluate = { server: verdict(), browser: { status: 503, body: { title: 'Unavailable', status: 503 } } }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${MARKETING}/`)
  const form = hero(page)
  await expect(form.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  const edge = await photoBottom(page)
  await band(page).press('ArrowRight')
  await expect(form.getByText('Couldn’t reach the live verdict just now.')).toBeVisible()
  await expect(form.getByText(/^Last tried at \d\d:\d\d MYT\.$/)).toBeVisible()
  expect(await form.innerText()).not.toMatch(/\b503\b/)
  expect(await photoBottom(page)).toBe(edge)
  standIn.evaluate.browser = {
    status: 429,
    headers: { 'retry-after': '120' },
    body: { title: 'Too many', status: 429 }
  }
  await form.getByRole('button', { name: 'Retry' }).click()
  await expect(form.getByText('Live verdicts are busy just now.')).toBeVisible()
  await expect(form.getByText(/^Try again after \d\d:\d\d MYT\.$/)).toBeVisible()
  await expect(form.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(await form.innerText()).not.toMatch(/\b429\b/)
  expect(await photoBottom(page)).toBe(edge)
})

test('without JavaScript the window form draws the chosen window and answers with the same replay', async ({
  browser,
  request
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  await routeProductionHosts(context, request, { server: server.origin, standIn: standIn.origin })
  const page = await context.newPage()
  await page.goto(`${MARKETING}/`)
  const form = hero(page)
  await expect(form.getByText(REPLAY_LEAD)).toBeVisible()
  const date = form.locator('label:has(input[name="date"])').nth(1)
  await date.click()
  await form.getByLabel('Window start').fill('17:30')
  await form.getByLabel('Window end').fill('19:00')
  await form.getByRole('button', { name: 'Check this window' }).click()
  await expect(page).toHaveURL(/[?&]start=17%3A30/)
  await expect(form.getByLabel('Window start')).toHaveValue('17:30')
  await expect(form.getByLabel('Window end')).toHaveValue('19:00')
  await expect(band(page)).toHaveAttribute('aria-valuetext', '17:30 MYT to 19:00 MYT')
  await expect(form.locator('[data-window-line]')).toHaveText(windowLine('17:30', '19:00'))
  await expect(form.getByText(REPLAY_LEAD)).toBeVisible()
  await expect(form.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  expect(await form.innerText()).not.toMatch(/\b(?:4\d\d|50\d)\b|not built|\bAPI\b|Couldn’t/i)
  expect(standIn.log.filter((entry) => entry.caller === 'browser')).toEqual([])
  await context.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})

test('LND-1 hero renders the live verdict with at least five inputs, ages and sources', async ({
  page,
  expectAxeClean
}) => {
  standIn.evaluate = { server: verdict(), browser: verdict() }
  await page.goto(`${MARKETING}/`)
  const picker = hero(page)
  await band(page).press('ArrowRight')
  await expect(picker.getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await expect(picker.getByText('5 min old').first()).toBeVisible()
  // PILOT_PROJECT is unset here, so the hero reads n=0 in its sentence; the latest call's date is a unit test.
  await expect(picker.getByText(/^No approved call yet \(n=0\): /)).toBeVisible()
  const station = picker.locator('li[data-source="https://example.com/gauge"]')
  await expect(station).toContainText('0232901RF')
  expect(await picker.locator('li[data-source]').count()).toBeGreaterThanOrEqual(5)
  await expectZonedTimes(page)
  await expectAxeClean(page)
})

test('the band’s capsule takes the verdict’s mode and the readings strip draws the window as its capsule', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  // With no verdict to read, the capsule is the selection's ink, with no mode of its own.
  await page.goto(`${MARKETING}/`)
  await expect(page.locator('[role="slider"] [data-state="selection"]')).toHaveCount(1)
  standIn.evaluate = { server: verdict(), browser: verdict() }
  await page.reload()
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
  standIn.evaluate = { server: verdict(), browser: verdict() }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${MARKETING}/`)
  await band(page).press('ArrowRight')
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0)
  // With the gauge erroring, paths carry no growth animation.
  standIn.evaluate.browser = blockedVerdict()
  await band(page).press('ArrowLeft')
  await expect(
    hero(page).getByText('No call for Storm confirmed: gauge 0232901RF silent since 15:00 MYT')
  ).toBeVisible()
  const blockedAnimated = await page.evaluate(() =>
    [...document.querySelectorAll('[data-rain-animated]')].map((el) => el.getAttribute('data-rain-animated'))
  )
  expect(blockedAnimated).toContain('no')
})

test('expectAxeClean covers the replay, a verdict and a failure at both widths', async ({ page, expectAxeClean }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${MARKETING}/`)
  await expect(hero(page).getByText(REPLAY_LEAD)).toBeVisible()
  expect((await blockingViolations(page)).length).toBe(0)
  standIn.evaluate = { server: verdict(), browser: { status: 503, body: { status: 503 } } }
  await page.reload()
  await expect(hero(page).getByText('Clause engine verdict: not reviewed, not sent')).toBeVisible()
  expect((await blockingViolations(page)).length).toBe(0)
  await band(page).press('ArrowRight')
  await expect(hero(page).getByText('Couldn’t reach the live verdict just now.')).toBeVisible()
  expect((await blockingViolations(page)).length).toBe(0)
  await page.setViewportSize({ width: 375, height: 812 })
  expect((await blockingViolations(page)).length).toBe(0)
  await page.setViewportSize({ width: 320, height: 640 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
  ).toBe(true)
  await expectAxeClean(page)
})

// P2-1: a phone's first screen holds the headline, its sentence, the one action and the call with its window; the
// photograph comes last, shorter, and an answered change never moves it.
for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 }
]) {
  test(`on a ${viewport.width}x${viewport.height} phone the first screen holds the headline, Sign in and the call`, async ({
    page
  }) => {
    await page.setViewportSize(viewport)
    await page.goto(`${MARKETING}/`)
    const firstScreen = [
      page.getByRole('heading', { level: 1 }),
      page.getByText(/^Skyclause reads the rain gauge/),
      page.locator('section[aria-labelledby="hero-title"]').getByRole('link', { name: 'Sign in' }),
      hero(page).locator('[data-statement]')
    ]
    for (const part of firstScreen) {
      const box = (await part.boundingBox())!
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
    const edge = await photoBottom(page)
    await hero(page).locator('label:has(input[name="date"])').nth(2).click()
    await expect(hero(page).locator('[data-window-line]')).toHaveText(/^Your window: /)
    await band(page).press('PageUp')
    await page.waitForTimeout(400)
    expect(await photoBottom(page)).toBe(edge)
  })
}

// P2-2: Tab walks the hero in the order it reads at every width: the action and the section links, the answer's source,
// the strip, the chosen date, the times, then the photographs' pause last. No tabindex reorders it.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]) {
  test(`at ${viewport.width}px Tab walks the hero in reading order, the photographs' pause last`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto(`${MARKETING}/`)
    const section = page.locator('section[aria-labelledby="hero-title"]')
    expect(await section.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count()).toBe(0)
    await section.getByRole('link', { name: 'Sign in' }).focus()
    const stops: string[] = []
    for (let step = 0; step < 12; step++) {
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const inHero = !!el.closest('section[aria-labelledby="hero-title"]')
        const name =
          el.getAttribute('aria-label') ?? (el.closest('label') as HTMLElement | null)?.innerText ?? el.innerText
        return inHero ? name.trim().split('\n')[0]! : null
      })
      if (!stop) break
      stops.push(stop)
      await page.keyboard.press('Tab')
    }
    const chosenDate = (await section.locator('label:has(input[name="date"]:checked)').innerText()).trim()
    expect(stops).toEqual([
      'Sign in',
      'How it works',
      'The record',
      'Prices',
      'JPS gauge data for gauge 0232901RF, in a new tab',
      'Your window on the day',
      chosenDate,
      'Window start',
      'Window end',
      'Pause the photographs'
    ])
  })
}

// The day strip under touch at 390px, with gestures synthesized through CDP (Chromium's touch emulation): a scroll
// that starts on the strip changes nothing, a cancelled drag puts the window back, and the capsule as drawn (28px at
// least, wider than a short window's span) is what a press moves. Live verdicts are not open here, as in production
// today: the strip works the same either way.
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
    await page.goto(`${MARKETING}/`)
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
