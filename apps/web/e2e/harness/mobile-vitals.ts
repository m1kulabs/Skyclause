// NFR-9 in the lab (#116): a page against the production build, throttled like Lighthouse's mobile profile. LCP and
// CLS come from the page's own /e beacons, INP from Event Timing around one interaction.
import { expect, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

type Vitals = Record<'LCP' | 'INP' | 'CLS', number>

/** One fresh, throttled visit; `visit` stubs the reads, opens the page and makes one interaction. */
async function measure(context: BrowserContext, visit: (page: Page) => Promise<void>): Promise<Vitals> {
  const page = await context.newPage()
  try {
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
      Object.assign(window, { labInteractionDurations: durations })
    })
    await visit(page)
    await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // At fewer than 50 interactions, INP is the longest interaction. Read Event Timing at 16ms
    // resolution; the field beacon's 40ms threshold can omit fast interactions in Chromium.
    const interactions = () =>
      page.evaluate(() => (window as unknown as { labInteractionDurations: number[] }).labInteractionDurations)
    await expect.poll(async () => (await interactions()).length).toBeGreaterThan(0)
    vitals.INP = Math.max(...(await interactions()))
    await expect.poll(() => Object.keys(vitals).sort()).toEqual(['CLS', 'INP', 'LCP'])
    return vitals as Vitals
  } finally {
    await page.close()
  }
}

/**
 * Matches lighthouserc.json: three fresh visits, median aggregation, against NFR-9's LCP 2.5 s, INP 200 ms and
 * CLS 0.1. Attaches every run as `<name>-vitals`.
 */
export async function expectMobileVitals(
  context: BrowserContext,
  testInfo: TestInfo,
  name: string,
  visit: (page: Page) => Promise<void>
) {
  const runs: Vitals[] = []
  for (let index = 0; index < 3; index++) runs.push(await measure(context, visit))
  const median = (key: keyof Vitals) => runs.map((run) => run[key]).sort((a, b) => a - b)[1]!
  const result = { LCP: median('LCP'), INP: median('INP'), CLS: median('CLS') }
  await testInfo.attach(`${name}-vitals`, {
    body: JSON.stringify({ runs, median: result }, null, 2),
    contentType: 'application/json'
  })
  console.info(`${name} vitals (median of 3):`, result)
  expect(result.LCP).toBeLessThanOrEqual(2500)
  expect(result.INP).toBeLessThanOrEqual(200)
  expect(result.CLS).toBeLessThanOrEqual(0.1)
}
