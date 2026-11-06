// D40: the beacon sends spec §2's vital body to /e, by route group, with sendBeacon.
import type { VitalBody } from '@skyclause/contracts'
import { expect, test, type Page } from '@playwright/test'

/** Every beacon to /e, with the path of the page that sent it (its Referer). */
function beacons(page: Page) {
  const sent: Array<{ from: string; body: VitalBody }> = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/e') {
      const from = new URL(request.headers()['referer'] ?? 'about:blank').pathname
      sent.push({ from, body: JSON.parse(request.postData() ?? 'null') as VitalBody })
    }
  })
  return sent
}

/** web-vitals reports LCP, CLS and INP when the page is hidden; Playwright pages never hide on their own. */
async function visitAndHide(page: Page, path: string) {
  await page.goto(path)
  await page.getByRole('heading', { level: 1 }).click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const GROUPED = '/quality-planted/vitals'

test('a page in a route group beacons LCP, CLS, FCP and TTFB as {type, metric, value, route_group}', async ({
  page
}) => {
  const sent = beacons(page)
  await visitAndHide(page, GROUPED)
  await expect
    .poll(() => sent.map(({ body }) => body.metric).sort())
    .toEqual(expect.arrayContaining(['CLS', 'FCP', 'LCP', 'TTFB']))
  for (const { body } of sent) {
    expect(body).toEqual({ type: 'vital', metric: body.metric, value: expect.any(Number), route_group: 'marketing' })
  }
})

test('a page outside the route groups sends no vitals, since it has no route_group', async ({ page }) => {
  const sent = beacons(page)
  await visitAndHide(page, '/_test/tokens')
  // The grouped page's beacons arrive after any the landing page would have sent.
  await visitAndHide(page, GROUPED)
  await expect.poll(() => sent.some(({ from }) => from === GROUPED)).toBe(true)
  expect(sent.filter(({ from }) => from !== GROUPED)).toEqual([])
})

test('the landing page beacons its marketing route group', async ({ page }) => {
  const sent = beacons(page)
  await visitAndHide(page, '/')
  await expect.poll(() => sent.some(({ body }) => body.metric === 'LCP')).toBe(true)
  expect(sent.every(({ body }) => body.route_group === 'marketing')).toBe(true)
})
