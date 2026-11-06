import type { BrowserContext } from '@playwright/test'
import { test, expect } from '../fixtures'
import { ids, prepare, open, callDouble, bundleDouble, t } from './doubles'

async function measure(context: BrowserContext) {
  const page = await context.newPage()
  try {
    await prepare(page, bundleDouble([callDouble(ids.first, { expires_at: '2099-11-02T07:45:00Z' })]), { clock: false })
    await page.setViewportSize({ width: 375, height: 812 })
    const cdp = await context.newCDPSession(page)
    // #116's Lighthouse mobile profile: 4x CPU, 150ms RTT, about 1.6 Mbps.
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1638.4 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8
    })
    const vitals: Record<string, number> = {}
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/e') {
        const body = request.postDataJSON()
        if (['LCP', 'CLS'].includes(body.metric)) vitals[body.metric] = body.value
      }
    })
    await page.route('**/e', (route) => route.fulfill({ status: 204 }))
    await page.addInitScript(() => {
      const durations: number[] = []
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if ('interactionId' in entry && entry.interactionId) durations.push(entry.duration)
      })
      observer.observe({ type: 'event', buffered: true, durationThreshold: 16 })
      Object.assign(window, { bundleInteractionDurations: durations })
    })
    await open(page)
    await page.locator('.bundle-call-list').getByRole('button', { name: /^Edit/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t('cancel'), exact: true })
      .press('Enter')
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // At fewer than 50 interactions, INP is the longest interaction. Read Event Timing at 16ms
    // resolution; the field beacon's 40ms threshold can omit fast interactions in Chromium.
    const interactions = () =>
      page.evaluate(() => (window as unknown as { bundleInteractionDurations: number[] }).bundleInteractionDurations)
    await expect.poll(async () => (await interactions()).length).toBeGreaterThan(0)
    vitals.INP = Math.max(...(await interactions()))
    await expect.poll(() => Object.keys(vitals).sort()).toEqual(['CLS', 'INP', 'LCP'])
    return vitals
  } finally {
    await page.close()
  }
}

test('NFR-9 mobile bundle meets LCP, INP and CLS budgets against the production build', async ({
  context
}, testInfo) => {
  test.setTimeout(90_000)
  // Match lighthouserc.json: three fresh navigations, median aggregation. This project runs
  // after the functional projects so parallel axe work cannot consume the throttled CPU.
  const runs: Array<Record<string, number>> = []
  for (let index = 0; index < 3; index++) runs.push(await measure(context))
  const median = (key: string) => runs.map((run) => run[key]!).sort((a, b) => a - b)[1]!
  const result = { LCP: median('LCP'), INP: median('INP'), CLS: median('CLS') }
  await testInfo.attach('bundle-mobile-vitals', {
    body: JSON.stringify({ runs, median: result }, null, 2),
    contentType: 'application/json'
  })
  console.info('Bundle mobile vitals (median of 3):', result)
  expect(result.LCP).toBeLessThanOrEqual(2500)
  expect(result.INP).toBeLessThanOrEqual(200)
  expect(result.CLS).toBeLessThanOrEqual(0.1)
})
